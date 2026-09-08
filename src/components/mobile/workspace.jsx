"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Deliverables } from "@/components/deliverables";
import { Input } from "@/components/ui/input";
import { guessType } from "@/lib/detect";
import { buildMarks, entityRangeAt, findOccurrences, phraseAt } from "@/lib/tokenize";
import { familyLabel, TERM_TYPES, typeLabel, typeRgb } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAnonymizer } from "@/store/use-anonymizer";
import { CloseButton, Scrim, Sheet } from "./sheet";

/** Paliers de la liste : fermee, a moitie, presque pleine. */
const SNAPS = [0, 0.56, 0.88];

/** Deplacement au-dela duquel le geste est un defilement, pas un appui. */
const SLOP = 10;

/**
 * Espace de travail tactile.
 *
 * La selection au curseur du bureau n'a pas d'equivalent invente : c'est la
 * selection du systeme, avec ses poignees, qui la remplace. Un appui prend
 * le mot ; une selection etendue prend exactement ce qu'elle couvre — sans
 * quoi « 12 rue Carnot, Dakar » resterait incapturable, n'etant ni un mot
 * seul ni une entite capitalisee.
 *
 * Le bandeau tient sur une ligne, et le bas de l'ecran porte deux objets
 * flottants de la meme geometrie que les onglets de l'accueil : a gauche
 * l'etat du travail, a droite l'action.
 */
