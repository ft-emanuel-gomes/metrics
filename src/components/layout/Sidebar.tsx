"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SQUADS_CONFIG } from "@/config/squads";

interface VerticalGroup {
  name: string;
  slugs: string[];
}

const VERTICALS: VerticalGroup[] = [
  { name: "Relacionamento", slugs: ["assessoria", "inteligencia"] },
  { name: "Crescimento", slugs: ["experiencia", "lifecycle"] },
  { name: "Oferta", slugs: ["renda-fixa", "renda-variavel", "riscos"] },
  { name: "Operação", slugs: ["custodia", "consolidacao"] },
];

export default function Sidebar({ allowedSquads, isAdmin }: { allowedSquads: string[]; isAdmin: boolean }) {
  const pathname = usePathname();

  // Filtrar slugs por permissão (admin vê tudo)
  const filteredVerticals = VERTICALS.map((v) => ({
    ...v,
    slugs: isAdmin ? v.slugs : v.slugs.filter((slug) => allowedSquads.includes(slug)),
  })).filter((v) => v.slugs.length > 0);

  // Determinar qual vertical está ativa (para abrir automaticamente)
  const activeVertical = filteredVerticals.find((v) =>
    v.slugs.some((slug) => pathname === `/dashboard/${slug}`)
  );

  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(filteredVerticals.map((v) => [v.name, v.name === activeVertical?.name]))
  );

  function toggleVertical(name: string) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-48 border-r border-white/5 bg-gray-950 p-3 overflow-y-auto">
      <div className="mb-6 px-3">
        <img src="/images/logo-montebravo.svg" alt="Monte Bravo" className="h-7" />
      </div>

      <nav className="space-y-1">
        {filteredVerticals.map((vertical) => {
          const isExpanded = expanded[vertical.name];
          const hasActive = vertical.slugs.some((slug) => pathname === `/dashboard/${slug}`);

          return (
            <div key={vertical.name}>
              <button
                onClick={() => toggleVertical(vertical.name)}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition ${
                  hasActive
                    ? "text-indigo-300"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <span>{vertical.name}</span>
                <span className={`text-[10px] transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </button>

              {isExpanded && (
                <div className="ml-2 space-y-0.5 mt-0.5">
                  {vertical.slugs.map((slug) => {
                    const squad = SQUADS_CONFIG[slug];
                    if (!squad) return null;
                    const href = `/dashboard/${squad.slug}`;
                    const isActive = pathname === href;

                    return (
                      <Link
                        key={squad.slug}
                        href={href}
                        className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs transition ${
                          isActive
                            ? "bg-indigo-500/15 text-indigo-300 font-semibold"
                            : "text-gray-400 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span>{squad.name.replace("Squad ", "")}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${
                            squad.methodology === "kanban"
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-indigo-500/10 text-indigo-400"
                          }`}
                        >
                          {squad.methodology === "kanban" ? "KB" : "SP"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-white/5 pt-4">
        <Link
          href="/"
          className="block text-[10px] text-gray-500 hover:text-white transition"
        >
          ← Voltar ao início
        </Link>
      </div>
    </aside>
  );
}
