"use client";

import { useState } from "react";
import type { RetroTimer } from "@/types/retro";

interface TimerControlProps {
  timer: RetroTimer;
  squadSlug: string;
  onTimerUpdate: (timer: RetroTimer) => void;
}

/**
 * Controles do timer para o Agilista: definir duração, start, pause, reset.
 */
export default function TimerControl({ timer, squadSlug, onTimerUpdate }: TimerControlProps) {
  const [isSettingDuration, setIsSettingDuration] = useState(false);
  const [minutes, setMinutes] = useState(Math.floor(timer.durationSeconds / 60));
  const [seconds, setSeconds] = useState(timer.durationSeconds % 60);

  const isRunning = !!timer.startedAt && !timer.pausedAt;
  const isPaused = !!timer.pausedAt;
  const isIdle = !timer.startedAt;

  async function sendAction(action: string, durationSeconds?: number) {
    const body: Record<string, unknown> = { action };
    if (durationSeconds !== undefined) body.durationSeconds = durationSeconds;

    const res = await fetch(`/api/retro/${squadSlug}/timer`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const updatedTimer: RetroTimer = await res.json();
      onTimerUpdate(updatedTimer);
    }
  }

  function handleSetDuration() {
    const total = minutes * 60 + seconds;
    if (total > 0) {
      sendAction("set", total);
      setIsSettingDuration(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Duration setter */}
      {isSettingDuration ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={99}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-10 rounded bg-white/10 px-1 py-0.5 text-center text-[11px] text-white outline-none"
            placeholder="min"
          />
          <span className="text-[10px] text-gray-500">:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
            className="w-10 rounded bg-white/10 px-1 py-0.5 text-center text-[11px] text-white outline-none"
            placeholder="seg"
          />
          <button
            onClick={handleSetDuration}
            className="rounded bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-violet-500"
          >
            OK
          </button>
          <button
            onClick={() => setIsSettingDuration(false)}
            className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-gray-400 hover:bg-white/10"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          {/* Start / Resume */}
          {(isIdle || isPaused) && (
            <button
              onClick={() => sendAction("start")}
              className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500 transition"
              title={isPaused ? "Retomar" : "Iniciar"}
            >
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {/* Pause */}
          {isRunning && (
            <button
              onClick={() => sendAction("pause")}
              className="rounded bg-amber-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-amber-500 transition"
              title="Pausar"
            >
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {/* Reset */}
          {!isIdle && (
            <button
              onClick={() => sendAction("reset")}
              className="rounded bg-white/10 px-2 py-1 text-[10px] text-gray-400 hover:bg-white/15 hover:text-white transition"
              title="Resetar"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}

          {/* Set duration */}
          <button
            onClick={() => setIsSettingDuration(true)}
            className="rounded bg-white/5 px-2 py-1 text-[10px] text-gray-400 hover:bg-white/10 hover:text-white transition"
            title="Definir duração"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
