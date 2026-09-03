import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Les polices sont telechargees au build et servies depuis le bundle :
// l'application n'emet aucune requete reseau a l'execution.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata = {
  title: "Anonymizer — Filtre IA",
  description:
    "Pseudonymisation et dé-pseudonymisation locale de documents, sans transmission de données.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="fr"
      className={`dark ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
