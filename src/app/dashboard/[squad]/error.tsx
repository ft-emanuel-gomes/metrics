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

        <h2 className="text-lg font-bold text-white mb-2">
          Erro ao carregar o dashboard
        </h2>

        <p className="text-sm text-gray-400 mb-2">
          O carregamento pode levar até 15 segundos na primeira vez (dados do Jira).
          Clique em recarregar para tentar novamente.
        </p>

        <p className="text-[9px] text-gray-600 mb-6">
          {error.message || "Erro inesperado"}
        </p>

        <div className="flex justify-center gap-3">
          <button
            onClick={handleRetry}
            className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
          >
            Recarregar página
          </button>
          <a
            href="/"
            className="rounded-md bg-white/10 px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-white/15 transition"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </main>
  );
}
