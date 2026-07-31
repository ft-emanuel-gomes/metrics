"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

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
        // Login bem-sucedido — redirecionar para home
        router.push("/");
        router.refresh();
      } else {
        setStatus("error");
        setErrorMessage(data.message || "Erro ao autenticar.");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Falha na conexão com o servidor.");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Card de login */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
          {/* Logo dentro do card — centralizado */}
          <Image
            src="/images/logo-montebravo-center.svg"
            alt="Monte Bravo"
            width={180}
            height={40}
            className="h-9 w-auto block mx-auto mb-2"
          />
          <p className="text-sm text-gray-400 mb-6">
            Métricas Ágeis
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label htmlFor="email" className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.nome@montebravo.com.br"
                disabled={status === "loading"}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition"
                autoComplete="email"
                autoFocus
              />
            </div>

            {errorMessage && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] text-red-400">
                {errorMessage}
              </div>
            )}

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
