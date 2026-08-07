"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * Toggle para alternar entre métricas de Engenharia e Design.
 * - OFF (padrão): Engenharia — História, Story, Bug, Tech Debt, Kaizen, Task, Spike
 * - ON: Design — apenas issues do tipo Design
 */
export default function DesignToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentIssueTypes = searchParams.get("issueType")?.split(",") || [];
  const isDesignMode = currentIssueTypes.length === 1 && currentIssueTypes[0] === "Design";

  function handleToggle() {
    const params = new URLSearchParams(searchParams.toString());

    if (isDesignMode) {
      // Voltar para Engenharia (padrão)
      params.delete("issueType");
    } else {
      // Ativar Design only
      params.set("issueType", "Design");
    }

    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <button
      onClick={handleToggle}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
        isDesignMode
          ? "bg-pink-500/20 text-pink-300 ring-1 ring-pink-500/40"
          : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300"
      }`}
      title={isDesignMode ? "Visualizando métricas de Design. Clique para voltar a Engenharia." : "Clique para visualizar métricas de Design."}
    >
      {/* Icon: paint brush */}
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>

      {/* Toggle indicator */}
      <div className={`relative w-8 h-4 rounded-full transition-colors ${
        isDesignMode ? "bg-pink-500" : "bg-gray-600"
      }`}>
        <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
          isDesignMode ? "translate-x-4.5" : "translate-x-0.5"
        }`} />
      </div>

      <span className="hidden sm:inline">Design</span>
    </button>
  );
}
