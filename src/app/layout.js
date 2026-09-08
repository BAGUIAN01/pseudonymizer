import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";

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
  title: "Pseudonymizer — Filtre IA",
  description:
    "Pseudonymisation et dé-pseudonymisation locale de documents, sans transmission de données.",
};

export default function RootLayout({ children }) {
  return (
    // `suppressHydrationWarning` est requis : le theme est pose sur `<html>`
    // avant l'hydratation, ce que le serveur ne peut pas connaitre.
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          {/*
            Sur telephone, le bas de l'ecran appartient a la feuille des
            correspondances : le message se pose au-dessus d'elle, sans quoi
            il masque la poignee au moment meme ou l'on en a besoin.
          */}
          <Toaster position="bottom-center" mobileOffset={{ bottom: "120px" }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
