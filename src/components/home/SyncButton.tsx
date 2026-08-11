"use client";

import { useState } from "react";

export default function SyncButton() {
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSync() {
    setStatus("syncing");
    setMessage("");

    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        setStatus("done");
        const seconds = Math.round(data.durationMs / 1000);
        setMessage(`${data.message} (${seconds}s)`);
        // Recarregar a página após 2s para atualizar os indicadores
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setStatus("error");
        setMessage(data.message || "Erro ao sincronizar");
      }
    } catch {
      setStatus("error");
      setMessage("Falha na conexão com o servidor");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={status === "syncing"}
        className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
          status === "syncing"
            ? "cursor-wait"
            : "hover:opacity-80"
        }`}
        style={{ backgroundColor: "var(--accent-bg)", color: "var(--accent)" }}
      >
        {status === "syncing" ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
            Sincronizando...
          </>
        ) : (
          <>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Update
          </>
        )}
      </button>

      {message && (
        <span className={`text-[10px] ${status === "done" ? "text-emerald-400" : "text-red-400"}`}>
          {message}
        </span>
      )}
    </div>
  );
}
