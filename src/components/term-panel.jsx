"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TERM_TYPES, typeColor } from "@/lib/types";
import { useAnonymizer } from "@/store/use-anonymizer";
import { Deliverables } from "@/components/deliverables";

/**
 * Panneau lateral : la liste des correspondances, editable, et le lancement
 * du traitement.
 *
 * La liste est une suite de lignes separees par un filet, et non une pile de
 * cartes : a une quarantaine de termes, l'empilement devient illisible.
 */
export function TermPanel() {
  const mode = useAnonymizer((s) => s.mode);
  const terms = useAnonymizer((s) => s.terms);
  const status = useAnonymizer((s) => s.status);
  const run = useAnonymizer((s) => s.run);

  const pseudo = mode === "pseudo";
  const running = status === "running";
  const count = terms.length;

  return (
    <aside className="flex min-h-0 flex-col border-l bg-white/[0.015]">
      <header className="flex h-14 flex-none items-center justify-between gap-3 border-b px-5">
        <h2 className="text-[13.5px] font-semibold">Correspondances</h2>
        <span className="text-muted-foreground font-mono text-[11px] whitespace-nowrap">
          {count ? `${count} terme${count > 1 ? "s" : ""}` : "0 terme"}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {count ? (
          terms.map((term) => (
            <TermRow key={term.id} term={term} editable={pseudo} />
          ))
        ) : (
          <EmptyState pseudo={pseudo} />
        )}
      </div>

      <footer className="flex flex-none flex-col gap-3 border-t p-4">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className={cn(
            "w-full rounded-lg px-[18px] py-3 text-[13px] font-bold transition-colors",
            running && "cursor-wait",
            count && !running
              ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
              : "cursor-pointer bg-white/8 text-[#6B747E] hover:bg-white/12",
          )}
        >
          {running
            ? "Traitement…"
            : pseudo
              ? "Pseudonymiser le document"
              : "Dé-pseudonymiser le document"}
        </button>

        {status === "done" && <Deliverables />}
      </footer>
    </aside>
  );
}

function TermRow({ term, editable }) {
  const setTermType = useAnonymizer((s) => s.setTermType);
  const setTermPseudo = useAnonymizer((s) => s.setTermPseudo);
  const removeTerm = useAnonymizer((s) => s.removeTerm);

  const color = typeColor(term.type);
  const n = term.hits.length;

  return (
    <div className="flex flex-col gap-2.5 border-b px-5 py-4 transition-colors hover:bg-white/[0.02]">
      <div className="flex items-baseline gap-2.5">
        <h3 className="min-w-0 flex-1 text-[13px] font-semibold break-words">
          {term.text}
        </h3>
        <span className="text-muted-foreground flex-none font-mono text-[10px] whitespace-nowrap">
          {n} occurrence{n > 1 ? "s" : ""}
          {term.auto ? " · auto" : ""}
        </span>
        <button
          type="button"
          onClick={() => removeTerm(term.id)}
          aria-label={`Retirer ${term.text}`}
          className="hover:text-destructive flex-none cursor-pointer text-[15px] leading-none text-[#5C646E] transition-colors"
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-[120px_1fr] gap-2">
        <Select
          value={term.type}
          onValueChange={(value) => setTermType(term.id, value)}
          disabled={!editable}
        >
          <SelectTrigger
            size="sm"
            className="w-full cursor-pointer rounded-md border-0 text-[11px] font-semibold"
            style={{ background: `${color}1F`, color }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TERM_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={term.pseudo}
          onChange={(e) => setTermPseudo(term.id, e.target.value)}
          readOnly={!editable}
          aria-label={`Pseudonyme de ${term.text}`}
          className="bg-primary/10 focus-visible:bg-primary/18 w-full rounded-md border-0 px-2.5 py-2 font-mono text-[11px] text-[#DCFF8E] focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

function EmptyState({ pseudo }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-8 text-center">
      <span
        className="size-10 rounded-xl border border-dashed border-white/18"
        style={{ animation: "anonymizer-pulse 2.4s ease-in-out infinite" }}
      />
      <p className="text-[13px] font-semibold text-[#8A9199]">
        Aucun terme sélectionné
      </p>
      <p className="max-w-[230px] text-[12px] leading-[1.6] text-[#5F676F]">
        {pseudo
          ? "Surlignez un mot ou une phrase dans le document pour créer une correspondance. Toutes ses occurrences seront traitées."
          : "Le registre chargé ne contient aucune correspondance applicable à ce document."}
      </p>
    </div>
  );
}
