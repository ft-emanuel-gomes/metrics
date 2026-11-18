import MbDonut from "./MbDonut";

interface ScopeDonutProps {
  done: number;
  inProgress: number;
  pending: number;
  /** Tamanho em px (quadrado) */
  size?: number;
}

/** Donut de escopo (Épicos/Features): concluído / em andamento / pendente. O centro mostra o % concluído. */
export default function ScopeDonut({ done, inProgress, pending, size = 150 }: ScopeDonutProps) {
  const total = done + inProgress + pending;
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <MbDonut
      size={size}
      ariaLabel={`${donePct}% concluído de ${total} itens`}
      segments={[
        { key: "done", label: "Concluído", value: done, color: "var(--ds-color-content-positive)" },
        { key: "inProgress", label: "Em andamento", value: inProgress, color: "var(--ds-color-content-primary)" },
        { key: "pending", label: "Pendente", value: pending, color: "var(--ds-color-content-disabled)" },
      ]}
      center={
        <>
          <span className="text-2xl font-medium leading-none" style={{ color: "var(--ds-color-content-title)" }}>
            {total === 0 ? "—" : `${donePct}%`}
          </span>
          <span className="mt-1 text-[10px]" style={{ color: "var(--ds-color-content-caption)" }}>concluído</span>
        </>
      }
    />
  );
}
