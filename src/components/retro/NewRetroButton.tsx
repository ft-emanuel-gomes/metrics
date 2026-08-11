"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface NewRetroButtonProps {
  squadSlug: string;
  squadName: string;
}

export default function NewRetroButton({ squadSlug, squadName }: NewRetroButtonProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/retro/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squadSlug }),
      });

      if (res.ok) {
        const board = await res.json();
        router.push(`/retrospectiva/${squadSlug}/${board.id}`);
      } else {
        const data = await res.json();
        alert(data.error || "Erro ao criar board");
        setCreating(false);
      }
    } catch {
      alert("Erro de conexão");
      setCreating(false);
    }
  }

  return (
    <button
      onClick={handleCreate}
      disabled={creating}
      className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40 transition"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      {creating ? "Criando..." : "Nova Retrospectiva"}
    </button>
  );
}
