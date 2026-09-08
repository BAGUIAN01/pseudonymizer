"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Deliverables } from "@/components/deliverables";
import { Input } from "@/components/ui/input";
import { guessType } from "@/lib/detect";
import { buildMarks, entityRangeAt, findOccurrences, phraseAt } from "@/lib/tokenize";
import { familyLabel, TERM_TYPES, typeLabel, typeRgb } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAnonymizer } from "@/store/use-anonymizer";
import { Scrim, Sheet } from "./sheet";

/** Duree au-dela de laquelle un appui devient un appui long. */
const LONG_PRESS = 420;
/** Deplacement au-dela duquel le geste est un defilement, pas un appui. */
const SLOP = 10;

/**
 * Espace de travail tactile.
 *
 * La selection au curseur du bureau — glisser sur le texte, double-cliquer un
 * nom — n'a pas d'equivalent au doigt : le glissement fait defiler et le
 * double-tap zoome. Elle est donc remplacee par deux gestes : un appui prend
 * le mot, un appui long prend l'entite qui l'entoure.
 *
 * La barre de confirmation ancree a la selection devient une feuille basse :
 * a 400 px de large et posee pres du texte, elle tombait hors de portee du
 * pouce et sous le clavier.
 */
export function Workspace() {
  const doc = useAnonymizer((s) => s.doc);
  const terms = useAnonymizer((s) => s.terms);
  const mode = useAnonymizer((s) => s.mode);
  const view = useAnonymizer((s) => s.view);
  const status = useAnonymizer((s) => s.status);
  const progress = useAnonymizer((s) => s.progress);
  const document = useAnonymizer((s) => s.document);
  const addTerm = useAnonymizer((s) => s.addTerm);
  const setView = useAnonymizer((s) => s.setView);
  const reset = useAnonymizer((s) => s.reset);
  const run = useAnonymizer((s) => s.run);

  const [draft, setDraft] = useState(null);
  const [openTerm, setOpenTerm] = useState(null);
  const [livrablesFermes, setLivrablesFermes] = useState(false);
  const [snap, setSnap] = useState(0);
  const [barHeight, setBarHeight] = useState(0);

  const barRef = useRef(null);
  const press = useRef(null);

  const pseudo = mode === "pseudo";
  const running = status === "running";
  const resultat = status === "done" && view === "result";
  const selectable = !running && !resultat && pseudo;

  const marks = useMemo(() => buildMarks(terms), [terms]);
  const terme = terms.find((t) => t.id === openTerm) ?? null;

  // Le bandeau flotte au-dessus du texte : le corps se decale de sa hauteur,
  // mesuree plutot que devinee — elle change avec l'invite et l'apercu.
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    observer.observe(el);
    setBarHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, []);

  // Les livrables s'annoncent d'eux-memes une fois le traitement fini : c'est
  // une deduction de l'etat, pas un effet — l'utilisateur peut les refermer,
  // et un nouveau traitement les represente.
  const livrables = status === "done" && !livrablesFermes;

  const lancer = useCallback(() => {
    setLivrablesFermes(false);
    run();
  }, [run]);

  const capture = useCallback(
    (p, from, to) => {
      const text = phraseAt(doc, p, from, to).trim();
      if (!text) return;
      setDraft({
        p,
        from,
        to,
        text,
        type: guessType(text),
        count: findOccurrences(doc, text).length,
      });
      navigator.vibrate?.(8);
    },
    [doc],
  );

  function onPointerDown(event) {
    const el = event.target.closest?.("[data-i]");
    if (!el || running || resultat) return;

    const p = Number(el.dataset.p);
    const i = Number(el.dataset.i);
    const state = { x: event.clientX, y: event.clientY, el, fired: false, timer: null };
    press.current = state;

    if (!el.dataset.term && selectable && doc[p]?.[i]?.word) {
      state.timer = window.setTimeout(() => {
        state.fired = true;
        const range = entityRangeAt(doc, p, i);
        if (range) capture(p, range.from, range.to);
      }, LONG_PRESS);
    }
  }

  function onPointerMove(event) {
    const state = press.current;
    if (!state) return;
    if (
      Math.abs(event.clientX - state.x) > SLOP ||
      Math.abs(event.clientY - state.y) > SLOP
    ) {
      window.clearTimeout(state.timer);
      press.current = null;
    }
  }

  function onPointerUp() {
    const state = press.current;
    press.current = null;
    if (!state) return;
    window.clearTimeout(state.timer);
    if (state.fired) return;

    const { el } = state;
    if (el.dataset.term) {
      setOpenTerm(Number(el.dataset.term));
      return;
    }
    if (!selectable) return;

    const p = Number(el.dataset.p);
    const i = Number(el.dataset.i);
    if (doc[p]?.[i]?.word) capture(p, i, i);
  }

  function confirmDraft() {
    if (!draft) return;
    addTerm(draft.p, draft.from, draft.to, draft.type);
    setDraft(null);
  }

  const modale = draft || terme || livrables;

  return (
    <div className="screen-push bg-paper relative flex h-full flex-col overflow-clip">
      <div ref={barRef} className="glass glass-bar absolute inset-x-0 top-0 z-20">
        <header className="flex flex-col gap-1.5 px-5 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-3">
          <div className="flex items-center justify-between gap-3.5">
            <button
              type="button"
              onClick={reset}
              className="cursor-pointer font-mono text-[9.5px] font-semibold tracking-[0.16em] text-dim uppercase"
            >
              Fermer
            </button>
            <span className="font-mono text-[9.5px] tracking-[0.16em] text-faint uppercase">
              {pseudo ? "Pseudonymisation" : "Restauration"}
            </span>
          </div>
          <p className="text-[15px] font-semibold break-words text-strong">
            {document?.fileName ?? "Document"}
          </p>
        </header>

        {status === "done" ? (
          <div className="flex gap-5 px-5 pb-[11px]">
            {[
              ["source", "Document"],
              ["result", pseudo ? "Pseudonymisé" : "Restauré"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                aria-pressed={view === value}
                className={cn(
                  "cursor-pointer py-0.5 text-[13px] font-semibold underline-offset-[7px] decoration-2",
                  view === value
                    ? "text-accent-strong font-bold text-strong underline decoration-current"
                    : "text-faint",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <p className="px-5 pb-3 text-[12px] text-faint">
            {pseudo
              ? "Appuyez un mot · maintenez pour l’entité entière"
              : "Correspondances du registre · appuyez pour inspecter"}
          </p>
        )}
      </div>

      <div
        style={{ paddingTop: barHeight }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain select-none"
      >
        <article className="px-5 pt-4 pb-[132px]">
          <h2 className="mb-4 text-[17px] font-bold tracking-[-0.028em] text-balance text-strong">
            {document?.title ?? "Document"}
          </h2>
          {doc.map((tokens, p) => (
            <p
              key={p}
              className="mb-[18px] text-[14.5px] leading-[2.05] text-pretty text-foreground"
            >
              {renderParagraph({ tokens, p, marks, draft, resultat, pseudo })}
            </p>
          ))}
        </article>
      </div>

      {running && (
        <div className="bg-paper absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 p-10">
          <span className="border-primary/15 border-t-primary size-[30px] animate-spin rounded-full border-2" />
          <p className="font-mono text-[9.5px] tracking-[0.16em] text-faint uppercase">
            {pseudo ? "Substitution en cours" : "Restauration en cours"}
          </p>
          <div className="h-0.5 w-[200px] overflow-hidden bg-tint/10">
            <div
              className="bg-primary h-full transition-[width] duration-200"
              style={{ width: `${Math.round(progress)}%` }}
            />
          </div>
        </div>
      )}

      <TermsSheet snap={snap} onSnap={setSnap} onTerm={setOpenTerm} onRun={lancer} />

      {modale && (
        <Scrim
          onClick={() => {
            setDraft(null);
            setOpenTerm(null);
            setLivrablesFermes(true);
          }}
        />
      )}

      {draft && (
        <DraftSheet
          draft={draft}
          onType={(type) => setDraft((d) => (d ? { ...d, type } : d))}
          onConfirm={confirmDraft}
          onClose={() => setDraft(null)}
        />
      )}

      {terme && !draft && (
        <TermSheet term={terme} editable={pseudo} onClose={() => setOpenTerm(null)} />
      )}

      {livrables && !draft && !terme && (
        <LivrablesSheet onClose={() => setLivrablesFermes(true)} />
      )}
    </div>
  );
}

/**
 * Rendu d'un paragraphe, token par token.
 *
 * Chaque span porte sa position : c'est ce qui permet de ramener un appui a
 * une plage de tokens. Les tokens couverts par une occurrence sont fusionnes
 * en un seul span, comme au bureau.
 */
function renderParagraph({ tokens, p, marks, draft, resultat, pseudo }) {
  const nodes = [];
  let i = 0;

  while (i < tokens.length) {
    if (draft && draft.p === p && draft.from === i) {
      nodes.push(
        <span
          key={`d${i}`}
          className="rounded-[5px] bg-tint/14 px-[3px] py-0.5 text-strong"
        >
          {tokens
            .slice(draft.from, draft.to + 1)
            .map((t) => t.text)
            .join("")}
        </span>,
      );
      i = draft.to + 1;
      continue;
    }

    const mark = marks[`${p}:${i}`];
    if (mark) {
      const { term, hit } = mark;
      const original = tokens
        .slice(hit.from, hit.to + 1)
        .map((t) => t.text)
        .join("");

      nodes.push(
        resultat ? (
          <span
            key={i}
            style={{ "--mark": typeRgb(term.type) }}
            className="term-pseudo rounded-[5px] px-[5px] py-0.5 font-mono text-[12.5px] text-strong"
          >
            {pseudo ? term.pseudo : term.text}
          </span>
        ) : (
          <span
            key={i}
            data-term={term.id}
            data-p={p}
            data-i={i}
            style={{ "--mark": typeRgb(term.type) }}
            className="term-mark rounded-[5px] px-[3px] py-0.5 text-strong underline decoration-2 underline-offset-4"
          >
            {original}
          </span>
        ),
      );
      i = hit.to + 1;
      continue;
    }

    nodes.push(
      <span key={i} data-p={p} data-i={i} className="whitespace-pre-wrap">
        {tokens[i].text}
      </span>,
    );
    i += 1;
  }

  return nodes;
}

/**
 * Le type d'une donnee est un choix, pas une action : ni pastille pleine, ni
 * vert de marque. L'option retenue est soulignee de la teinte de sa famille,
 * le meme langage que les marques du document.
 */
function TypeOptions({ value, onChange, locked }) {
  if (locked) {
    return (
      <p className="px-5 pb-4 text-[13px] font-bold text-strong">
        {typeLabel(value)}
      </p>
    );
  }

  return (
    <div className="flex gap-5 overflow-x-auto px-5 pb-4 [scrollbar-width:none]">
      {TERM_TYPES.map((type) => {
        const actif = type.value === value;
        return (
          <button
            key={type.value}
            type="button"
            onClick={() => onChange(type.value)}
            aria-pressed={actif}
            style={{ "--mark": typeRgb(type.value) }}
            className={cn(
              "flex flex-none cursor-pointer items-center gap-[7px] py-1.5 text-[13px] whitespace-nowrap underline-offset-[7px] decoration-2",
              actif
                ? "term-underline font-bold text-strong underline"
                : "text-dim",
            )}
          >
            <span className="term-dot size-[7px] flex-none rounded-full" />
            {type.label}
          </button>
        );
      })}
    </div>
  );
}

/** Panneau des correspondances : permanent, a trois paliers. */
function TermsSheet({ snap, onSnap, onTerm, onRun }) {
  const terms = useAnonymizer((s) => s.terms);
  const mode = useAnonymizer((s) => s.mode);
  const status = useAnonymizer((s) => s.status);
  const doc = useAnonymizer((s) => s.doc);
  const addTermByText = useAnonymizer((s) => s.addTermByText);

  const [query, setQuery] = useState("");
  const pseudo = mode === "pseudo";
  const cherche = query.trim();
  const trouve = cherche ? findOccurrences(doc, cherche).length : 0;

  function submit() {
    if (!cherche) return;
    if (addTermByText(cherche)) setQuery("");
  }

  return (
    <Sheet
      snaps={[64, 0.52, 0.86]}
      index={snap}
      onIndex={onSnap}
      header={
        <>
          <span className="flex-1 text-[15px] font-bold tracking-[-0.02em] text-strong">
            Correspondances
          </span>
          <span className="font-mono text-[10.5px] whitespace-nowrap text-faint">
            {terms.length} terme{terms.length > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={onRun}
            disabled={status === "running"}
            className="text-accent-strong cursor-pointer font-mono text-[9.5px] font-semibold tracking-[0.16em] uppercase disabled:opacity-40"
          >
            Traiter
          </button>
        </>
      }
      footer={
        <button
          type="button"
          onClick={onRun}
          disabled={status === "running"}
          className="bg-primary text-primary-foreground w-full cursor-pointer rounded-xl px-4 py-4 text-[14px] font-bold disabled:opacity-50"
        >
          {pseudo ? "Pseudonymiser le document" : "Restaurer le document"}
        </button>
      }
    >
      {pseudo && (
        <div className="flex items-center gap-3.5 px-5 pt-1.5 pb-3.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Rechercher ou ajouter un terme…"
            aria-label="Rechercher ou ajouter un terme"
            className="h-10 flex-1 rounded-none border-0 border-b bg-transparent px-0 font-mono text-[13px] focus-visible:ring-0"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!cherche}
            className="text-accent-strong cursor-pointer font-mono text-[9.5px] font-semibold tracking-[0.16em] uppercase disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
      )}

      {cherche && (
        <p className="px-5 pb-2 font-mono text-[10px] text-faint">
          {trouve
            ? `${trouve} occurrence${trouve > 1 ? "s" : ""} dans le document`
            : "absent du document — sera ajouté au registre"}
        </p>
      )}

      {terms.length ? (
        terms.map((term) => (
          <button
            key={term.id}
            type="button"
            onClick={() => onTerm(term.id)}
            className="flex w-full cursor-pointer flex-col gap-[5px] border-t px-5 py-3.5 text-left"
          >
            <span className="flex items-baseline gap-2.5">
              <span
                style={{ "--mark": typeRgb(term.type) }}
                className="term-dot size-[7px] flex-none rounded-full"
              />
              <span className="min-w-0 flex-1 text-[14px] font-semibold break-words text-strong">
                {term.text}
              </span>
              <span
                className={cn(
                  "font-mono text-[10.5px] whitespace-nowrap",
                  term.hits.length ? "text-faint" : "text-destructive font-semibold",
                )}
              >
                {term.hits.length}×
              </span>
            </span>
            <span className="pl-4 font-mono text-[10.5px] text-faint">
              {typeLabel(term.type)} ·{" "}
              <span className="text-accent-strong">{term.pseudo}</span>
              {term.auto ? " · auto" : ""}
            </span>
          </button>
        ))
      ) : (
        <div className="flex flex-col gap-2 px-5 pt-8 pb-3">
          <p className="text-[13px] font-semibold text-dim">
            Aucune correspondance
          </p>
          <p className="text-[13px] leading-[1.6] text-faint">
            {pseudo
              ? "Appuyez un mot du document pour créer la première. Toutes ses occurrences seront traitées."
              : "Le registre chargé ne contient aucune correspondance applicable à ce document."}
          </p>
        </div>
      )}
    </Sheet>
  );
}

/** Feuille de capture : ce qui sera enregistre, avant de l'enregistrer. */
function DraftSheet({ draft, onType, onConfirm, onClose }) {
  return (
    <Sheet
      onClose={onClose}
      header={
        <>
          <span className="flex-1 text-[15px] font-bold tracking-[-0.02em] text-strong">
            Nouvelle correspondance
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer font-mono text-[9.5px] font-semibold tracking-[0.16em] text-dim uppercase"
          >
            Annuler
          </button>
        </>
      }
      footer={
        <button
          type="button"
          onClick={onConfirm}
          className="bg-primary text-primary-foreground w-full cursor-pointer rounded-xl px-4 py-4 text-[14px] font-bold"
        >
          Créer la correspondance
        </button>
      }
    >
      <div className="px-5 pb-3.5">
        <div className="flex items-center gap-2.5">
          <span
            style={{ "--mark": typeRgb(draft.type) }}
            className="term-dot size-[7px] flex-none rounded-full"
          />
          <span className="text-[17px] font-bold tracking-[-0.02em] break-words text-strong">
            {draft.text}
          </span>
        </div>
        <p className="mt-[7px] ml-4 font-mono text-[10.5px] text-faint">
          {draft.count} occurrence{draft.count > 1 ? "s" : ""} ·{" "}
          {familyLabel(draft.type)}
        </p>
      </div>
      <p className="px-5 pb-2.5 font-mono text-[9.5px] tracking-[0.16em] text-faint uppercase">
        Type de donnée
      </p>
      <TypeOptions value={draft.type} onChange={onType} />
    </Sheet>
  );
}

/** Fiche d'une correspondance posee : son type, son pseudonyme, son retrait. */
function TermSheet({ term, editable, onClose }) {
  const setTermType = useAnonymizer((s) => s.setTermType);
  const setTermPseudo = useAnonymizer((s) => s.setTermPseudo);
  const removeTerm = useAnonymizer((s) => s.removeTerm);

  return (
    <Sheet
      onClose={onClose}
      header={
        <>
          <span className="flex-1 text-[15px] font-bold tracking-[-0.02em] text-strong">
            Correspondance
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer font-mono text-[9.5px] font-semibold tracking-[0.16em] text-dim uppercase"
          >
            Terminé
          </button>
        </>
      }
      footer={
        <button
          type="button"
          onClick={() => {
            removeTerm(term.id);
            onClose();
          }}
          className="text-destructive w-full cursor-pointer py-4 text-center text-[13px] font-semibold"
        >
          Retirer la correspondance
        </button>
      }
    >
      <div className="px-5 pb-3.5">
        <div className="flex items-center gap-2.5">
          <span
            style={{ "--mark": typeRgb(term.type) }}
            className="term-dot size-[7px] flex-none rounded-full"
          />
          <span className="text-[17px] font-bold tracking-[-0.02em] break-words text-strong">
            {term.text}
          </span>
        </div>
        <p className="mt-[7px] ml-4 font-mono text-[10.5px] text-faint">
          {term.hits.length} occurrence{term.hits.length > 1 ? "s" : ""}
          {term.auto ? " · pré-détectée" : ""}
        </p>
      </div>

      <p className="px-5 pb-2.5 font-mono text-[9.5px] tracking-[0.16em] text-faint uppercase">
        Type de donnée
      </p>
      <TypeOptions
        value={term.type}
        locked={!editable}
        onChange={(type) => setTermType(term.id, type)}
      />

      <p className="px-5 pb-1 font-mono text-[9.5px] tracking-[0.16em] text-faint uppercase">
        Pseudonyme
      </p>
      <div className="px-5 pb-2">
        <Input
          value={term.pseudo}
          readOnly={!editable}
          onChange={(e) => setTermPseudo(term.id, e.target.value)}
          aria-label={`Pseudonyme de ${term.text}`}
          className="h-11 w-full rounded-none border-0 border-b bg-transparent px-0 font-mono text-[13px] focus-visible:ring-0"
        />
      </div>
    </Sheet>
  );
}

/** Recuperation des fichiers produits : le composant du bureau, en feuille. */
function LivrablesSheet({ onClose }) {
  return (
    <Sheet
      onClose={onClose}
      header={
        <>
          <span className="flex-1 text-[15px] font-bold tracking-[-0.02em] text-strong">
            Livrables prêts
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer font-mono text-[9.5px] font-semibold tracking-[0.16em] text-dim uppercase"
          >
            Terminé
          </button>
        </>
      }
    >
      <div className="px-5 pb-8">
        <Deliverables />
      </div>
    </Sheet>
  );
}
