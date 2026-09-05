"use client";

import { useMemo, useState } from "react";
import { FileUpIcon } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { findOccurrences } from "@/lib/tokenize";
import { familyLabel, TERM_TYPES, typeRgb } from "@/lib/types";
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
  const openRegistry = useAnonymizer((s) => s.openRegistry);

  const pseudo = mode === "pseudo";
  const running = status === "running";
  const count = terms.length;

  return (
    <aside
      data-tour="panneau"
      className="bg-panel flex min-h-0 w-[360px] flex-none flex-col border-l"
    >
      <header className="flex h-14 flex-none items-center justify-between gap-2 border-b px-5">
        <h2 className="text-[13.5px] font-semibold">Correspondances</h2>

        <span className="text-muted-foreground font-mono text-[11px] whitespace-nowrap">
          {count ? `${count} terme${count > 1 ? "s" : ""}` : "0 terme"}
        </span>
      </header>

      {/*
        Le registre reste importable une fois le document ouvert : sans cela,
        l'avoir oublie a l'ecran de depot obligeait a tout refermer.
      */}
      <div className="flex-none border-b px-5 py-3">
        <button
          type="button"
          onClick={openRegistry}
          className="bg-tint/6 hover:bg-tint/12 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[12px] font-bold text-foreground transition-colors"
        >
          <FileUpIcon className="size-3.5" aria-hidden />
          Importer des correspondances
        </button>
      </div>

      {pseudo && <TermSearch />}

      <div className="min-h-0 flex-1 overflow-auto">
        {count ? (
          terms.map((term) => (
            <TermRow key={term.id} term={term} editable={pseudo} />
          ))
        ) : (
          <EmptyState pseudo={pseudo} />
        )}
      </div>

      <footer
        data-tour="livrables"
        className="flex flex-none flex-col gap-3 border-t p-4"
      >
        <button
          type="button"
          data-tour="traitement"
          onClick={run}
          disabled={running}
          className={cn(
            "w-full rounded-lg px-[18px] py-3 text-[13px] font-bold transition-colors",
            running && "cursor-wait",
            count && !running
              ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
              : "cursor-pointer bg-tint/8 text-faint hover:bg-tint/12",
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

/**
 * Recherche et saisie directe, dans un seul champ : on tape un terme, le
 * nombre d'occurrences dans le document s'affiche aussitot, et la validation
 * cree la correspondance. Un terme absent du document reste ajoutable — une
 * graphie peut devoir figurer au registre sans apparaitre dans le texte.
 */
function TermSearch() {
  const doc = useAnonymizer((s) => s.doc);
  const addTermByText = useAnonymizer((s) => s.addTermByText);

  const [value, setValue] = useState("");
  const query = value.trim();

  const count = useMemo(
    () => (query ? findOccurrences(doc, query).length : 0),
    [doc, query],
  );

  function submit() {
    if (!query) return;
    if (addTermByText(query)) setValue("");
  }

  return (
    <div className="flex flex-none flex-col gap-1.5 border-b px-5 py-3">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Rechercher ou ajouter un terme…"
          aria-label="Rechercher ou ajouter un terme"
          className="bg-paper focus-visible:border-ring h-9 flex-1 rounded-md border px-2.5 text-[12px] text-foreground focus-visible:ring-0"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!query}
          className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer rounded-md px-3.5 text-[12px] font-bold transition-colors disabled:cursor-default disabled:opacity-40"
        >
          Ajouter
        </button>
      </div>

      {query && (
        <p className="text-muted-foreground font-mono text-[10px]">
          {count
            ? `${count} occurrence${count > 1 ? "s" : ""} dans le document`
            : "absent du document — sera ajouté au registre"}
        </p>
      )}
    </div>
  );
}

function TermRow({ term, editable }) {
  const setTermType = useAnonymizer((s) => s.setTermType);
  const setTermPseudo = useAnonymizer((s) => s.setTermPseudo);
  const removeTerm = useAnonymizer((s) => s.removeTerm);

  const n = term.hits.length;

  return (
    <div className="flex flex-col gap-2.5 border-b px-5 py-4 transition-colors hover:bg-tint/[0.045]">
      <div className="flex items-baseline gap-2.5">
        <span
          title={familyLabel(term.type)}
          className="term-dot size-1.5 flex-none translate-y-[-1px] rounded-full"
          style={{ "--mark": typeRgb(term.type) }}
        />
        <h3 className="min-w-0 flex-1 text-[13px] font-semibold break-words">
          {term.text}
        </h3>
        <span
          title={
            n
              ? undefined
              : "Ce terme ne figure pas dans le document : il ne sera pas remplacé."
          }
          className={cn(
            "flex-none font-mono text-[10px] whitespace-nowrap",
            n ? "text-muted-foreground" : "text-destructive font-semibold",
          )}
        >
          {n} occurrence{n > 1 ? "s" : ""}
          {term.auto ? " · auto" : ""}
        </span>
        <button
          type="button"
          onClick={() => removeTerm(term.id)}
          aria-label={`Retirer ${term.text}`}
          className="hover:text-destructive flex-none cursor-pointer text-[15px] leading-none text-faint transition-colors"
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
            className="bg-paper w-full cursor-pointer rounded-md border text-[11px] font-semibold text-foreground"
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
          className="bg-paper focus-visible:border-ring w-full rounded-md border px-2.5 py-2 font-mono text-[11px] text-foreground focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

function EmptyState({ pseudo }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-8 text-center">
      <span
        className="size-10 rounded-xl border border-dashed border-tint/18"
        style={{ animation: "anonymizer-pulse 2.4s ease-in-out infinite" }}
      />
      <p className="text-[13px] font-semibold text-dim">
        Aucun terme sélectionné
      </p>
      <p className="max-w-[230px] text-[12px] leading-[1.6] text-faint">
        {pseudo
          ? "Surlignez un mot ou une phrase dans le document pour créer une correspondance. Toutes ses occurrences seront traitées."
          : "Le registre chargé ne contient aucune correspondance applicable à ce document."}
      </p>
    </div>
  );
}
