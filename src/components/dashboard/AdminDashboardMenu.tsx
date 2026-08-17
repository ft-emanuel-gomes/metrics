"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const MonteCarloModal = dynamic(() => import("./MonteCarloModal"), { ssr: false });

interface AdminDashboardMenuProps {
  squad: string;
  teamSize: number;
  availableSprints: { id: number; name: string }[];
}

const ALL_ISSUE_TYPES = ["História", "Bug", "Tech Debt", "Task", "Kaizen", "Spike"];

export default function AdminDashboardMenu({
  squad,
  teamSize,
  availableSprints,
}: AdminDashboardMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showMonteCarlo, setShowMonteCarlo] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await fetch(`/export/${squad}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `metrics-${squad}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      alert("Erro ao exportar PDF");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn-primary rounded-lg px-3 py-2 text-xs"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Administrador
        <svg className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1.5 z-50 rounded-lg py-1 shadow-xl min-w-[180px]"
            style={{ backgroundColor: "var(--bg-card)", border: "0.5px solid var(--border-primary)" }}
          >
            <button
              onClick={() => { setIsOpen(false); setShowMonteCarlo(true); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-left transition hover:opacity-80"
              style={{ color: "var(--text-primary)" }}
            >
              <svg className="h-4 w-4" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Monte Carlo
            </button>
            <button
              onClick={() => { setIsOpen(false); handleExport(); }}
              disabled={isExporting}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-left transition hover:opacity-80 disabled:opacity-40"
              style={{ color: "var(--text-primary)" }}
            >
              <svg className="h-4 w-4" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {isExporting ? "Gerando..." : "Exportar PDF"}
            </button>
          </div>
        </>
      )}

      {/* Monte Carlo Modal */}
      {showMonteCarlo && (
        <MonteCarloModal
          squad={squad}
          defaultTeamSize={teamSize}
          availableSprints={availableSprints}
          availableIssueTypes={ALL_ISSUE_TYPES}
          onClose={() => setShowMonteCarlo(false)}
        />
      )}
    </div>
  );
}
