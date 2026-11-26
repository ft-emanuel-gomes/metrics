"use client";
import { useState } from "react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Foto do Jira; sem foto (ou se não carregar), as iniciais. Mesmo visual da coluna Engenheiros. */
export default function PersonAvatar({ name, avatarUrl, size = 28 }: { name: string; avatarUrl?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = {
    width: size,
    height: size,
    background: "var(--ds-color-feedback-primary-surface)",
    color: "var(--ds-color-feedback-primary-label)",
    fontSize: Math.round(size * 0.4),
  };
  if (avatarUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} title={name} width={size} height={size} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="shrink-0 rounded-full object-cover" style={style} />;
  }
  return (
    <span title={name} className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold" style={style}>
      {initials(name)}
    </span>
  );
}
