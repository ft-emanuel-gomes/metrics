"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import FilterDropdown, { type FilterGroup } from "@/components/ui/FilterDropdown";
import { formatSprintName } from "@/lib/sprint-name";

export interface SprintOption {
  id: number;
  name: string;
  startDate?: string;
  /** Fim real (conclusão no Jira) ou fim cadastrado */
  endDate?: string;
  /** Release a que a sprint pertence (ex.: "Release 4"); sem release, fica em "Outras sprints" */
  releaseLabel?: string;
}

interface MonthOption {
  value: string; // "YYYY-MM"
  label: string; // "Mai/26", "Jun/26", etc.
}

interface PeriodSelectorProps {
  methodology: "sprint" | "kanban";
  availableSprints?: SprintOption[];
  currentSprintIds?: number[];
  availableMonths?: MonthOption[];
  currentMonths?: string[];
  currentStartDate?: string;
  currentEndDate?: string;
  availableIssueTypes?: string[];
  currentIssueTypes?: string[];
  /** false = esconde o filtro de Sprints/Meses (ex.: Computador de Bordo, sempre a sprint vigente) */
  showPeriod?: boolean;
}

const TZ = "America/Sao_Paulo";

/** Padrão "Sprint N - RN" (regra em src/lib/sprint-name.ts); o nome já chega com a release. */
function simplifySprintName(name: string): string {
  return formatSprintName(name);
}

function fmtDayMonth(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ }) : "";
}

function summarize(labels: string[], total: number, noun: string): string {
  if (labels.length === 0) return "Padrão";
  if (total > 0 && labels.length === total) return "Todos";
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.length} ${noun}`;
}

/**
 * Filtros do dashboard em dropdown (padrão do DS MB): Sprints (ou Meses, em squads Kanban) e Tipos.
 * "Limpar filtro" + "Aplicar" sem seleção volta ao padrão (3 últimas sprints / tipos padrão).
 */
export default function PeriodSelector({
  methodology,
  availableSprints = [],
  currentSprintIds = [],
  availableMonths = [],
  currentMonths = [],
  availableIssueTypes = [],
  currentIssueTypes = [],
  showPeriod = true,
}: PeriodSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function apply(changes: { sprints?: number[]; months?: string[]; types?: string[] }) {
    const params = new URLSearchParams(searchParams.toString());
    if (changes.sprints) {
      if (changes.sprints.length > 0) params.set("sprints", changes.sprints.join(","));
      else params.delete("sprints");
    }
    if (changes.months) {
      if (changes.months.length > 0) params.set("months", changes.months.join(","));
      else params.delete("months");
    }
    if (changes.types) {
      if (changes.types.length > 0) params.set("issueType", changes.types.join(","));
      else params.delete("issueType");
    }
    params.delete("startDate");
    params.delete("endDate");
    startTransition(() => {
      router.push(`?${params.toString()}`);
      router.refresh();
    });
  }

  // Sprints agrupadas por release, na ordem em que chegam (mais recente primeiro)
  const sprintGroups: FilterGroup[] = [];
  for (const s of availableSprints) {
    const label = s.releaseLabel || "Outras sprints";
    let g = sprintGroups.find((x) => x.id === label);
    if (!g) {
      g = { id: label, label, options: [] };
      sprintGroups.push(g);
    }
    const dates = s.startDate ? `${fmtDayMonth(s.startDate)} – ${fmtDayMonth(s.endDate)}` : undefined;
    g.options.push({ value: String(s.id), label: simplifySprintName(s.name), hint: dates });
  }
  const selectedSprintLabels = availableSprints.filter((s) => currentSprintIds.includes(s.id)).map((s) => simplifySprintName(s.name));

  const monthGroups: FilterGroup[] = [{ id: "months", options: availableMonths.map((m) => ({ value: m.value, label: m.label })) }];
  const selectedMonthLabels = availableMonths.filter((m) => currentMonths.includes(m.value)).map((m) => m.label);

  const typeGroups: FilterGroup[] = [{ id: "types", label: "Todos os tipos", options: availableIssueTypes.map((t) => ({ value: t, label: t })) }];
  const selectedTypes = currentIssueTypes.filter((t) => availableIssueTypes.includes(t));

  return (
    <div className={`flex flex-wrap items-center gap-2 ${isPending ? "opacity-60" : ""}`}>
      {!showPeriod ? null : methodology === "sprint" ? (
        <FilterDropdown
          label="Sprints"
          summary={summarize(selectedSprintLabels, 0, "sprints")}
          groups={sprintGroups}
          selected={currentSprintIds.map(String)}
          onApply={(values) => apply({ sprints: values.map(Number).filter(Boolean) })}
          disabled={isPending}
        />
      ) : (
        <FilterDropdown
          label="Meses"
          summary={summarize(selectedMonthLabels, 0, "meses")}
          groups={monthGroups}
          selected={currentMonths}
          onApply={(values) => apply({ months: values })}
          disabled={isPending}
        />
      )}
      {availableIssueTypes.length > 0 && (
        <FilterDropdown
          label="Tipos"
          summary={summarize(selectedTypes, availableIssueTypes.length, "tipos")}
          groups={typeGroups}
          selected={selectedTypes}
          onApply={(values) => apply({ types: values })}
          disabled={isPending}
        />
      )}
      {isPending && (
        <span className="flex items-center gap-2 text-[11px]" style={{ color: "var(--accent)" }}>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Recarregando métricas...
        </span>
      )}
    </div>
  );
}
