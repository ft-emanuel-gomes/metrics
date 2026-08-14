"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "assistant" | "user";
  content: string;
}

const SQUADS = [
  { slug: "custodia", name: "Squad Custódia" },
  { slug: "consolidacao", name: "Squad Consolidação" },
  { slug: "lifecycle", name: "Squad LifeCycle" },
  { slug: "inteligencia", name: "Squad Inteligência" },
  { slug: "riscos", name: "Squad Riscos" },
  { slug: "renda-variavel", name: "Squad Renda Variável" },
  { slug: "experiencia", name: "Squad Experiência Digital" },
  { slug: "assessoria", name: "Squad Assessoria" },
  { slug: "renda-fixa", name: "Squad Renda Fixa" },
];

export default function AiAgilistaChat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Bom dia Agilista, como posso lhe ajudar hoje em suas dailies?" },
  ]);
  const [input, setInput] = useState("");
  const [selectedSquad, setSelectedSquad] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai-agilista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, squad: selectedSquad || undefined }),
      });

      const data = await res.json();

      if (res.ok && data.response) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: `Erro: ${data.error || "Falha na comunicação."}` }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Erro: Falha na conexão com o servidor." }]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="theme-modal rounded-2xl w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl shadow-violet-500/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--border-primary)" }}>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
              AI
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Agile IA</h2>
              <p className="text-[10px] text-gray-500">Especialista em fluxo de trabalho</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedSquad}
              onChange={(e) => {
                setSelectedSquad(e.target.value);
                // Pré-preencher mensagem ao selecionar squad
                if (e.target.value) {
                  const squadName = SQUADS.find((s) => s.slug === e.target.value)?.name || "";
                  setInput(`Analise o fluxo da ${squadName} para a daily de hoje.`);
                }
              }}
              className="rounded-lg px-2 py-1 text-[10px] outline-none theme-input"
            >
              <option value="">Todas as squads</option>
              {SQUADS.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </select>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-indigo-500/20 text-indigo-100"
                    : "bg-white/5 text-gray-200"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-400 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: "0.2s" }} />
                <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: "0.4s" }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-3 border-t" style={{ borderColor: "var(--border-primary)" }}>
          <div className="flex items-center gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ex: Analise o fluxo da Squad Custódia para a daily de hoje..."
              rows={1}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm placeholder-gray-500 outline-none resize-none theme-input"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-40"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
