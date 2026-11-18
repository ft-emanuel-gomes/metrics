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
        className={`ds-btn ds-btn-primary ds-btn-small ${status === "syncing" ? "cursor-wait" : ""}`}
      >
        {status === "syncing" ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
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
        <span
          className="text-[11px]"
          style={{ color: status === "done" ? "var(--ds-color-content-positive)" : "var(--ds-color-content-negative)" }}
        >
          {message}
        </span>
      )}
    </div>
  );
}
