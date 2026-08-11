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
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Renovando sessão...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Card de login */}
        <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "var(--bg-card)", border: "0.5px solid var(--border-primary)" }}>
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
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] text-red-400">
              {errorMessage}
            </div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label htmlFor="email" className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Email corporativo
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.nome@montebravo.com.br"
                disabled={status === "loading"}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition"
                style={{ backgroundColor: "var(--bg-secondary)", border: "0.5px solid var(--border-primary)", color: "var(--text-primary)" }}
                autoComplete="email"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={status === "loading"}
              className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                status === "loading"
                  ? "bg-indigo-500/30 text-indigo-300 cursor-wait"
                  : "bg-indigo-500 text-white hover:bg-indigo-600"
              }`}
            >
              {status === "loading" ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Verificando...
                </span>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[10px] text-gray-600">
          Acesso restrito a colaboradores Monte Bravo.
        </p>
      </div>
    </main>
  );
}
