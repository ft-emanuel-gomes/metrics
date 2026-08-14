"use client";

import { useState } from "react";
import MonteCarloModal from "./MonteCarloModal";

interface MonteCarloButtonProps {
  squad: string;
  defaultTeamSize: number;
  availableSprints: { id: number; name: string }[];
}

const ALL_ISSUE_TYPES = ["História", "Bug", "Tech Debt", "Task", "Kaizen", "Spike"];

export default function MonteCarloButton({ squad, defaultTeamSize, availableSprints }: MonteCarloButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="btn-primary rounded-lg px-3 py-2 text-xs"
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
