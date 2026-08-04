"use client";

import { useState } from "react";
import MonteCarloModal from "./MonteCarloModal";

interface MonteCarloButtonProps {
  squad: string;
  defaultTeamSize: number;
  availableSprints: { id: number; name: string }[];
}

const ALL_ISSUE_TYPES = ["História", "Bug", "Design", "Tech Debt", "Task", "Kaizen", "Spike"];

export default function MonteCarloButton({ squad, defaultTeamSize, availableSprints }: MonteCarloButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-lg bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/25 transition"
      >
        Monte Carlo
      </button>

      {isOpen && (
        <MonteCarloModal
          squad={squad}
          defaultTeamSize={defaultTeamSize}
          availableSprints={availableSprints}
          availableIssueTypes={ALL_ISSUE_TYPES}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
