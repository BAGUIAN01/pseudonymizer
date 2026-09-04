"use client";

import { cn } from "@/lib/utils";
import { useAnonymizer } from "@/store/use-anonymizer";

/**
 * Bandeau du document ouvert : la bascule entre le document source et le
 * resultat, centree, et la fermeture a droite.
 *
 * Le nom du fichier n'y figure pas : un nom long deformait la mise en page, et
 * l'utilisateur sait quel document il vient d'ouvrir.
 */
export function TopBar() {
  const mode = useAnonymizer((s) => s.mode);
  const view = useAnonymizer((s) => s.view);
  const status = useAnonymizer((s) => s.status);
  const setView = useAnonymizer((s) => s.setView);
  const reset = useAnonymizer((s) => s.reset);

  const pseudo = mode === "pseudo";
  const resultView = view === "result" && status === "done";

  return (
    <header className="grid h-14 flex-none grid-cols-[1fr_auto_1fr] items-center gap-4 border-b px-5">
      <span />

      <div className="flex gap-0.5 rounded-lg bg-tint/5 p-0.5" data-tour="apercu">
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
          className="hover:border-destructive/50 hover:text-destructive cursor-pointer rounded-lg border bg-tint/5 px-3 py-1.5 text-[12px] font-bold text-foreground transition-colors hover:bg-tint/10"
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
        "cursor-pointer rounded-[7px] px-[13px] py-1.5 text-xs font-bold transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-transparent text-strong hover:bg-tint/6",
      )}
    >
      {children}
    </button>
  );
}
