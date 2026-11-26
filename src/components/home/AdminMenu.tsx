"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { SquadOption } from "@/components/admin/AdminCentral";

const AiAgilistaChat = dynamic(() => import("@/components/home/AiAgilistaChat"), { ssr: false });
const AdminCentralModal = dynamic(() => import("@/components/admin/AdminCentralModal"), { ssr: false });

export default function AdminMenu({ squads }: { squads: SquadOption[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const [showCentral, setShowCentral] = useState(false);
  const closeCentral = useCallback(() => setShowCentral(false), []);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="ds-btn ds-btn-secondary ds-btn-small"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Administrador
        <svg className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Dropdown */}
          <div
            className="absolute right-0 top-full mt-1.5 z-50 rounded-lg py-1 shadow-xl min-w-[180px]"
            style={{ backgroundColor: "var(--bg-card)", border: "0.5px solid var(--border-primary)" }}
          >
            <button
              type="button"
              onClick={() => { setIsOpen(false); setShowCentral(true); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-left transition hover:opacity-80"
              style={{ color: "var(--text-primary)" }}
            >
              <svg className="h-4 w-4" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Central Administrativa
            </button>
            <Link
              href="/retrospectiva"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium transition hover:opacity-80"
              style={{ color: "var(--text-primary)" }}
            >
              <svg className="h-4 w-4" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Retrospectiva
            </Link>
            <button
              onClick={() => { setIsOpen(false); setShowAiChat(true); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-left transition hover:opacity-80"
              style={{ color: "var(--text-primary)" }}
            >
              <svg className="h-4 w-4" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
              Agile IA
            </button>
          </div>
        </>
      )}

      {/* Agile IA Chat Modal */}
      {showAiChat && <AiAgilistaChat onClose={() => setShowAiChat(false)} />}

      {/* Central Administrativa: modal sobre a home */}
      {showCentral && <AdminCentralModal squads={squads} onClose={closeCentral} />}
    </div>
  );
}
