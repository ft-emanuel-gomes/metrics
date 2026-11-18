/**
 * Geração do PDF do dashboard no servidor (Puppeteer).
 *
 * O PDF é a impressão do PRÓPRIO dashboard (/dashboard/[squad]), com a sessão do usuário,
 * os mesmos filtros e o mesmo tema. Assim o PDF tem sempre os mesmos gráficos e números da tela,
 * sem um relatório paralelo para manter. O CSS de impressão (globals.css, @media print) esconde
 * menu lateral, seletores e botões.
 */

/** Chrome indisponível no servidor (não instalado ou sem bibliotecas do sistema). */
export class PdfRendererUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Gerador de PDF indisponível no servidor: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "PdfRendererUnavailableError";
  }
}

/** A página do dashboard não carregou (sessão expirada, erro de dados, etc.). */
export class PdfRenderError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "PdfRenderError";
  }
}

export interface RenderDashboardPdfOptions {
  squadSlug: string;
  /** Filtros do dashboard já validados (sprints, months, issueType). */
  query: URLSearchParams;
  /** Cookie de sessão do próprio usuário (auth-token). */
  authToken: string;
  theme: "light" | "dark";
}

// A4 paisagem com 8mm de margem: 297mm - 16mm = 281mm ≈ 1062px a 96dpi.
// Com scale 0.75 o layout é calculado em ~1416px: largura de desktop (grid de 2 colunas do dashboard).
const PDF_SCALE = 0.75;
const PRINT_WIDTH_PX = Math.round(1062 / PDF_SCALE);
const NAV_TIMEOUT_MS = 90_000;

function internalBaseUrl(): string {
  // O servidor imprime a si mesmo pela rede local (não passa pelo CloudFront)
  return process.env.PDF_INTERNAL_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

export async function renderDashboardPdf(opts: RenderDashboardPdfOptions): Promise<Buffer> {
  let browser: import("puppeteer").Browser;
  try {
    const puppeteer = (await import("puppeteer")).default;
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (error) {
    throw new PdfRendererUnavailableError(error);
  }

  try {
    const base = internalBaseUrl();
    const page = await browser.newPage();
    await page.setViewport({ width: PRINT_WIDTH_PX, height: 1000 });
    await page.setCookie({ name: "auth-token", value: opts.authToken, url: base, httpOnly: true });
    // Tema do PDF = tema que o usuário está vendo (o layout lê o localStorage antes de pintar)
    await page.evaluateOnNewDocument((theme: string) => {
      try {
        localStorage.setItem("theme", theme);
      } catch {
        /* sem storage: segue o tema padrão */
      }
    }, opts.theme);

    const qs = opts.query.toString();
    const url = `${base}/dashboard/${encodeURIComponent(opts.squadSlug)}${qs ? `?${qs}` : ""}`;
    // networkidle0: espera também o burndown, que é buscado em tempo real pelo navegador
    await page.goto(url, { waitUntil: "networkidle0", timeout: NAV_TIMEOUT_MS });

    if (new URL(page.url()).pathname.startsWith("/login")) {
      throw new PdfRenderError("Sessão expirada. Faça login novamente.", 401);
    }
    const pageError = await page.evaluate(() => {
      const text = document.body.innerText || "";
      return text.includes("Erro ao carregar o dashboard") ? text.slice(0, 400) : null;
    });
    if (pageError) {
      throw new PdfRenderError("O dashboard não carregou. Tente novamente em instantes.", 502);
    }

    // Gráficos (Recharts) desenham depois da hidratação: espera o primeiro e dá folga para os demais
    await page.waitForSelector(".recharts-wrapper", { timeout: 15_000 }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      scale: PDF_SCALE,
      margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
