import Link from "next/link";

export type SquadView = "overview" | "bordo" | "design";

interface SquadViewTabsProps {
  squadSlug: string;
  active: SquadView;
  /** Período selecionado (sprints de squads Sprint ou meses de squads Kanban), mantido ao trocar de visão. */
  sprints?: string;
  months?: string;
}

/**
 * Seletor de visão da squad, abaixo do título (controle segmentado do DS MB):
 * - Visão Geral: métricas de Engenharia (sprints fechadas, com os filtros da tela)
 * - Computador de Bordo: sprint vigente em tempo real (?view=bordo), só Engenharia
 * - Design: métricas de Design (?issueType=Design)
 * - Replanejados: em construção (bloqueado)
 * Ao trocar de visão o período é mantido; o filtro de tipos volta ao padrão da visão.
 */
export default function SquadViewTabs({ squadSlug, active, sprints, months }: SquadViewTabsProps) {
  const base = `/dashboard/${encodeURIComponent(squadSlug)}`;
  const href = (view: SquadView) => {
    const qs = new URLSearchParams();
    // Computador de Bordo é sempre a sprint vigente: não leva o período selecionado
    if (view !== "bordo" && sprints) qs.set("sprints", sprints);
    if (view !== "bordo" && months) qs.set("months", months);
    if (view === "bordo") qs.set("view", "bordo");
    if (view === "design") qs.set("issueType", "Design");
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  };

  const pill = "rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors";
  const tabs: { view: SquadView; label: string }[] = [
    { view: "overview", label: "Visão Geral" },
    { view: "bordo", label: "Computador de Bordo" },
    { view: "design", label: "Design" },
  ];

  return (
    <nav
      aria-label="Visão da squad"
      className="no-print inline-flex items-center gap-1 rounded-full p-1"
      style={{ background: "var(--ds-color-feedback-neutral-surface)" }}
    >
      {tabs.map((tab) => {
        const isActive = tab.view === active;
        return (
          <Link
            key={tab.view}
            href={href(tab.view)}
            aria-current={isActive ? "page" : undefined}
            className={`${pill} ${isActive ? "" : "hover:opacity-80"}`}
            style={{
              background: isActive ? "var(--tab-active-bg)" : "transparent",
              color: isActive ? "var(--tab-active-text)" : "var(--tab-inactive-text)",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
      <span
        role="link"
        aria-disabled="true"
        title="Em construção"
        className={`${pill} inline-flex cursor-not-allowed items-center gap-1.5`}
        style={{ color: "var(--tab-inactive-text)", opacity: 0.55 }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
        </svg>
        Replanejados
      </span>
    </nav>
  );
}
