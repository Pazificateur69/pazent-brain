import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "pazent.brain",
  description: "Knowledge base personnelle d'Alessandro Gagliardi",
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧠</text></svg>" },
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "pazent.brain" },
  viewport: { width: "device-width", initialScale: 1, maximumScale: 1 },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
