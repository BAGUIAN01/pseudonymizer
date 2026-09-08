"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  downloadBlob,
  downloadToFolder,
  isDesktopShell,
  isMobileShell,
  saveRegistry,
  saveToDocuments,
} from "@/lib/backend";
import { useAnonymizer } from "@/store/use-anonymizer";

/**
 * Recuperation des fichiers produits.
 *
 * Une seule action : tout telecharger. Sous Tauri les livrables existent deja
 * a cote du document source, et telecharger revient a en deposer une copie
 * dans un dossier choisi — un seul choix pour l'ensemble, plutot qu'une boite
 * de dialogue par fichier.
 */
export function Deliverables() {
  const mode = useAnonymizer((s) => s.mode);
  const terms = useAnonymizer((s) => s.terms);
  const fileName = useAnonymizer((s) => s.document?.fileName);
  const title = useAnonymizer((s) => s.document?.title);
  const deliverables = useAnonymizer((s) => s.deliverables);
  const resultParagraphs = useAnonymizer((s) => s.resultParagraphs);

  const [busy, setBusy] = useState(false);

  const pseudo = mode === "pseudo";
  const count = pseudo ? 2 : 1;

  /** Livrables ecrits sur le disque par le natif, quand il y en a. */
  const written = [deliverables?.documentPath, deliverables?.registryPath].filter(
    Boolean,
  );

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      if (isDesktopShell() && written.length) {
        const saved = await downloadToFolder(written);
        // `null` signale une annulation : rien a dire dans ce cas.
        if (saved) {
          toast.success(
            saved.length > 1
              ? `${saved.length} fichiers téléchargés`
              : "Fichier téléchargé",
          );
        }
        return;
      }

      // Hors Tauri, rien n'a ete ecrit sur le disque : le resultat est
      // reconstruit ici, a partir du texte calcule cote client.
      const base = (fileName ?? "document").replace(/\.[^.]+$/, "");
      const name = base + (pseudo ? "_pseudonymise.txt" : "_restaure.txt");
      const body = `${title ?? base}\n\n${resultParagraphs().join("\n\n")}`;
      // Le BOM garantit l'ouverture correcte des accents sous Windows.
      const texte = `﻿${body}`;

      // Une webview de telephone ignore `<a download>` : le fichier s'ecrit
      // dans les documents de l'appareil, ou le systeme sait le retrouver.
      if (isMobileShell()) {
        await saveToDocuments(name, texte);
        if (pseudo) await saveRegistry(terms);
        toast.success(
          pseudo
            ? "2 fichiers enregistrés dans Documents"
            : "Fichier enregistré dans Documents",
        );
        return;
      }

      downloadBlob(name, texte, "text/plain;charset=utf-8");
      if (pseudo) await saveRegistry(terms);
      toast.success(pseudo ? "2 fichiers téléchargés" : "Fichier téléchargé");
    } catch (err) {
      toast.error(`Téléchargement impossible : ${err.message ?? err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-accent-strong font-mono text-[10px] tracking-[0.14em] uppercase">
          Livrables prêts
        </span>
        <span className="text-muted-foreground font-mono text-[10px]">
          {count === 2 ? "2 fichiers" : "1 fichier"}
        </span>
      </div>

      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="cursor-pointer rounded-md bg-tint/8 px-2 py-2.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-tint/14 disabled:cursor-wait disabled:opacity-60"
      >
        {busy
          ? "Téléchargement…"
          : count === 2
            ? "Tout télécharger"
            : "Télécharger le document"}
      </button>

      {pseudo && (
        <p className="text-muted-foreground text-[10.5px] leading-[1.5]">
          Le document pseudonymisé et son registre de correspondances. Le
          registre est indispensable pour restaurer le document plus tard.
        </p>
      )}
    </div>
  );
}
