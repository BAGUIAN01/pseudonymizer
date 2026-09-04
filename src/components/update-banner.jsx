"use client";

import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { useUpdater } from "@/store/use-updater";

/**
 * Proposition de mise a jour, en pied de la colonne de gauche.
 *
 * Rien ne s'installe sans un geste : une mise a jour qui s'imposerait au
 * milieu d'un traitement ferait perdre les correspondances en cours de
 * selection.
 */
export function UpdateBanner() {
  const status = useUpdater((s) => s.status);
  const version = useUpdater((s) => s.version);
  const progress = useUpdater((s) => s.progress);
  const check = useUpdater((s) => s.check);
  const install = useUpdater((s) => s.install);
  const dismiss = useUpdater((s) => s.dismiss);

  // Une seule verification au demarrage, en silence : une machine hors ligne
  // ne doit pas etre alertee a chaque ouverture.
  useEffect(() => {
    check(true);
  }, [check]);

  if (status !== "available" && status !== "downloading" && status !== "ready") {
    return null;
  }

  const enCours = status === "downloading" || status === "ready";

  return (
    <div className="border-primary/30 bg-primary/10 flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-accent-strong font-mono text-[9.5px] tracking-[0.16em] uppercase">
          Mise à jour
        </span>
        {!enCours && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Ignorer cette mise à jour"
            className="hover:text-foreground cursor-pointer text-[14px] leading-none text-faint transition-colors"
          >
            ×
          </button>
        )}
      </div>

      <span className="text-[12.5px] font-semibold text-foreground">
        Version {version} disponible
      </span>

      {enCours ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-[3px] overflow-hidden rounded-full bg-tint/12">
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-200"
              style={{ width: `${Math.round(progress)}%` }}
            />
          </div>
          <span className="font-mono text-[9.5px] text-dim">
            {status === "ready" ? "Redémarrage…" : "Téléchargement…"}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={install}
          className={cn(
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "w-full cursor-pointer rounded-lg px-3 py-2 text-[12px] font-bold transition-colors",
          )}
        >
          Installer et redémarrer
        </button>
      )}
    </div>
  );
}
