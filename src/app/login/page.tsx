"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ThemedLogo from "@/components/ui/ThemedLogo";
import Image from "next/image";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: "Autenticação cancelada.",
  no_code: "Código de autorização não recebido.",
  config: "OAuth não configurado. Contate o administrador.",
  token_exchange: "Falha na autenticação com a Atlassian.",
  user_fetch: "Não foi possível obter dados do usuário.",
  no_email: "Email não encontrado na conta Atlassian.",
  no_permissions: "Usuário sem permissão em nenhum projeto.",
  no_squads: "Usuário sem acesso a nenhuma squad.",
  state_mismatch: "Sessão de login inválida. Tente novamente.",
  internal: "Erro interno. Tente novamente.",
};

export default function LoginPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");
  const expired = searchParams.get("expired");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState(
    error ? ERROR_MESSAGES[error] || "Erro desconhecido." : ""
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Se sessão expirou, tentar refresh silencioso (mesmo usuário)
  useEffect(() => {
    if (expired === "true" && !isRefreshing) {
      setIsRefreshing(true);
      fetch("/api/auth/refresh", { method: "POST" })
        .then((res) => {
          if (res.ok) {
            router.push("/");
            router.refresh();
          } else {
            setIsRefreshing(false);
          }
        })
        .catch(() => setIsRefreshing(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      setErrorMessage("Informe seu email corporativo.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Consentimento já existe no S3 → login direto
        router.push("/");
        router.refresh();
      } else if (data.needsOAuth) {
        // Sem consentimento → redirecionar para OAuth (login + consentimento)
        window.location.href = "/api/auth/authorize";
      } else {
        setStatus("error");
        setErrorMessage(data.message || "Erro ao autenticar.");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Falha na conexão com o servidor.");
    }
  }

  if (isRefreshing) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          <span className="h-4 w-4 animate-spin rounded-full border-2" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
          Renovando sessão...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Card de login */}
        <div className="ds-card text-center" style={{ padding: "var(--ds-space-xxl)" }}>
          {/* Logo */}
          <ThemedLogo
            src="/images/logo-montebravo-center.svg"
            alt="Monte Bravo"
            width={180}
            height={40}
            className="h-9 w-auto block mx-auto mb-2"
          />
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Métricas Ágeis
          </p>

          {/* Erro */}
          {errorMessage && (
            <div className="ds-alert-negative mb-4">
              {errorMessage}
            </div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label htmlFor="email" className="ds-label">
                Email corporativo
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.nome@montebravo.com.br"
                disabled={status === "loading"}
                className="ds-input"
                autoComplete="email"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={status === "loading"}
              className="ds-btn ds-btn-primary ds-btn-large w-full"
            >
              {status === "loading" ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Verificando...
                </span>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
          Acesso restrito a colaboradores Monte Bravo.
        </p>
      </div>
    </main>
  );
}
