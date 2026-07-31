"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

interface ExportButtonProps {
  squad: string;
}

export default function ExportButton({ squad }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const searchParams = useSearchParams();

  async function handleExport() {
    setIsExporting(true);
    try {
      // Passar os filtros ativos para a rota de export
      const params = new URLSearchParams(searchParams.toString());
      const url = `/export/${squad}?${params.toString()}`;

      // Abrir o documento formal em nova aba (pronto para Ctrl+P → PDF)
      window.open(url, "_blank");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="rounded-md bg-violet-600 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-violet-500 disabled:opacity-40 transition"
    >
      {isExporting ? "Gerando..." : "Exportar PDF"}
    </button>
  );
}
