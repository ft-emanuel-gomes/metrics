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
      className="btn-primary rounded-md px-3 py-1.5 text-[10px] disabled:opacity-40"
    >
      {isExporting ? "Gerando..." : "Exportar PDF"}
    </button>
  );
}
