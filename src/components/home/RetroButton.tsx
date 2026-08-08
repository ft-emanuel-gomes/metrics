"use client";

import Link from "next/link";

/**
 * Botão Retrospectiva na home — visível apenas para Administrators.
 * Redireciona para a home de retrospectivas.
 */
export default function RetroButton() {
  return (
    <Link
      href="/retrospectiva"
      className="flex items-center gap-2 rounded-lg bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/25 transition"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
      Retrospectiva
    </Link>
  );
}
