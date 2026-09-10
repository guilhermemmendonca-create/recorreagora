import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecorreAgora — auditoria gratuita da sua multa",
  description:
    "Fotografe a notificação de autuação e descubra em segundos se ela tem vícios que permitem recorrer.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sem maximumScale: bloquear zoom quebra acessibilidade.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
