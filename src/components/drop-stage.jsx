"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
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
  const openDroppedRegistry = useAnonymizer((s) => s.openDroppedRegistry);
  const loadSample = useAnonymizer((s) => s.loadSample);
  const setOnboardingDone = useAnonymizer((s) => s.setOnboardingDone);

  const pseudo = mode === "pseudo";

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-auto p-10">
      <header className="flex flex-col items-center gap-2.5 text-center">
        <p className="text-accent-strong font-mono text-[10px] tracking-[0.2em] uppercase">
          {pseudo ? "Étape 01 — Document source" : "Étape 01 — Restauration"}
        </p>
        <h1 className="text-[30px] font-bold tracking-[-0.035em]">
          {pseudo
            ? "Déposez le document à pseudonymiser"
            : "Déposez le document à restaurer"}
        </h1>
        <p className="text-muted-foreground max-w-[460px] text-[13.5px] leading-[1.6]">
          {pseudo
            ? "Tout se passe en local. Les données structurées sont pré-détectées ; vous complétez ensuite vous-même la sélection des mots à remplacer."
            : "Le texte revenu de votre traitement : ses pseudonymes seront remplacés par les valeurs d’origine. Le document n’a pas besoin d’être identique à celui de départ."}
        </p>
        {!pseudo && registry?.fromProject && (
          <p className="text-accent-strong font-mono text-[10.5px] tracking-[0.1em]">
            Correspondances fournies par le projet « {registry.fromProject} »
          </p>
        )}
      </header>

      <div className="flex w-full flex-1 gap-4" data-tour="depot">
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
            compacte
            onActivate={openRegistry}
            onFile={(file) => openDroppedRegistry(file)}
            title="Registre de correspondance"
            hint={
              registry?.fromProject
                ? "Déjà chargé — déposez-en un autre pour le remplacer"
                : (registry?.fileName ?? "Requis pour restaurer")
            }
            action="ou parcourir les fichiers"
          />
        )}
      </div>

      {/*
        Document d'exercice, sans passer par un fichier. Il sert de bac a
        sable, et c'est sur lui que s'appuie la visite guidee du premier
        lancement : sans document ouvert, les trois quarts de l'application
        n'existent pas a l'ecran et ne peuvent donc pas etre montres.
      */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={loadSample}
          className="text-muted-foreground cursor-pointer font-mono text-[10.5px] tracking-[0.1em] uppercase transition-colors hover:text-foreground"
        >
          ou charger le document d&apos;exemple
        </button>

        <span className="text-faint" aria-hidden>
          ·
        </span>

        {/*
          Le guide se rejoue depuis l'ecran d'accueil : c'est la que se trouve
          celui qui vient de passer la visite, et non dans le dialogue des
          projets ou il etait seul a figurer.
        */}
        <button
          type="button"
          onClick={() => setOnboardingDone(false)}
          className="text-muted-foreground cursor-pointer font-mono text-[10.5px] tracking-[0.1em] uppercase transition-colors hover:text-foreground"
        >
          revoir le guide
        </button>
      </div>
    </div>
  );
}

function DropZone({ accent, compacte, onActivate, onFile, title, hint, action }) {
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
        "flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed p-8 text-center transition-colors",
        compacte ? "w-[320px] flex-none" : "flex-1",
        accent
          ? dragging
            ? "border-accent-strong/80 bg-primary/10"
            : "border-accent-strong/45 hover:border-accent-strong/70 hover:bg-primary/5"
          : dragging
            ? "border-tint/55 bg-tint/8"
            : "border-tint/28 hover:border-tint/45 hover:bg-tint/4",
      )}
    >
      <span
        className={cn(
          "mb-1 size-3.5 -translate-y-px rotate-[-45deg] border-b-2 border-l-2",
          accent ? "border-accent-strong" : "border-tint/55",
        )}
        aria-hidden
      />
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="font-mono text-[10.5px] tracking-[0.1em] text-faint uppercase">
        {hint}
      </span>
      {action && (
        <span
          className={cn(
            "mt-1 text-[12.5px] font-semibold",
            accent ? "text-accent-strong" : "text-dim",
          )}
        >
          {action}
        </span>
      )}
    </button>
  );
}
