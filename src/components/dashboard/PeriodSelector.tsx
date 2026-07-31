"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface SprintOption {
  id: number;
  name: string;
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
}

function simplifySprintName(name: string): string {
  const match = name.match(/Sprint\s*(\d+)/i);
  return match ? `Sprint ${match[1]}` : name;
}

export default function PeriodSelector({
  methodology,
  availableSprints = [],
  currentSprintIds = [],
  availableMonths = [],
  currentMonths = [],
  availableIssueTypes = [],
  currentIssueTypes = [],
}: PeriodSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function applyFilters(sprints: number[], types: string[], months?: string[]) {
    const params = new URLSearchParams(searchParams.toString());

    if (methodology === "sprint" && sprints.length > 0) {
      params.set("sprints", sprints.join(","));
    } else if (methodology === "sprint") {
      params.delete("sprints");
    }

    if (methodology === "kanban" && months && months.length > 0) {
      params.set("months", months.join(","));
    } else if (methodology === "kanban") {
      params.delete("months");
    }

    // Limpar params antigos de kanban (startDate/endDate)
    params.delete("startDate");
    params.delete("endDate");

    if (types.length > 0) {
      params.set("issueType", types.join(","));
    } else {
      params.delete("issueType");
    }

    startTransition(() => {
      router.push(`?${params.toString()}`);
      router.refresh();
    });
  }

  function toggleSprint(id: number) {
    const next = currentSprintIds.includes(id)
      ? currentSprintIds.filter((s) => s !== id)
      : [...currentSprintIds, id];
    applyFilters(next, currentIssueTypes);
  }

  function toggleMonth(month: string) {
    const next = currentMonths.includes(month)
      ? currentMonths.filter((m) => m !== month)
      : [...currentMonths, month];
    applyFilters(currentSprintIds, currentIssueTypes, next);
  }

  function toggleType(type: string) {
    const next = currentIssueTypes.includes(type)
      ? currentIssueTypes.filter((t) => t !== type)
      : [...currentIssueTypes, type];
    applyFilters(currentSprintIds, next, currentMonths);
  }

  return (
    <div className={`space-y-2 ${isPending ? "opacity-50 pointer-events-none" : ""}`}>
      {/* Loading indicator */}
      {isPending && (
        <div className="flex items-center gap-2 text-[10px] text-indigo-300">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Recarregando métricas...
        </div>
      )}
      {/* Linha 1: Sprints ou Meses */}
      {methodology === "sprint" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase font-semibold">
            Sprints:
          </span>
          {availableSprints.map((sprint) => {
            const isSelected = currentSprintIds.includes(sprint.id);
            return (
              <button
                key={sprint.id}
                onClick={() => toggleSprint(sprint.id)}
                disabled={isPending}
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
                  isSelected
                    ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                {simplifySprintName(sprint.name)}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase font-semibold">
            Meses:
          </span>
          {availableMonths.map((month) => {
            const isSelected = currentMonths.includes(month.value);
            return (
              <button
                key={month.value}
                onClick={() => toggleMonth(month.value)}
                disabled={isPending}
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
                  isSelected
                    ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                {month.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Linha 2: Issue Types */}
      {availableIssueTypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase font-semibold">
            Tipos:
          </span>
          {availableIssueTypes.map((type) => {
            const isSelected = currentIssueTypes.includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                disabled={isPending}
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
                  isSelected
                    ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
