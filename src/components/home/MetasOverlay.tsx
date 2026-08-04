"use client";

import { useState } from "react";

const METAS = [
  { metric: "Cycle Time P85", target: "≤ 15 dias", rule: "Menor ou igual a 15 dias" },
  { metric: "Transbordo", target: "≤ 20%", rule: "Menor ou igual a 20%" },
  { metric: "Eficiência de Fluxo", target: "≥ 60%", rule: "Maior ou igual a 60%" },
  { metric: "Ocupação", target: "≥ 80%", rule: "Maior ou igual a 80%" },
  { metric: "WIP Aging (>10d)", target: "≤ 10 dias", rule: "Menor ou igual a 10 dias" },
  { metric: "Bugs", target: "≤ 1 item", rule: "Menor ou igual a 1 bug concluído no período" },
];

const TRAFFIC_LIGHT_RULES = [
  { color: "bg-emerald-500", label: "Verde", rule: "Até 1 métrica abaixo da meta" },
  { color: "bg-amber-400", label: "Amarelo", rule: "Até 2 métricas abaixo da meta" },
  { color: "bg-red-500", label: "Vermelho", rule: "3 ou mais métricas abaixo da meta" },
];

export default function MetasOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition"
        title="Metas e Sinaleiros"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        FAQ
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setIsOpen(false)}>
          <div
            className="bg-gray-900 border border-white/10 rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white">
                Metas e Sinaleiros
              </h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white text-lg">✕</button>
            </div>

            {/* Regras do sinaleiro */}
            <div className="mb-5 flex flex-wrap gap-4">
              {TRAFFIC_LIGHT_RULES.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${item.color}`} />
                  <span className="text-[11px] text-gray-300">
                    <strong className="text-white">{item.label}:</strong> {item.rule}
                  </span>
                </div>
              ))}
            </div>

            {/* Tabela de metas */}
            <div className="overflow-hidden rounded-lg border border-white/5">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/5">
                    <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Métrica</th>
                    <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Meta</th>
                    <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Regra</th>
                  </tr>
                </thead>
                <tbody>
                  {METAS.map((meta) => (
                    <tr key={meta.metric} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-2 text-xs font-semibold text-white">{meta.metric}</td>
                      <td className="px-4 py-2 text-xs text-indigo-300 font-mono">{meta.target}</td>
                      <td className="px-4 py-2 text-xs text-gray-400">{meta.rule}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
