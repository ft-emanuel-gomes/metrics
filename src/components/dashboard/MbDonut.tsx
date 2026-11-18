"use client";
import { useState, type ReactNode } from "react";

export interface MbDonutSegment {
  key: string;
  label: string;
  value: number;
  /** Cor do segmento (CSS var ou hex). */
  color: string;
}

interface MbDonutProps {
  segments: MbDonutSegment[];
  size?: number;
  ariaLabel: string;
  /** Conteúdo do centro (total, % etc.). */
  center?: ReactNode;
  onSegmentClick?: (segment: MbDonutSegment) => void;
}

/**
 * Donut no modelo MB (inspirado no DetailedCompositionChart do Bravo):
 * anel principal com gaps entre segmentos + anel externo fino em tom suave.
 * Usa SVG puro com tokens via CSS vars, então acompanha o tema sem JS.
 */
export default function MbDonut({ segments, size = 128, ariaLabel, center, onSegmentClick }: MbDonutProps) {
  const [hover, setHover] = useState<string | null>(null);
  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((a, s) => a + s.value, 0);
  const stroke = Math.round(size * 0.1);
  const haloStroke = Math.max(Math.round(size * 0.035), 3);
  const haloR = (size - haloStroke) / 2;
  const r = (size - stroke) / 2 - (haloStroke + 2);
  const c = 2 * Math.PI * r;
  const hc = 2 * Math.PI * haloR;
  const gap = visible.length > 1 ? 3 : 0;

  let off = 0;
  let hoff = 0;
  const arcs = visible.map((s) => {
    const frac = s.value / total;
    const arc = { s, len: frac * c, off, hlen: frac * hc, hoff };
    off += arc.len;
    hoff += arc.hlen;
    return arc;
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel} style={{ transform: "rotate(-90deg)" }}>
        {total === 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ds-color-container-divider-card)" strokeWidth={stroke} />
        )}
        {arcs.map(({ s, hlen, hoff: ho }) => (
          <circle
            key={`h-${s.key}`}
            cx={size / 2}
            cy={size / 2}
            r={haloR}
            fill="none"
            stroke={s.color}
            strokeOpacity={0.35}
            strokeWidth={haloStroke}
            strokeDasharray={`${Math.max(hlen - gap, 0.5)} ${hc}`}
            strokeDashoffset={-ho}
          />
        ))}
        {arcs.map(({ s, len, off: o }) => {
          const dash = Math.max(len - gap, 0.5);
          return (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === s.key ? stroke + 3 : stroke}
              strokeOpacity={hover && hover !== s.key ? 0.35 : 1}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-o}
              style={{ cursor: onSegmentClick ? "pointer" : "default", transition: "stroke-width .15s, stroke-opacity .15s" }}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSegmentClick?.(s)}
            >
              <title>{`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">{center}</div>
    </div>
  );
}
