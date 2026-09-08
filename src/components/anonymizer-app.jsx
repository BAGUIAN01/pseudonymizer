"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { MobileApp } from "@/components/mobile/mobile-app";
import { ModeSidebar } from "@/components/mode-sidebar";
import { TopBar } from "@/components/top-bar";
import { DropStage } from "@/components/drop-stage";
import { DocumentView } from "@/components/document-view";
import { TermPanel } from "@/components/term-panel";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTauriFileDrop } from "@/hooks/use-tauri-file-drop";
import { useAnonymizer } from "@/store/use-anonymizer";

// La visite lit l'etat enregistre sur le poste : rien a faire au rendu serveur.
const Tour = dynamic(() => import("@/components/tour").then((m) => m.Tour), {
  ssr: false,
});

/**
 * Choix de la disposition.
 *
 * La bascule est faite par la feuille de style, pas par le script : la
 * largeur n'existe pas au rendu serveur, et attendre un effet pour la mesurer
 * ferait peindre la mauvaise disposition avant de la corriger. Les deux
 * arbres sont donc rendus, la requete de media en montre un — puis, une fois
 * la mesure connue, l'autre est demonte pour ne pas garder un document en
 * double dans le DOM.
 *
 * Le point de rupture est celui de `md`, et il est repete dans
 * `useIsMobile` : les deux doivent dire la meme chose.
 */
export function AnonymizerApp() {
  const isMobile = useIsMobile();

  return (
    <>
      {isMobile !== true && (
        <div className="hidden h-full md:block">
          <DesktopApp />
        </div>
      )}
      {isMobile !== false && (
        <div className="h-full md:hidden">
          <MobileApp />
        </div>
      )}
    </>
  );
}

/**
 * Fenetre applicative. L'interface occupe toute la surface disponible : c'est
 * un logiciel installe, pas une page web, et il n'y a donc aucun cadre de
 * fenetre a dessiner.
 *
 * Toute la zone de travail accepte le glisser-deposer, a n'importe quel moment
 * du flux : deposer un fichier remplace le document ouvert.
 */
function DesktopApp() {
  const isReady = useAnonymizer((s) => s.isReady());
  const openDroppedAny = useAnonymizer((s) => s.openDroppedAny);

  const [dragging, setDragging] = useState(false);
  // Les evenements de survol se declenchent aussi en entrant dans les enfants :
  // on compte les entrees et sorties pour ne relacher qu'a la vraie sortie.
  const depth = useRef(0);

  const handleDroppedPaths = useCallback(
    (paths) => {
      depth.current = 0;
      setDragging(false);
      openDroppedAny(null, paths[0]);
    },
    [openDroppedAny],
  );
  useTauriFileDrop(handleDroppedPaths);

  function carriesFiles(event) {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  return (
    <main className="h-full overflow-hidden">
      <div className="flex h-full">
        <ModeSidebar />

        <div
          className="bg-paper relative flex min-w-0 flex-1 flex-col border-l"
          onDragEnter={(e) => {
            if (!carriesFiles(e)) return;
            depth.current += 1;
            setDragging(true);
          }}
          onDragOver={(e) => {
            if (carriesFiles(e)) e.preventDefault();
          }}
          onDragLeave={() => {
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) setDragging(false);
          }}
          onDrop={(e) => {
            if (!carriesFiles(e)) return;
            e.preventDefault();
            depth.current = 0;
            setDragging(false);
            const file = e.dataTransfer?.files?.[0];
            if (file) openDroppedAny(file);
          }}
        >
          {isReady && <TopBar />}

          {isReady ? (
            <div className="flex min-h-0 flex-1">
              <DocumentView />
              <TermPanel />
            </div>
          ) : (
            <DropStage />
          )}

          {dragging && <DropOverlay />}
        </div>
      </div>

      <Tour />
    </main>
  );
}

/**
 * Voile affiche pendant le survol d'un fichier. `pointer-events-none` est
 * indispensable : sans lui, le voile deviendrait la cible du depot et couperait
 * le comptage des entrees et sorties.
 */
function DropOverlay() {
  return (
    <div className="bg-background/90 pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
      <div className="flex size-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-tint/35">
        <span
          className="mb-1 size-3.5 -translate-y-px rotate-[-45deg] border-b-2 border-l-2 border-tint/60"
          aria-hidden
        />
        <p className="text-[15px] font-semibold">Déposez le fichier</p>
        <p className="font-mono text-[10.5px] tracking-[0.1em] text-faint uppercase">
          PDF · DOCX · XLSX · TXT
        </p>
      </div>
    </div>
  );
}
