"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface MetricTooltipProps {
  text: string;
}

export default function MetricTooltip({ text }: MetricTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function handleEnter() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      });
    }
    setIsOpen(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setIsOpen(false)}
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[8px] font-bold hover:bg-indigo-500/30 transition cursor-help ml-1.5 align-middle"
      >
        ?
      </button>
      {isOpen && mounted && createPortal(
        <div
          style={{ top: position.top, left: position.left, transform: "translate(-50%, -100%)" }}
          className="fixed z-[9999] w-56 p-2.5 rounded-lg bg-gray-800 border border-white/10 shadow-2xl text-[9px] text-gray-300 leading-relaxed whitespace-normal pointer-events-none"
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
}
