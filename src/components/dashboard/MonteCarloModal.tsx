"use client";

import { useState, useEffect } from "react";

interface SprintOption {
  id: number;
  name: string;
}

interface MonteCarloModalProps {
  squad: string;
  defaultTeamSize: number;
  availableSprints: SprintOption[];
  availableIssueTypes: string[];
  onClose: () => void;
}

interface SimulationResult {
  dateP50: string;
  dateP75: string;
  dateP85: string;
  daysP50: number;
  daysP75: number;
  daysP85: number;
  avgDailyThroughput: number;
  adjustedAvgDailyThroughput: number;
  capacityAdjustment: number;
  totalItemsInPeriod: number;
  totalBusinessDays: number;
}

function simplifySprintName(name: string): string {
  const match = name.match(/Sprint\s*(\d+)/i);
  return match ? `Sprint ${match[1]}` : name;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function MonteCarloModal({
  squad,
  defaultTeamSize,
  availableSprints,
  availableIssueTypes,
  onClose,
}: MonteCarloModalProps) {
  // Últimas 3 sprints pré-selecionadas (availableSprints vem mais recente primeiro)
  const [selectedSprints, setSelectedSprints] = useState<number[]>(
    availableSprints.slice(0, 3).map((s) => s.id)
  );
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["História"]);
  const [itemCount, setItemCount] = useState<number>(30);
  const [teamSize, setTeamSize] = useState<number>(defaultTeamSize);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Carregar última simulação salva ao abrir o modal
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`monte-carlo-${squad}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.dateP50) {
          setResult(parsed);
          setStatus("done");
        }
        if (parsed._params) {
          if (parsed._params.itemCount) setItemCount(parsed._params.itemCount);
          if (parsed._params.teamSize) setTeamSize(parsed._params.teamSize);
          if (parsed._params.startDate) setStartDate(parsed._params.startDate);
          // Sprints e tipos NÃO são restaurados — sempre usa default (últimas 3 + História)
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSprint(id: number) {
    setSelectedSprints((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  async function runSimulation() {
    if (selectedSprints.length === 0) {
      setErrorMsg("Selecione ao menos uma sprint.");
      return;
    }
    if (itemCount <= 0) {
      setErrorMsg("Informe a quantidade de itens.");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const params = new URLSearchParams({
        sprints: selectedSprints.join(","),
        issueType: selectedTypes.join(","),
        itemCount: String(itemCount),
        teamSize: String(teamSize),
        startDate,
      });

      const res = await fetch(`/api/monte-carlo/${squad}?${params.toString()}`);
      const data = await res.json();

      if (res.ok && data.dateP50) {
        setResult(data);
        setStatus("done");
        // Salvar última simulação no localStorage
        localStorage.setItem(`monte-carlo-${squad}`, JSON.stringify({
          ...data,
          _savedAt: new Date().toISOString(),
          _params: { sprints: selectedSprints, types: selectedTypes, itemCount, teamSize, startDate },
        }));
      } else {
        setErrorMsg(data.message || "Erro na simulação.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Falha na conexão.");
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-white/10 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white">
            Monte Carlo — Previsão de Entrega
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>

        {/* Filtro de Sprints */}
        <div className="mb-3">
          <span className="text-[10px] text-gray-500 uppercase font-semibold">Sprints:</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {availableSprints.map((sprint) => {
              const isSelected = selectedSprints.includes(sprint.id);
              return (
                <button
                  key={sprint.id}
                  onClick={() => toggleSprint(sprint.id)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                    isSelected
                      ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
                      : "bg-white/5 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  {simplifySprintName(sprint.name)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filtro de Tipos */}
        <div className="mb-4">
          <span className="text-[10px] text-gray-500 uppercase font-semibold">Tipos:</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {availableIssueTypes.map((type) => {
              const isSelected = selectedTypes.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                    isSelected
                      ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
                      : "bg-white/5 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mb-1">
              Itens a entregar
            </label>
            <input
              type="number"
              min={1}
              value={itemCount}
              onChange={(e) => setItemCount(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mb-1">
              Pessoas
            </label>
            <input
              type="number"
              min={1}
              value={teamSize}
              onChange={(e) => setTeamSize(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase font-semibold mb-1">
              Início
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>

        {/* Erro */}
        {errorMsg && (
          <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] text-red-400">
            {errorMsg}
          </div>
        )}

        {/* Botão simular */}
        <button
          onClick={runSimulation}
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
              Simulando...
            </span>
          ) : (
            "Simular"
          )}
        </button>

        {/* Resultados */}
        {result && (
          <div className="mt-5 rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="text-xs font-bold text-white mb-3">Resultado da Simulação</h3>

            {/* Metadados */}
            <div className="flex gap-4 mb-4 text-[10px] text-gray-400">
              <span>Vazão diária: <strong className="text-white">{result.avgDailyThroughput}</strong> itens/dia</span>
              <span>Ajuste: <strong className="text-white">{Math.round((result.capacityAdjustment - 1) * 100)}%</strong></span>
              <span>Itens no período: <strong className="text-white">{result.totalItemsInPeriod}</strong></span>
            </div>

            {/* Previsões */}
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                <span className="text-xs text-emerald-300 font-semibold">50% de probabilidade</span>
                <span className="text-sm font-bold text-white">{formatDate(result.dateP50)}</span>
                <span className="text-[10px] text-gray-400">{result.daysP50} dias úteis ({Math.ceil(result.daysP50 / 10)} sprints)</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <span className="text-xs text-amber-300 font-semibold">75% de probabilidade</span>
                <span className="text-sm font-bold text-white">{formatDate(result.dateP75)}</span>
                <span className="text-[10px] text-gray-400">{result.daysP75} dias úteis ({Math.ceil(result.daysP75 / 10)} sprints)</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-2">
                <span className="text-xs text-indigo-300 font-semibold">85% de probabilidade</span>
                <span className="text-sm font-bold text-white">{formatDate(result.dateP85)}</span>
                <span className="text-[10px] text-gray-400">{result.daysP85} dias úteis ({Math.ceil(result.daysP85 / 10)} sprints)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
