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
  // Sur iPhone, aucun fichier ne s'installe sans compte de developpeur.
  // « Ajouter a l'ecran d'accueil » depuis Safari reste la seule voie
  // gratuite : le manifeste et ces deux declarations lui donnent une icone,
  // un nom, et une fenetre sans barre d'adresse.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Pseudonymizer",
    statusBarStyle: "default",
  },
  // Next n'emet que le nom standardise, honore depuis iOS 16.4. Les versions
  // anterieures ne connaissent que celui-ci, et sans lui l'application
  // s'ouvrirait dans Safari avec sa barre d'adresse.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#161a20" },
  ],
  // L'interface tactile gere son propre defilement : la remise a l'echelle
  // par pincement decalerait les barres flottantes.
  viewportFit: "cover",
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
