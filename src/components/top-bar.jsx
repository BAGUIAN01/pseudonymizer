"use client";

import { cn } from "@/lib/utils";
import { useAnonymizer } from "@/store/use-anonymizer";

/**
 * Bandeau du document ouvert : son nom a gauche, la bascule entre le document
 * source et le resultat centree, la fermeture a droite.
 *
 * La grille en trois colonnes garde la bascule centree sur la fenetre, quelle
 * que soit la longueur du nom de fichier.
 */
export function TopBar() {
  const fileName = useAnonymizer((s) => s.document?.fileName);
  const mode = useAnonymizer((s) => s.mode);
  const view = useAnonymizer((s) => s.view);
  const status = useAnonymizer((s) => s.status);
  const setView = useAnonymizer((s) => s.setView);
  const reset = useAnonymizer((s) => s.reset);

  const pseudo = mode === "pseudo";
  const resultView = view === "result" && status === "done";

  return (
    <header className="grid h-14 flex-none grid-cols-[1fr_auto_1fr] items-center gap-4 border-b px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="bg-primary size-1.5 flex-none rounded-full" />
        <span className="truncate text-[12.5px] text-[#C7CCD3]">
          {fileName}
        </span>
      </div>

      <div className="flex gap-0.5 rounded-lg bg-white/5 p-0.5">
        <SegmentButton active={!resultView} onClick={() => setView("source")}>
          Document
        </SegmentButton>
        <SegmentButton active={resultView} onClick={() => setView("result")}>
          {pseudo ? "Pseudonymisé" : "Restauré"}
        </SegmentButton>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={reset}
          className="hover:text-destructive cursor-pointer text-[12.5px] font-semibold text-[#98A1AC] transition-colors"
        >
          Fermer le document
        </button>
      </div>
    </header>
  );
}

function SegmentButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-[7px] px-[13px] py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground bg-transparent hover:text-[#C7CCD3]",
      )}
    >
      {children}
    </button>
  );
}