export function Workspace() {
  const doc = useAnonymizer((s) => s.doc);
  const terms = useAnonymizer((s) => s.terms);
  const mode = useAnonymizer((s) => s.mode);
  const view = useAnonymizer((s) => s.view);
  const status = useAnonymizer((s) => s.status);
  const progress = useAnonymizer((s) => s.progress);
  const document_ = useAnonymizer((s) => s.document);
  const addTerm = useAnonymizer((s) => s.addTerm);
  const setView = useAnonymizer((s) => s.setView);
  const reset = useAnonymizer((s) => s.reset);
  const run = useAnonymizer((s) => s.run);

  const [draft, setDraft] = useState(null);
  const [openTerm, setOpenTerm] = useState(null);
  const [livrablesFermes, setLivrablesFermes] = useState(false);
  const [snap, setSnap] = useState(0);
  const [hint, setHint] = useState(true);
  const [barHeight, setBarHeight] = useState(0);

  const barRef = useRef(null);
  const bodyRef = useRef(null);
  const press = useRef(null);
  const ignoreSelection = useRef(false);

  const pseudo = mode === "pseudo";
  const running = status === "running";
  const resultat = status === "done" && view === "result";
  const selectable = !running && !resultat && pseudo;

  const marks = useMemo(() => buildMarks(terms), [terms]);
  const terme = terms.find((t) => t.id === openTerm) ?? null;
  const livrables = status === "done" && !livrablesFermes;
  const occurrences = terms.reduce((k, t) => k + t.hits.length, 0);

  // Le bandeau flotte au-dessus du texte : le corps se decale de sa hauteur,
  // mesuree plutot que devinee — elle change avec l'invite.
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const capture = useCallback(
    (p, from, to, anchor) => {
      const text = phraseAt(doc, p, from, to).trim();
      if (!text) return;
      setDraft({
        p,
        from,
        to,
        anchor: anchor ?? from,
        text,
        type: guessType(text),
        count: findOccurrences(doc, text).length,
      });
      setHint(false);
      navigator.vibrate?.(8);
    },
    [doc],
  );

  /**
   * Ramene la selection du systeme a une plage de jetons, recalee sur des
   * mots et bornee au premier paragraphe : ce qui est capture est ce qui
   * s'affiche.
   */
  const readSelection = useCallback(() => {
    if (!selectable) return false;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    const body = bodyRef.current;
    if (!body?.contains(range.commonAncestorContainer)) return false;

    const startEl = tokenElement(range.startContainer);
    if (!startEl) return false;
    const p = Number(startEl.dataset.p);
    const tokens = doc[p];
    if (!tokens) return false;

    const endEl = tokenElement(range.endContainer);
    let from = Number(startEl.dataset.i);
    let to =
      endEl && Number(endEl.dataset.p) === p
        ? Number(endEl.dataset.i)
        : tokens.length - 1;
    if (to < from) [from, to] = [to, from];

    while (from <= to && !tokens[from].word) from += 1;
    while (to >= from && !tokens[to].word) to -= 1;
    if (to < from) return false;

    // Capturer efface la selection, ce qui declenche a son tour un evenement
    // de selection : on l'ignore, faute de quoi les deux se relancent.
    ignoreSelection.current = true;
    selection.removeAllRanges();
    capture(p, from, to);
    window.setTimeout(() => {
      ignoreSelection.current = false;
    }, 60);
    return true;
  }, [capture, doc, selectable]);

  // Les poignees se relachent souvent hors du document : seul l'evenement de
  // selection le dit.
  useEffect(() => {
    let timer = null;
    function onSelectionChange() {
      if (ignoreSelection.current || draft) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(readSelection, 220);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      window.clearTimeout(timer);
    };
  }, [draft, readSelection]);

  function onPointerDown(event) {
    const el = event.target.closest?.("[data-i]");
    if (!el || running) return;
    press.current = { x: event.clientX, y: event.clientY, el };
  }

  function onPointerMove(event) {
    const state = press.current;
    if (!state) return;
    if (
      Math.abs(event.clientX - state.x) > SLOP ||
      Math.abs(event.clientY - state.y) > SLOP
    ) {
      press.current = null;
    }
  }

  function onPointerUp() {
    const state = press.current;
    press.current = null;
    if (!state) return;

    // Une selection etendue prime sur l'appui : c'est elle qu'on capture.
    if (readSelection()) return;

    const { el } = state;
    if (el.dataset.term) {
      setOpenTerm(Number(el.dataset.term));
      return;
    }
    if (!selectable) return;

    const p = Number(el.dataset.p);
    const i = Number(el.dataset.i);
    if (doc[p]?.[i]?.word) capture(p, i, i, i);
  }

  /** Amene le premier surlignage d'un terme sous les yeux, et le fait battre. */
  const locate = useCallback((id) => {
    const el = bodyRef.current?.querySelector(`[data-term="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("term-locate");
    window.setTimeout(() => el.classList.remove("term-locate"), 2400);
  }, []);

  function openTermFromList(id) {
    setSnap(0);
    locate(id);
    setOpenTerm(id);
  }

  const lancer = useCallback(() => {
    setLivrablesFermes(false);
    setSnap(0);
    run();
  }, [run]);

  const modale = Boolean(draft || terme || livrables);

  return (
    <div className="screen-push bg-paper relative flex h-full flex-col overflow-clip">
      <div ref={barRef} className="glass glass-bar absolute inset-x-0 top-0 z-20">
        <header className="flex items-center gap-3 px-5 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3">
          <button
            type="button"
            onClick={reset}
            className="flex flex-none cursor-pointer items-center gap-1.5 rounded-full bg-tint/9 py-[7px] pr-3 pl-[9px] text-[12.5px] font-bold text-strong"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
            Fermer
          </button>
          <span className="flex-1 truncate text-center text-[13px] font-semibold text-strong">
            {document_?.fileName ?? "Document"}
          </span>
          <span className="flex-none font-mono text-[9.5px] tracking-[0.16em] text-faint">
            {pseudo ? "01" : "02"}
          </span>
        </header>

        {hint && !resultat && (
          <p className="px-5 pb-3 text-[12px] text-faint">
            {pseudo
              ? "Appuyez un mot, ou sélectionnez plusieurs mots"
              : "Correspondances du registre · appuyez pour inspecter"}
          </p>
        )}
      </div>

      <div
        ref={bodyRef}
        style={{ paddingTop: barHeight }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <article className="px-5 pt-4 pb-[132px] [-webkit-user-select:text] select-text">
          <h2 className="mb-4 text-[17px] font-bold tracking-[-0.028em] text-balance text-strong">
            {document_?.title ?? "Document"}
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

      {running ? (
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
      ) : (
        <WorkDock
          done={status === "done"}
          resultat={resultat}
          pseudo={pseudo}
          terms={terms}
          onList={() => setSnap(1)}
          onRun={lancer}
          onView={setView}
          onLivrables={() => setLivrablesFermes(false)}
        />
      )}

      <TermsSheet
        snap={snap}
        onSnap={setSnap}
        onTerm={openTermFromList}
        onRun={lancer}
        count={occurrences}
      />

      {(modale || snap > 0) && (
        <Scrim
          onClick={() => {
            setDraft(null);
            setOpenTerm(null);
            setLivrablesFermes(true);
            setSnap(0);
          }}
        />
      )}

      {draft && (
        <DraftSheet
          draft={draft}
          doc={doc}
          onType={(type) => setDraft((d) => (d ? { ...d, type } : d))}
          onWiden={() => {
            const range = entityRangeAt(doc, draft.p, draft.anchor);
            if (range) capture(draft.p, range.from, range.to, draft.anchor);
          }}
          onConfirm={() => {
            addTerm(draft.p, draft.from, draft.to, draft.type);
            setDraft(null);
          }}
          onClose={() => setDraft(null)}
        />
      )}

      {terme && !draft && (
        <TermSheet term={terme} editable={pseudo} onClose={() => setOpenTerm(null)} />
      )}

      {livrables && !draft && !terme && (
        <Sheet
          title="Livrables prêts"
          subtitle={pseudo ? "Le document et son registre" : "Le document restauré"}
          onClose={() => setLivrablesFermes(true)}
        >
          <div className="px-5 pb-8">
            <Deliverables />
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** Remonte d'un noeud du document au jeton qui le porte. */
function tokenElement(node) {
  const el = node?.nodeType === 3 ? node.parentElement : node;
  return el?.closest?.("[data-i]") ?? null;
}

/**
 * Bas de l'espace de travail : l'etat du travail a gauche, l'action a droite.
 *
 * Une fois le traitement fait, les memes deux places portent la bascule
 * d'apercu et l'acces aux livrables.
 */
function WorkDock({ done, resultat, pseudo, terms, onList, onRun, onView, onLivrables }) {
  const familles = [];
  terms.forEach((t) => {
    const rgb = typeRgb(t.type);
    if (!familles.includes(rgb)) familles.push(rgb);
  });

  return (
    <div className="pointer-events-none absolute inset-x-5 bottom-[calc(env(safe-area-inset-bottom,0px)+22px)] z-30 flex items-center gap-2.5">
      {done ? (
        <>
          <div className="glass pointer-events-auto flex flex-none gap-1 rounded-[20px] p-1">
            {[
              ["source", "Document"],
              ["result", pseudo ? "Pseudonymisé" : "Restauré"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onView(value)}
                aria-current={
                  (value === "result") === resultat ? "page" : undefined
                }
                className={cn(
                  "cursor-pointer rounded-2xl px-3 py-2.5 text-[12.5px] font-bold transition-colors",
                  (value === "result") === resultat
                    ? "bg-primary text-primary-foreground"
                    : "text-dim",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onLivrables}
            className="bg-primary text-primary-foreground pointer-events-auto flex-1 cursor-pointer rounded-[20px] px-4 py-[13px] text-[13px] font-bold shadow-[var(--shadow-panel)]"
          >
            Livrables
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onList}
            className="glass pointer-events-auto flex flex-none cursor-pointer items-center gap-2.5 rounded-[20px] px-[15px] py-[13px] text-[13px] font-bold text-strong"
          >
            {familles.length > 0 && (
              <span className="flex gap-[3px]" aria-hidden>
                {familles.map((rgb) => (
                  <span
                    key={rgb}
                    style={{ "--mark": rgb }}
                    className="term-dot size-[7px] rounded-full"
                  />
                ))}
              </span>
            )}
            {terms.length} terme{terms.length > 1 ? "s" : ""}
          </button>
          <button
            type="button"
            onClick={onRun}
            disabled={!terms.length}
            className="bg-primary text-primary-foreground pointer-events-auto flex-1 cursor-pointer rounded-[20px] px-4 py-[13px] text-[13px] font-bold shadow-[var(--shadow-panel)] disabled:opacity-50"
          >
            {pseudo ? "Pseudonymiser" : "Restaurer"}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Rendu d'un paragraphe, jeton par jeton.
 *
 * Chaque span porte sa position : c'est ce qui permet de ramener un appui ou
 * une selection a une plage de jetons. Dans l'apercu, un pseudonyme reste
 * interrogeable — il dit ce qu'il remplace.
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
            data-term={term.id}
            data-p={p}
            data-i={i}
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
              actif ? "term-underline font-bold text-strong underline" : "text-dim",
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

/** Liste des correspondances : permanente, a trois paliers. */
function TermsSheet({ snap, onSnap, onTerm, onRun, count }) {
  const terms = useAnonymizer((s) => s.terms);
  const mode = useAnonymizer((s) => s.mode);
  const status = useAnonymizer((s) => s.status);
  const doc = useAnonymizer((s) => s.doc);
  const addTermByText = useAnonymizer((s) => s.addTermByText);
  const openRegistry = useAnonymizer((s) => s.openRegistry);

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
      snaps={SNAPS}
      index={snap}
      onIndex={onSnap}
      onClose={() => onSnap(0)}
      title="Correspondances"
      subtitle={
        terms.length
          ? `${terms.length} terme${terms.length > 1 ? "s" : ""} · ${count} occurrence${count > 1 ? "s" : ""}`
          : "Aucun terme pour l’instant"
      }
      footer={
        <>
          <button
            type="button"
            onClick={onRun}
            disabled={status === "running"}
            className="bg-primary text-primary-foreground w-full cursor-pointer rounded-xl px-4 py-4 text-[14px] font-bold disabled:opacity-50"
          >
            {pseudo ? "Pseudonymiser le document" : "Restaurer le document"}
          </button>
          <button
            type="button"
            onClick={openRegistry}
            className="w-full cursor-pointer py-3.5 text-center text-[13px] font-semibold text-dim"
          >
            Importer un registre
          </button>
        </>
      }
    >
      {pseudo && (
        <div className="flex items-center gap-3.5 px-5 pt-3 pb-3.5">
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
          <p className="text-[13px] font-semibold text-dim">Aucune correspondance</p>
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
function DraftSheet({ draft, doc, onType, onWiden, onConfirm, onClose }) {
  // « Mariama » est rarement ce qu'on veut : c'est « Mariama Diallo ». Le
  // double-clic du bureau prenait l'entite ; l'appui long ne le peut plus, il
  // appartient a la selection du systeme. La proposition remplace le geste.
  const range = entityRangeAt(doc, draft.p, draft.anchor);
  const entiere =
    range && (range.from !== draft.from || range.to !== draft.to)
      ? phraseAt(doc, range.p, range.from, range.to).trim()
      : null;

  return (
    <Sheet
      title="Nouvelle correspondance"
      subtitle={`${draft.count} occurrence${draft.count > 1 ? "s" : ""} dans le document`}
      onClose={onClose}
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
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3.5">
        <span
          style={{ "--mark": typeRgb(draft.type) }}
          className="term-dot size-[7px] flex-none rounded-full"
        />
        <span className="text-[19px] font-bold tracking-[-0.03em] break-words text-strong">
          {draft.text}
        </span>
      </div>

      {entiere && entiere !== draft.text && (
        <button
          type="button"
          onClick={onWiden}
          className="flex w-full cursor-pointer items-baseline gap-3 border-t px-5 py-3.5 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-strong">
              Prendre l’entité entière
            </span>
            <span className="mt-0.5 block text-[12px] text-faint">« {entiere} »</span>
          </span>
          <span className="text-accent-strong flex-none font-mono text-[10px]">
            Étendre
          </span>
        </button>
      )}

      <p className="px-5 pt-3 pb-2.5 font-mono text-[9.5px] tracking-[0.16em] text-faint uppercase">
        Type de donnée
      </p>
      <TypeOptions value={draft.type} onChange={onType} />
      <p className="px-5 pb-4 text-[12px] text-faint">
        Famille {familyLabel(draft.type)}
      </p>
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
      title="Correspondance"
      subtitle={`${term.hits.length} occurrence${term.hits.length > 1 ? "s" : ""}${term.auto ? " · pré-détectée" : ""}`}
      onClose={onClose}
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
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3.5">
        <span
          style={{ "--mark": typeRgb(term.type) }}
          className="term-dot size-[7px] flex-none rounded-full"
        />
        <span className="text-[19px] font-bold tracking-[-0.03em] break-words text-strong">
          {term.text}
        </span>
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
      <div className="px-5 pb-3">
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
