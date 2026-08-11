import { redirect } from "next/navigation";
import { SQUADS_CONFIG } from "@/config/squads";
import ThemedLogo from "@/components/ui/ThemedLogo";
import SquadHealthIndicator from "@/components/home/SquadHealthIndicator";
import SyncButton from "@/components/home/SyncButton";
import LogoutButton from "@/components/home/LogoutButton";
import MetasOverlay from "@/components/home/MetasOverlay";
import AiAgilistaButton from "@/components/home/AiAgilistaButton";
import RetroButton from "@/components/home/RetroButton";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { getAuthSession } from "@/services/auth-session";

export default async function HomePage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const allSquads = Object.values(SQUADS_CONFIG);

  // Filtrar squads por permissão do usuário (admin vê tudo)
  const squads = session.isAdmin
    ? allSquads
    : allSquads.filter((s) => session.allowedSquads.includes(s.slug));

  return (
    <main className="min-h-screen px-6 py-6 flex flex-col">
      <div className="mx-auto flex-1 w-full">
        {/* Header — Logotipo + AI Agilista + Update */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <ThemedLogo
              src="/images/logo-montebravo.svg"
              alt="Monte Bravo"
              width={200}
              height={44}
              className="h-11 w-auto"
            />
            <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Selecione uma squad para visualizar o painel de performance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {session.isAdmin && <RetroButton />}
            {session.isAdmin && <AiAgilistaButton />}
            <SyncButton />
            <ThemeToggle />
          </div>
        </div>

        {/* Grid de Squads — full width */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {squads.map((squad) => (
            <SquadHealthIndicator key={squad.slug} squad={squad} />
          ))}
        </div>
      </div>

      {/* Footer — FAQ e Sair à direita */}
      <footer className="mt-6 flex items-center justify-end gap-2 pt-4" style={{ borderTop: "1px solid var(--border-primary)" }}>
        <MetasOverlay />
        <LogoutButton />
      </footer>
    </main>
  );
}
