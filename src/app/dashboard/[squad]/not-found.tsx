import Link from "next/link";

export default function SquadNotFound() {
  return (
    <main className="min-h-screen p-6 lg:p-8 flex items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-4 text-4xl">🔍</div>
        <h2 className="text-lg font-bold text-[color:var(--ds-color-content-title)] mb-2">
          Squad não encontrada
        </h2>
        <p className="text-sm text-[color:var(--ds-color-content-caption)] mb-6">
          A squad informada não existe na configuração. Verifique a URL e tente
          novamente.
        </p>
        <Link
          href="/"
          className="inline-block ds-btn ds-btn-primary ds-btn-small"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
