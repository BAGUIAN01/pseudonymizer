"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { InfoIcon } from "lucide-react";

import { isTauri } from "@/lib/backend";

/**
 * Fiche du logiciel : ce qu'il fait, sa version, et sa signature.
 *
 * La version est lue sur l'application elle-meme et non ecrite en dur : elle
 * change a chaque publication, et une valeur recopiee finirait par mentir.
 */
export function AboutDialog() {
  const [version, setVersion] = useState(null);

  useEffect(() => {
    let vivant = true;
    if (!isTauri()) return undefined;

    import("@tauri-apps/api/app")
      .then((app) => app.getVersion())
      .then((v) => {
        if (vivant) setVersion(v);
      })
      .catch(() => {});

    return () => {
      vivant = false;
    };
  }, []);

  return (
    <Dialog.Root>
      <Dialog.Trigger
        aria-label="À propos du logiciel"
        title="À propos"
        className="bg-tint/5 hover:bg-tint/10 flex size-7 cursor-pointer items-center justify-center rounded-lg text-dim transition-colors hover:text-foreground"
      >
        <InfoIcon className="size-3.5" aria-hidden />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Popup className="bg-surface fixed top-1/2 left-1/2 z-50 flex w-[420px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border p-5 shadow-[var(--shadow-dialog)]">
          <div className="flex flex-col gap-1">
            <span className="text-accent-strong font-mono text-[9.5px] font-semibold tracking-[0.16em] uppercase">
              Filtre IA
            </span>
            <Dialog.Title className="text-[17px] font-bold text-strong">
              Anonymizer
            </Dialog.Title>
          </div>

          <Dialog.Description className="text-[12.5px] leading-[1.65] text-foreground">
            Anonymizer remplace les données personnelles d’un document par des
            pseudonymes, pour qu’il puisse être confié à un service extérieur —
            une intelligence artificielle, un prestataire — sans exposer ce
            qu’il contient. Le chemin inverse restaure ensuite les valeurs
            d’origine dans le texte qui vous revient.
          </Dialog.Description>

          <p className="text-[12.5px] leading-[1.65] text-dim">
            Tout le traitement se fait sur cette machine. Aucun document, aucune
            correspondance ne part sur le réseau.
          </p>

          <div className="flex items-center justify-between gap-3 rounded-lg bg-tint/5 px-3 py-2">
            <span className="font-mono text-[10px] tracking-[0.14em] text-dim uppercase">
              Version
            </span>
            <span className="font-mono text-[12px] font-semibold text-foreground">
              {version ?? "développement"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <span className="text-[11.5px] text-dim">
              Développé par{" "}
              <span className="font-semibold text-foreground">
                Harouna BAGUIAN
              </span>
            </span>

            <Dialog.Close className="cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-bold text-foreground transition-colors hover:bg-tint/8">
              Fermer
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
