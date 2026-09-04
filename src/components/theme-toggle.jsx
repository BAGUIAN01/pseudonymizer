"use client";

import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Bascule entre le theme sombre, celui par defaut, et le theme clair.
 *
 * Le composant ne rend rien tant qu'il n'est pas monte : le theme est lu sur
 * le poste, le serveur ne peut donc pas le connaitre, et afficher l'un ou
 * l'autre etat produirait une divergence d'hydratation.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // `resolvedTheme` reste indefini jusqu'a l'hydratation : il fait donc office
  // d'indicateur de montage, sans etat supplementaire.
  const monte = resolvedTheme !== undefined;
  const sombre = resolvedTheme !== "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(sombre ? "light" : "dark")}
      aria-label={sombre ? "Passer au thème clair" : "Passer au thème sombre"}
      title={sombre ? "Thème clair" : "Thème sombre"}
      className={cn(
        "bg-tint/5 hover:bg-tint/10 flex cursor-pointer items-center gap-1 rounded-lg p-0.5 transition-colors",
        // Reserve la place des le rendu serveur : sans cela le bandeau
        // sursauterait a l'hydratation.
        !monte && "invisible",
      )}
    >
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-[7px] transition-colors",
          sombre ? "bg-primary text-primary-foreground" : "text-dim",
        )}
      >
        <MoonIcon className="size-3.5" aria-hidden />
      </span>
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-[7px] transition-colors",
          sombre ? "text-dim" : "bg-primary text-primary-foreground",
        )}
      >
        <SunIcon className="size-3.5" aria-hidden />
      </span>
    </button>
  );
}
