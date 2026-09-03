"use client";

import { toast } from "sonner";

import {
  downloadBlob,
  isTauri,
  registryToCsv,
  revealInFolder,
} from "@/lib/backend";
import { useIsTauri } from "@/hooks/use-is-tauri";
import { useAnonymizer } from "@/store/use-anonymizer";

/**
 * Recuperation des fichiers produits.
 *
 * Sous Tauri les fichiers sont deja ecrits sur le disque : les boutons ouvrent
 * l'explorateur, comme le fait le logiciel existant. Dans un navigateur, ils
 * declenchent un telechargement du texte et du registre.
 */
export function Deliverables() {
  const mode = useAnonymizer((s) => s.mode);
  const terms = useAnonymizer((s) => s.terms);
  const fileName = useAnonymizer((s) => s.document?.fileName);
  const title = useAnonymizer((s) => s.document?.title);
  const deliverables = useAnonymizer((s) => s.deliverables);
  const resultParagraphs = useAnonymizer((s) => s.resultParagraphs);
  const tauri = useIsTauri();

  const pseudo = mode === "pseudo";

  function saveDocument() {
    if (isTauri() && deliverables?.documentPath) {
      revealInFolder(deliverables.documentPath);
      return;
    }
    const base = (fileName ?? "document").replace(/\.[^.]+$/, "");
    const name = base + (pseudo ? "_pseudonymise.txt" : "_restaure.txt");
    const body = `${title ?? base}\n\n${resultParagraphs().join("\n\n")}`;
    // Le BOM garantit l'ouverture correcte des accents sous Windows.
    downloadBlob(name, `﻿${body}`, "text/plain;charset=utf-8");
    toast("Document téléchargé");
  }

  function saveRegistry() {
    if (isTauri() && deliverables?.registryPath) {
      revealInFolder(deliverables.registryPath);
      return;
    }
    downloadBlob(
      "Registre_correspondances.csv",
      `﻿${registryToCsv(terms)}`,
      "text/csv;charset=utf-8",
    );
    toast("Registre téléchargé");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-primary font-mono text-[10px] tracking-[0.14em] uppercase">
          Livrables prêts
        </span>
        <span className="text-muted-foreground font-mono text-[10px]">
          {pseudo ? "2 fichiers" : "1 fichier"}
        </span>
      </div>

      <div className={pseudo ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
        <SecondaryButton onClick={saveDocument}>
          {tauri ? "Ouvrir le document" : "Document"}
        </SecondaryButton>
        {pseudo && (
          <SecondaryButton onClick={saveRegistry}>
            {tauri ? "Ouvrir le registre" : "Registre .csv"}
          </SecondaryButton>
        )}
      </div>
    </div>
  );
}

function SecondaryButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-md bg-white/5 px-2 py-2.5 text-[11.5px] font-semibold text-[#C7CCD3] transition-colors hover:bg-white/10"
    >
      {children}
    </button>
  );
}
