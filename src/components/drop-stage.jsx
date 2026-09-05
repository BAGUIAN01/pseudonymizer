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
  const document = useAnonymizer((s) => s.document);
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
            ? "Tout se passe en local. Les données structurées sont pré-détectées ; vous complétez ensuite vous-même la sélection. Un registre existant peut être chargé pour reprendre des correspondances déjà établies."
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
          title={
            <>
              Glissez-déposez votre <Mot>document</Mot>{" "}
              {pseudo ? "à pseudonymiser" : "à restaurer"}
            </>
          }
          hint="PDF · DOCX · XLSX · TXT"
          action="ou parcourir les fichiers"
          charge={document?.fileName}
        />

        <DropZone
          compacte
          onActivate={openRegistry}
          onFile={(file) => openDroppedRegistry(file)}
          title={
            <>
              Le <Mot>registre</Mot> de correspondances
            </>
          }
          hint={
            registry?.fromProject
              ? "Déjà chargé — déposez-en un autre"
              : (registry?.fileName ??
                (pseudo ? "Facultatif — .xlsx" : "Requis pour restaurer"))
          }
          action="ou parcourir les fichiers"
          charge={registry?.fromProject ? null : registry?.fileName}
        />
      </div>

      <ContinueBar />

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

/**
 * Barre de validation : rien ne s'ouvre tant qu'elle n'a pas ete actionnee.
 *
 * Deposer un fichier ouvrait auparavant l'espace de travail sur-le-champ, sans
 * laisser le temps de verifier ce qui avait ete pris ni d'ajouter le registre.
 */
function ContinueBar() {
  const mode = useAnonymizer((s) => s.mode);
  const document = useAnonymizer((s) => s.document);
  const registry = useAnonymizer((s) => s.registry);
  const confirmStage = useAnonymizer((s) => s.confirmStage);

  const pseudo = mode === "pseudo";
  const registreManquant = !pseudo && !registry;
  const pret = Boolean(document) && !registreManquant;

  if (!document) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      {registreManquant && (
        <p className="text-[12px] text-dim">
          Ajoutez le registre de correspondances pour pouvoir restaurer ce
          document.
        </p>
      )}

      <button
        type="button"
        onClick={confirmStage}
        disabled={!pret}
        className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer rounded-xl px-8 py-3 text-[13px] font-bold transition-colors disabled:cursor-default disabled:opacity-40"
      >
        {pseudo ? "Continuer vers la sélection" : "Continuer vers la restauration"}
      </button>
    </div>
  );
}

/** Le mot qui designe ce que la zone attend, detache du reste de la phrase. */
function Mot({ children }) {
  return (
    <span className="font-bold underline decoration-2 underline-offset-4">
      {children}
    </span>
  );
}

function DropZone({
  accent,
  charge,
  compacte,
  onActivate,
  onFile,
  title,
  hint,
  action,
}) {
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
        "flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
        compacte ? "w-[320px] flex-none" : "flex-1",
        accent
          ? dragging
            ? "border-accent-strong bg-primary/10"
            : "border-accent-strong/60 hover:border-accent-strong hover:bg-primary/5"
          : dragging
            ? "border-tint/70 bg-tint/8"
            : "border-tint/40 hover:border-tint/60 hover:bg-tint/4",
      )}
    >
      <span
        className={cn(
          "mb-1 -translate-y-px border-b-2 border-l-2",
          charge ? "size-3 rotate-[-45deg]" : "size-3.5 rotate-[-45deg]",
          charge
            ? "border-accent-strong"
            : accent
              ? "border-accent-strong"
              : "border-tint/55",
        )}
        aria-hidden
      />
      {charge ? (
        <>
          <span className="max-w-full truncate text-[15px] font-semibold">
            {charge}
          </span>
          <span className="text-accent-strong font-mono text-[10.5px] font-semibold tracking-[0.1em] uppercase">
            Chargé
          </span>
        </>
      ) : (
        <>
          <span className="text-[15px] font-semibold">{title}</span>
          <span className="font-mono text-[10.5px] tracking-[0.1em] text-faint uppercase">
            {hint}
          </span>
        </>
      )}
      {action && (
        <span
          className={cn(
            "mt-1 text-[12.5px] font-semibold",
            accent ? "text-accent-strong" : "text-dim",
          )}
        >
          {charge ? "remplacer le fichier" : action}
        </span>
      )}
    </button>
  );
}
