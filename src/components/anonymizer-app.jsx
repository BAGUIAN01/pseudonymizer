"use client";

import { useCallback } from "react";

import { ModeSidebar } from "@/components/mode-sidebar";
import { TopBar } from "@/components/top-bar";
import { DropStage } from "@/components/drop-stage";
import { DocumentView } from "@/components/document-view";
import { TermPanel } from "@/components/term-panel";
import { useTauriFileDrop } from "@/hooks/use-tauri-file-drop";
import { useAnonymizer } from "@/store/use-anonymizer";

/**
 * Fenetre applicative. L'interface occupe toute la surface disponible : c'est
 * un logiciel installe, pas une page web, et il n'y a donc aucun cadre de
 * fenetre a dessiner.
 */
export function AnonymizerApp() {
  const hasFile = useAnonymizer((s) => Boolean(s.document));
  const isReady = useAnonymizer((s) => s.isReady());
  const openDroppedFile = useAnonymizer((s) => s.openDroppedFile);

  const handleDroppedPaths = useCallback(
    (paths) => openDroppedFile(null, paths[0]),
    [openDroppedFile],
  );
  useTauriFileDrop(handleDroppedPaths);

  return (
    <main className="h-full overflow-auto">
      <div className="flex h-full min-w-[1024px]">
        <ModeSidebar />

        <div className="flex min-w-0 flex-1 flex-col border-l">
          {hasFile && <TopBar />}

          {isReady ? (
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(480px,1fr)_360px]">
              <DocumentView />
              <TermPanel />
            </div>
          ) : (
            <DropStage />
          )}
        </div>
      </div>
    </main>
  );
}
