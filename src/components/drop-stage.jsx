"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { useIsTauri } from "@/hooks/use-is-tauri";
import { useAnonymizer } from "@/store/use-anonymizer";

/**
 * Ecran d'accueil : depot du document, et du registre de correspondances
 * lorsque le mode de-pseudonymisation l'exige.
 */
export function DropStage() {
  const mode = useAnonymizer((s) => s.mode);
  const registry = useAnonymizer((s) => s.registry);
  const openDocument = useAnonymizer((s) => s.openDocument);
  const openDroppedFile = useAnonymizer((s) => s.openDroppedFile);
  const openRegistry = useAnonymizer((s) => s.openRegistry);
  const loadSample = useAnonymizer((s) => s.loadSample);
  const tauri = useIsTauri();

  const pseudo = mode === "pseudo";

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-auto p-10">
      <header className="flex flex-col items-center gap-2.5 text-center">
        <p className="text-primary font-mono text-[10px] tracking-[0.2em] uppercase">
          {pseudo ? "Étape 01 — Document source" : "Étape 01 — Restauration"}
        </p>
        <h1 className="text-[30px] font-bold tracking-[-0.035em]">
          {pseudo
            ? "Déposez le document à pseudonymiser"
            : "Déposez le document pseudonymisé"}
        </h1>
        <p className="text-muted-foreground max-w-[460px] text-[13.5px] leading-[1.6]">
          {pseudo
            ? "Tout se passe en local. Les données structurées sont pré-détectées ; vous complétez ensuite vous-même la sélection des mots à remplacer."
            : "Ajoutez également le fichier Excel de correspondance généré lors de la pseudonymisation."}
        </p>
      </header>

      <div className="flex w-full max-w-[860px] justify-center gap-4">
        <DropZone
          accent
          onActivate={openDocument}
          onFile={(file) => openDroppedFile(file)}
          title="Glissez-déposez votre document"
          hint="PDF · DOCX · XLSX · TXT"
          action="ou parcourir les fichiers"
        />

        {!pseudo && (
          <DropZone
            onActivate={openRegistry}
            onFile={openRegistry}
            title="Registre de correspondance"
            hint={registry?.fileName ?? "Requis pour restaurer"}
            action="ou parcourir les fichiers"
          />
        )}
      </div>

      {/*
        Hors Tauri, l'extraction native n'est pas disponible : l'exercice de
        demonstration permet de parcourir les deux flux de bout en bout.
      */}
      {!tauri && (
        <button
          type="button"
          onClick={loadSample}
          className="text-muted-foreground cursor-pointer font-mono text-[10.5px] tracking-[0.1em] uppercase transition-colors hover:text-[#C7CCD3]"
        >
          ou charger le document d&apos;exemple
        </button>
      )}
    </div>
  );
}

function DropZone({ accent, onActivate, onFile, title, hint, action }) {
  const [dragging, setDragging] = useState(false);

  return (
    <button
      type="button"
      onClick={onActivate}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) onFile(file);
      }}
      className={cn(
        "flex min-h-[200px] max-w-[420px] flex-1 cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed p-8 text-center transition-colors",
        accent
          ? dragging
            ? "border-primary/70 bg-primary/8"
            : "border-primary/30 hover:border-primary/50 hover:bg-primary/4"
          : dragging
            ? "border-white/30 bg-white/5"
            : "border-white/15 hover:border-white/30 hover:bg-white/2",
      )}
    >
      <span
        className={cn(
          "mb-1 size-3.5 -translate-y-px rotate-[-45deg] border-b-2 border-l-2",
          accent ? "border-primary" : "border-white/40",
        )}
        aria-hidden
      />
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="font-mono text-[10.5px] tracking-[0.1em] text-[#6B747E] uppercase">
        {hint}
      </span>
      {action && (
        <span
          className={cn(
            "mt-1 text-[12.5px] font-semibold",
            accent ? "text-primary" : "text-[#98A1AC]",
          )}
        >
          {action}
        </span>
      )}
    </button>
  );
}
