export default function DashboardLoading() {
  return (
    <main className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        {/* Header skeleton */}
        <div className="h-1 rounded bg-gradient-to-r from-indigo-500/30 via-violet-500/30 to-violet-400/30 mb-4" />
        <div className="h-6 w-80 rounded bg-white/5 mb-2" />
        <div className="h-4 w-56 rounded bg-white/5 mb-1" />
        <div className="h-3 w-44 rounded bg-white/5" />

        {/* KPI Cards skeleton */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-white/5 bg-white/5"
            />
          ))}
        </div>

        {/* Quadrants skeleton */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-56 rounded-xl border border-white/5 bg-white/5" />
          <div className="h-56 rounded-xl border border-white/5 bg-white/5" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-48 rounded-xl border border-white/5 bg-white/5" />
          <div className="h-48 rounded-xl border border-white/5 bg-white/5" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-40 rounded-xl border border-white/5 bg-white/5" />
          <div className="h-40 rounded-xl border border-white/5 bg-white/5" />
        </div>

        {/* Loading indicator */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-xs text-gray-500">
            Carregando métricas...
          </p>
          <p className="text-[9px] text-gray-600">
            Se o período selecionado é anterior a 3 meses, os dados estão sendo buscados diretamente do Jira.
          </p>
        </div>
      </div>
    </main>
  );
}
