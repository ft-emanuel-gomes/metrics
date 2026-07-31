"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface SprintOption {
  id: number;
  name: string;
}

interface CapacityButtonProps {
  squad: string;
  availableSprints: SprintOption[];
}

export default function CapacityButton({ squad, availableSprints }: CapacityButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [teamSize, setTeamSize] = useState(6);
  const [selectedSprintId, setSelectedSprintId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Carregar capacidades salvas
  const [savedCapacities, setSavedCapacities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isOpen) {
      fetch(`/api/capacity?squad=${squad}`)
        .then((r) => r.json())
        .then((data) => setSavedCapacities(data))
        .catch(() => {});
    }
  }, [isOpen, squad]);

  // Pre-selecionar a sprint mais recente
  useEffect(() => {
    if (availableSprints.length > 0 && !selectedSprintId) {
      setSelectedSprintId(String(availableSprints[0].id));
    }
  }, [availableSprints, selectedSprintId]);

  async function handleSave() {
    if (!selectedSprintId || teamSize < 1) return;
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/capacity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squad, sprintId: selectedSprintId, teamSize }),
      });
      const data = await res.json();

      if (res.ok) {
        setMessage("Salvo! Recarregando métricas...");
        setSavedCapacities((prev) => ({ ...prev, [selectedSprintId]: teamSize }));
        setTimeout(() => {
          setIsOpen(false);
          setMessage("");
          router.refresh();
        }, 1000);
      } else {
        setMessage(data.error || "Erro ao salvar");
      }
    } catch {
      setMessage("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  function simplifySprintName(name: string): string {
    const match = name.match(/Sprint\s*(\d+)/i);
    return match ? `Sprint ${match[1]}` : name;
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-md bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-gray-300 hover:bg-white/15 transition"
      >
        Capacidade
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-gray-900 p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-4">
              Definir Capacidade do Time
            </h3>

            {/* Campo: Quantidade de pessoas */}
            <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">
              Quantidade de pessoas
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={teamSize}
              onChange={(e) => setTeamSize(Number(e.target.value))}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white mb-4 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            {/* Campo: Selecionar Sprint */}
            <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">
              Selecionar Sprint
            </label>
            <select
              value={selectedSprintId}
              onChange={(e) => setSelectedSprintId(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white mb-4 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {availableSprints.map((s) => (
                <option key={s.id} value={String(s.id)} className="bg-gray-900">
                  {simplifySprintName(s.name)}
                  {savedCapacities[String(s.id)] ? ` (${savedCapacities[String(s.id)]} pessoas)` : ""}
                </option>
              ))}
            </select>

            {/* Info de capacidade calculada */}
            <div className="rounded-md bg-indigo-500/10 p-3 mb-4">
              <p className="text-[10px] text-indigo-300">
                Capacidade = {teamSize} pessoas × 6h/dia × dias úteis da sprint
              </p>
            </div>

            {/* Mensagem */}
            {message && (
              <p className={`text-[10px] mb-3 ${message.includes("Erro") ? "text-red-400" : "text-emerald-400"}`}>
                {message}
              </p>
            )}

            {/* Botões */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setIsOpen(false); setMessage(""); }}
                className="rounded-md bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-gray-300 hover:bg-white/15 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !selectedSprintId}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-[10px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition"
              >
                {saving ? "Salvando..." : "Salvar e Recalcular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
