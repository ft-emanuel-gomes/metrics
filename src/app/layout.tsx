import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";

// Fonte da marca (DS MB). Variável 100–800: o DS usa peso 450 em títulos.
const sora = Sora({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Monte Bravo — Dashboard de Métricas Ágeis",
  description:
    "Painel executivo de performance das Squads de Engenharia",
};

// Tema: escolha salva do usuário; sem escolha, segue a preferência do sistema.
const themeScript = `
  (function() {
    try {
      var t = localStorage.getItem('theme');
      if (t !== 'light' && t !== 'dark') {
        t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
      document.documentElement.setAttribute('data-theme', t);
      document.documentElement.setAttribute('data-mb-scheme', t);
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-theme="dark" data-mb-scheme="dark" className={sora.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
