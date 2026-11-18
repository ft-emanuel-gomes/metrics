"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SQUADS_CONFIG } from "@/config/squads";
import ThemedLogo from "@/components/ui/ThemedLogo";

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
    <aside className="ds-rail no-print fixed left-0 top-0 z-40 h-screen w-52 p-3 overflow-y-auto">
      <div className="mb-6 px-3">
        <ThemedLogo src="/images/logo-montebravo.svg" alt="Monte Bravo" width={140} height={28} className="h-7 w-auto" />
      </div>

      <nav className="space-y-1">
        {filteredVerticals.map((vertical) => {
          const isExpanded = expanded[vertical.name];
          const hasActive = vertical.slugs.some((slug) => pathname === `/dashboard/${slug}`);

          return (
            <div key={vertical.name}>
              <button
                onClick={() => toggleVertical(vertical.name)}
                className="ds-nav-group"
                data-active={hasActive}
                aria-expanded={isExpanded}
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
                        className="ds-nav-item"
                        aria-current={isActive ? "page" : undefined}
                      >
                        <span>{squad.name.replace("Squad ", "")}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--ds-color-container-divider-section)" }}>
        <Link href="/" className="ds-nav-item">
          ← Voltar ao início
        </Link>
      </div>
    </aside>
  );
}
