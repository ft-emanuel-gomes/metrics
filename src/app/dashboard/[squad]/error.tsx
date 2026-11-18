"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[Dashboard Error]", error);
  }, [error]);

  function handleRetry() {
    // Forçar reload completo da página (limpa qualquer cache do Next.js)
    window.location.reload();
  }

  return (
    <main className="min-h-screen p-6 lg:p-8 flex items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-4 text-4xl">⚠️</div>

        <h2 className="text-lg font-bold text-[color:var(--ds-color-content-title)] mb-2">
          Erro ao carregar o dashboard
        </h2>

        <p className="text-sm text-[color:var(--ds-color-content-caption)] mb-2">
          O carregamento pode levar até 15 segundos na primeira vez (dados do Jira).
          Clique em recarregar para tentar novamente.
        </p>

        <p className="text-[9px] text-[color:var(--ds-color-content-subdued)] mb-6">
          {error.message || "Erro inesperado"}
        </p>

        <div className="flex justify-center gap-3">
          <button
            onClick={handleRetry}
            className="ds-btn ds-btn-primary ds-btn-small"
          >
            Recarregar página
          </button>
          <a
            href="/"
            className="ds-btn ds-btn-secondary ds-btn-small"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </main>
  );
}
