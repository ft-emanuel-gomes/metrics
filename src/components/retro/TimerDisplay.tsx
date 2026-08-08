"use client";

import { useState, useEffect } from "react";
import type { RetroTimer } from "@/types/retro";

interface TimerDisplayProps {
  timer: RetroTimer;
}

/**
 * Exibe o countdown do timer. Calcula tempo restante localmente
 * baseado em startedAt + durationSeconds (sem polling constante).
 */
export default function TimerDisplay({ timer }: TimerDisplayProps) {
  const [remaining, setRemaining] = useState<number>(computeRemaining(timer));

  useEffect(() => {
    setRemaining(computeRemaining(timer));

    if (!timer.startedAt || timer.pausedAt) return;

    const interval = setInterval(() => {
      const r = computeRemaining(timer);
      setRemaining(r);
      if (r <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [timer.startedAt, timer.pausedAt, timer.durationSeconds, timer.remainingOnPause]);

  const isRunning = !!timer.startedAt && !timer.pausedAt && remaining > 0;
  const isPaused = !!timer.pausedAt;
  const isFinished = !!timer.startedAt && remaining <= 0;
  const isIdle = !timer.startedAt;

  const minutes = Math.floor(Math.abs(remaining) / 60);
  const seconds = Math.abs(remaining) % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  let colorClass = "text-gray-400";
  if (isRunning && remaining <= 30) colorClass = "text-red-400 animate-pulse";
  else if (isRunning) colorClass = "text-emerald-400";
  else if (isPaused) colorClass = "text-amber-400";
  else if (isFinished) colorClass = "text-red-500";

  if (isIdle && timer.durationSeconds === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Timer icon */}
      <svg className={`h-4 w-4 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>

      <span className={`font-mono text-sm font-bold ${colorClass}`}>
        {isFinished ? "00:00" : display}
      </span>

      {isPaused && (
        <span className="text-[9px] uppercase font-semibold text-amber-400">Pausado</span>
      )}
      {isFinished && (
        <span className="text-[9px] uppercase font-semibold text-red-500">Encerrado</span>
      )}
    </div>
  );
}

function computeRemaining(timer: RetroTimer): number {
  if (!timer.startedAt) return timer.durationSeconds;

  if (timer.pausedAt && timer.remainingOnPause !== undefined) {
    return timer.remainingOnPause;
  }

  const elapsed = (Date.now() - new Date(timer.startedAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(timer.durationSeconds - elapsed));
}
