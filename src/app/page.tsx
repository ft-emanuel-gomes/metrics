import Image from "next/image";
import { redirect } from "next/navigation";
import { SQUADS_CONFIG } from "@/config/squads";
import SquadHealthIndicator from "@/components/home/SquadHealthIndicator";
import SyncButton from "@/components/home/SyncButton";
import LogoutButton from "@/components/home/LogoutButton";
import { getAuthSession } from "@/services/auth-session";

/**
 * Metas por métrica — balizador dos sinaleiros.
 */
const METAS = [
  { metric: "Cycle Time P85", target: "≤ 15 dias", rule: "Menor ou igual a 15 dias" },
  { metric: "Transbordo", target: "≤ 20%", rule: "Menor ou igual a 20%" },
  { metric: "Eficiência de Fluxo", target: "≥ 60%", rule: "Maior ou igual a 60%" },
  { metric: "Ocupação", target: "≥ 80%", rule: "Maior ou igual a 80%" },
  { metric: "WIP Aging (>10d)", target: "≤ 10 dias", rule: "Menor ou igual a 10 dias" },
];

const TRAFFIC_LIGHT_RULES = [
  { color: "bg-emerald-500", label: "Verde", rule: "Até 1 métrica abaixo da meta" },
  { color: "bg-amber-400", label: "Amarelo", rule: "Até 2 métricas abaixo da meta" },
  { color: "bg-red-500", label: "Vermelho", rule: "3 ou mais métricas abaixo da meta" },
];

export default async function HomePage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const allSquads = Object.values(SQUADS_CONFIG);

  // Filtrar squads por permissão do usuário (admin vê tudo)
  const squads = session.isAdmin
    ? allSquads
    : allSquads.filter((s) => session.allowedSquads.includes(s.slug));

  return (
    <main className="min-h-screen px-6 py-6">
      <div className="mx-auto">
        {/* Header — Logotipo + Update alinhados */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Image
              src="/images/logo-montebravo.svg"
              alt="Monte Bravo"
              width={200}
              height={44}
              className="h-11 w-auto"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Selecione uma squad para visualizar o painel de performance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SyncButton />
            <LogoutButton />
          </div>
        </div>

        {/* Grid de Squads — full width */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {squads.map((squad) => (
            <SquadHealthIndicator key={squad.slug} squad={squad} />
          ))}
        </div>

        {/* Tabela de Metas — com borda estilizada como os cards */}
        <div className="mt-8 rounded-xl border-2 border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-bold text-white mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>
            Metas e Sinaleiros
          </h2>

          {/* Regras */}
          <div className="mb-4 flex flex-wrap gap-5">
            {TRAFFIC_LIGHT_RULES.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${item.color}`} />
                <span className="text-[11px] text-gray-300">
                  <strong className="text-white">{item.label}:</strong> {item.rule}
                </span>
              </div>
            ))}
          </div>

          {/* Tabela */}
          <div className="overflow-hidden rounded-lg border border-white/5">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/5">
                  <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Métrica</th>
                  <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Meta</th>
                  <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Regra</th>
                </tr>
              </thead>
              <tbody>
                {METAS.map((meta) => (
                  <tr key={meta.metric} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-2 text-xs font-semibold text-white">{meta.metric}</td>
                    <td className="px-4 py-2 text-xs text-indigo-300 font-mono">{meta.target}</td>
                    <td className="px-4 py-2 text-xs text-gray-400">{meta.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
