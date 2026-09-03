"use client";

import { useMemo, useRef } from "react";

import { cn } from "@/lib/utils";
import { buildMarks } from "@/lib/tokenize";
import { typeColor } from "@/lib/types";
import { useAnonymizer } from "@/store/use-anonymizer";

/**
 * Rendu du document, token par token.
 *
 * Un clic sur un mot cree une correspondance ; un appui-glisser d'un mot a un
 * autre en cree une sur toute la plage. Cliquer un terme deja surligne le
 * retire. La bascule source / resultat se trouve dans le bandeau superieur.
 */
export function DocumentView() {
  const doc = useAnonymizer((s) => s.doc);
  const terms = useAnonymizer((s) => s.terms);
  const mode = useAnonymizer((s) => s.mode);
  const view = useAnonymizer((s) => s.view);
  const status = useAnonymizer((s) => s.status);
  const progress = useAnonymizer((s) => s.progress);
  const title = useAnonymizer((s) => s.document?.title);
  const addTerm = useAnonymizer((s) => s.addTerm);
  const removeTerm = useAnonymizer((s) => s.removeTerm);

  const anchor = useRef(null);

  const pseudo = mode === "pseudo";
  const running = status === "running";
  const resultView = view === "result" && status === "done";

  const marks = useMemo(() => buildMarks(terms), [terms]);

  return (
    <section className="relative flex min-w-0 flex-col">
      {running && (
        <div className="bg-background/85 absolute inset-0 z-3 flex flex-col items-center justify-center gap-[18px]">
          <span className="border-primary/20 border-t-primary size-[34px] animate-spin rounded-full border-2" />
          <p className="font-mono text-[11px] tracking-[0.12em] text-[#A9B3BD] uppercase">
            {pseudo ? "Substitution en cours" : "Restauration en cours"}
          </p>
          <div className="h-[3px] w-60 overflow-hidden rounded-full bg-white/8">
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-250"
              style={{ width: `${Math.round(progress)}%` }}
            />
          </div>
        </div>
      )}

      <p className="text-muted-foreground flex-none border-b px-8 py-3 text-[12.5px]">
        {resultView
          ? pseudo
            ? "Aperçu du document pseudonymisé"
            : "Aperçu du document restauré"
          : "Cliquez un mot, ou glissez sur plusieurs mots, pour créer une correspondance"}
      </p>

      <div className="min-h-0 flex-1 overflow-auto px-8 py-10">
        <article className="mx-auto flex max-w-[720px] flex-col gap-[18px]">
          <h2 className="text-xl font-bold tracking-[-0.025em] text-[#F1F3F5]">
            {title ?? "Document"}
          </h2>

          {doc.map((tokens, p) => (
            <p
              key={p}
              className={cn(
                "text-[14.5px] leading-[2.05] text-[#C3CAD2] text-pretty",
                !resultView && "select-none-doc",
              )}
            >
              {renderParagraph({
                tokens,
                p,
                marks,
                resultView,
                pseudo,
                anchor,
                addTerm,
                removeTerm,
              })}
            </p>
          ))}
        </article>
      </div>
    </section>
  );
}

/**
 * Parcourt les tokens d'un paragraphe et produit les spans a afficher.
 * Les tokens couverts par une occurrence sont fusionnes en un seul span.
 */
function renderParagraph({
  tokens,
  p,
  marks,
  resultView,
  pseudo,
  anchor,
  addTerm,
  removeTerm,
}) {
  const nodes = [];
  let i = 0;

  while (i < tokens.length) {
    const mark = marks[`${p}:${i}`];

    if (mark) {
      const { term, hit } = mark;
      const color = typeColor(term.type);
      const original = tokens
        .slice(hit.from, hit.to + 1)
        .map((t) => t.text)
        .join("");

      if (resultView) {
        // En pseudonymisation le document affiche le pseudonyme ;
        // en restauration il affiche la valeur d'origine.
        nodes.push(
          <span
            key={`${p}:${i}`}
            className="bg-primary/13 rounded-md px-1.5 py-0.5 font-mono text-[12.5px] text-[#DCFF8E]"
          >
            {pseudo ? term.pseudo : term.text}
          </span>,
        );
      } else {
        nodes.push(
          <span
            key={`${p}:${i}`}
            role="button"
            tabIndex={0}
            title={`${term.pseudo} — cliquer pour retirer`}
            onMouseUp={() => removeTerm(term.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                removeTerm(term.id);
              }
            }}
            className="cursor-pointer rounded-md px-[5px] py-0.5 transition-colors"
            style={{
              background: `${color}24`,
              color,
              borderBottom: `1px solid ${color}80`,
            }}
          >
            {original}
          </span>,
        );
      }

      i = hit.to + 1;
      continue;
    }

    const token = tokens[i];

    if (token.word && !resultView) {
      const index = i;
      nodes.push(
        <span
          key={`${p}:${i}`}
          role="button"
          tabIndex={0}
          onMouseDown={() => {
            anchor.current = { p, i: index };
          }}
          onMouseUp={() => {
            const from =
              anchor.current && anchor.current.p === p
                ? anchor.current.i
                : index;
            anchor.current = null;
            addTerm(p, from, index);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              addTerm(p, index, index);
            }
          }}
          className="hover:bg-primary/16 cursor-pointer rounded-[5px] px-0.5 py-px transition-colors hover:text-[#EFFFD1]"
        >
          {token.text}
        </span>,
      );
    } else {
      nodes.push(
        <span key={`${p}:${i}`} className="whitespace-pre-wrap">
          {token.text}
        </span>,
      );
    }

    i++;
  }

  return nodes;
}
