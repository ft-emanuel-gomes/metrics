import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monte Bravo — Dashboard de Métricas Ágeis",
  description:
    "Painel executivo de performance das Squads de Engenharia",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-theme="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var t = localStorage.getItem('theme');
            if (t) document.documentElement.setAttribute('data-theme', t);
          })();
        `}} />
      </head>
      <body className="antialiased" style={{ fontFamily: "'Inter', system-ui, sans-serif", backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
        {children}
      </body>
    </html>
  );
}
