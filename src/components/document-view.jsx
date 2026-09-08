"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { guessType } from "@/lib/detect";
import {
  buildMarks,
  entityRangeAt,
  findOccurrences,
  phraseAt,
} from "@/lib/tokenize";
import { familyLabel, TERM_TYPES, typeLabel, typeRgb } from "@/lib/types";
import { useAnonymizer } from "@/store/use-anonymizer";

/**
 * Rendu du document, token par token.
 *
 * La selection se fait au curseur, comme dans un traitement de texte : on
 * glisse sur le texte, ou on double-clique un nom pour attraper l'entite
 * entiere (« Jean Dupont » d'un seul geste). Une barre ancree a la selection
 * montre le terme capture, son nombre d'occurrences et son type avant de creer
 * la correspondance : rien n'est ajoute dans le dos de l'utilisateur.
 *
 * Cliquer une correspondance deja posee la retire.
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

  const bodyRef = useRef(null);
  // La plage DOM survit a la perte du focus (ouverture du menu de type) et
  // sert a repositionner la barre pendant le defilement.
  const rangeRef = useRef(null);

  const [draft, setDraft] = useState(null);

  const pseudo = mode === "pseudo";
  const running = status === "running";
  const resultView = view === "result" && status === "done";
  const editable = !resultView && !running;

  const marks = useMemo(() => buildMarks(terms), [terms]);

  // Un changement de document ou le passage a l'apercu rend le brouillon
  // caduc : plutot que de le nettoyer dans un effet, on cesse de le retenir.
  const activeDraft = draft && draft.doc === doc && editable ? draft : null;

  const closeDraft = useCallback(() => {
    rangeRef.current = null;
    setDraft(null);
  }, []);

  /** Construit le brouillon a partir d'une plage de tokens d'un paragraphe. */
  const openDraft = useCallback(
    (p, from, to, range) => {
      const text = phraseAt(doc, p, from, to);
      if (!text) {
        closeDraft();
        return;
      }
      rangeRef.current = range.cloneRange();
      setDraft({
        doc,
        p,
        from,
        to,
        text,
        type: guessType(text),
        count: findOccurrences(doc, text).length,
        rect: range.getBoundingClientRect(),
      });
    },
    [doc, closeDraft],
  );

  /**
   * Lit la selection du navigateur et la ramene a une plage de tokens.
   * Une selection qui deborde sur plusieurs paragraphes est ramenee au
   * premier : l'apercu de la barre montre exactement ce qui sera capture.
   */
  const readSelection = useCallback(() => {
    if (!editable) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      closeDraft();
      return;
    }

    const range = selection.getRangeAt(0);
    const body = bodyRef.current;
    if (!body?.contains(range.commonAncestorContainer)) return;

    const startEl = tokenElement(range.startContainer);
    if (!startEl) {
      closeDraft();
      return;
    }

    const p = Number(startEl.dataset.p);
    const tokens = doc[p];
    if (!tokens) {
      closeDraft();
      return;
    }

    const endEl = tokenElement(range.endContainer);
    let from = Number(startEl.dataset.i);
    let to =
      endEl && Number(endEl.dataset.p) === p
        ? Number(endEl.dataset.i)
        : tokens.length - 1;

    // On se recale sur des mots : une selection qui commence ou finit sur une
    // espace produirait un terme avec de la ponctuation collee.
    while (from <= to && !tokens[from].word) from += 1;
    while (to >= from && !tokens[to].word) to -= 1;
    if (to < from) {
      closeDraft();
      return;
    }

    openDraft(p, from, to, range);
  }, [doc, editable, closeDraft, openDraft]);

  /** Double-clic : le mot est etendu a l'entite qui l'entoure. */
  function handleDoubleClick(event) {
    if (!editable) return;
    const el = event.target.closest?.("[data-i]");
    if (!el) return;

    const p = Number(el.dataset.p);
    const range = entityRangeAt(doc, p, Number(el.dataset.i));
    if (!range) return;

    const body = bodyRef.current;
    const first = body?.querySelector(
      '[data-p="' + p + '"][data-i="' + range.from + '"]',
    );
    const last = body?.querySelector(
      '[data-p="' + p + '"][data-i="' + range.to + '"]',
    );
    if (!first || !last) return;

    // La selection native est etendue a l'entite pour que l'utilisateur voie
    // ce qu'il vient d'attraper.
    const domRange = document.createRange();
    domRange.setStartBefore(first);
    domRange.setEndAfter(last);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(domRange);

    openDraft(p, range.from, range.to, domRange);
  }

  function confirmDraft() {
    if (!activeDraft) return;
    addTerm(activeDraft.p, activeDraft.from, activeDraft.to, activeDraft.type);
    window.getSelection()?.removeAllRanges();
    closeDraft();
  }

  function cancelDraft() {
    window.getSelection()?.removeAllRanges();
    closeDraft();
  }

  // Le defilement deplace la selection : la barre suit sa plage.
  useEffect(() => {
    if (!activeDraft) return;
    const body = bodyRef.current;
    if (!body) return;

    function reposition() {
      const range = rangeRef.current;
      if (!range) return;
      setDraft((d) => (d ? { ...d, rect: range.getBoundingClientRect() } : d));
    }

    body.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition);
    return () => {
      body.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
    };
  }, [activeDraft]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      window.getSelection()?.removeAllRanges();
      closeDraft();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDraft]);

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {running && (
        <div className="bg-background/85 absolute inset-0 z-3 flex flex-col items-center justify-center gap-[18px]">
          <span className="border-primary/20 border-t-primary size-[34px] animate-spin rounded-full border-2" />
          <p className="font-mono text-[11px] tracking-[0.12em] text-dim uppercase">
            {pseudo ? "Substitution en cours" : "Restauration en cours"}
          </p>
          <div className="h-[3px] w-60 overflow-hidden rounded-full bg-tint/8">
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
          : "Surlignez le texte au curseur, ou double-cliquez un nom pour le prendre en entier"}
      </p>

      <div
        ref={bodyRef}
        onMouseUp={readSelection}
        onDoubleClick={handleDoubleClick}
        data-tour="document"
        className="min-h-0 flex-1 overflow-auto px-8 py-10"
      >
        <article className="mx-auto flex max-w-[720px] flex-col gap-[18px]">
          <h2 className="text-xl font-bold tracking-[-0.025em] text-strong">
            {title ?? "Document"}
          </h2>

          {doc.map((tokens, p) => (
            <p
              key={p}
              className="text-[14.5px] leading-[2.05] text-pretty text-foreground"
            >
              {renderParagraph({
                tokens,
                p,
                marks,
                resultView,
                pseudo,
                removeTerm,
              })}
            </p>
          ))}
        </article>
      </div>

      {activeDraft && (
        <SelectionBar
          draft={activeDraft}
          onType={(type) => setDraft((d) => (d ? { ...d, type } : d))}
          onConfirm={confirmDraft}
          onCancel={cancelDraft}
        />
      )}
    </section>
  );
}

/** Remonte d'un noeud DOM au token qui le porte. */
function tokenElement(node) {
  const el = node?.nodeType === 3 ? node.parentElement : node;
  return el?.closest?.("[data-i]") ?? null;
}

/**
 * Barre de confirmation ancree a la selection. Elle affiche le terme
 * exactement tel qu'il sera enregistre, ce qui evite les mauvaises surprises
 * quand la selection deborde sur la ponctuation ou sur un paragraphe voisin.
 */
function SelectionBar({ draft, onType, onConfirm, onCancel }) {
  const { rect, text, count, type } = draft;

  // Au-dessus de la selection, sauf trop pres du bandeau superieur.
  const above = rect.top > 150;
  const style = {
    left: Math.min(
      Math.max(rect.left + rect.width / 2, 210),
      window.innerWidth - 210,
    ),
    top: above ? rect.top - 10 : rect.bottom + 10,
    transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
  };

  return (
    <div
      style={style}
      className="fixed z-30 flex w-[400px] flex-col gap-2.5 rounded-xl border border-tint/10 bg-surface p-3 shadow-[var(--shadow-float)]"
    >
      <div className="flex items-baseline gap-2">
        <span
          aria-hidden
          className="term-dot size-1.5 flex-none translate-y-[-1px] rounded-full"
          style={{ "--mark": typeRgb(type) }}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-strong">
          {text}
        </span>
        <span className="text-muted-foreground flex-none font-mono text-[10px] whitespace-nowrap">
          {count} occurrence{count > 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-[128px_1fr_auto] gap-2">
        <Select value={type} onValueChange={onType}>
          <SelectTrigger
            size="sm"
            className="w-full cursor-pointer rounded-md border-0 bg-tint/6 text-[11px] font-semibold text-foreground"
          >
            {/* Sans cette fonction, Base UI affiche la valeur brute :
                le sélecteur montrait « TELEPHONE » et non « Téléphone ». */}
            <SelectValue>{(v) => typeLabel(v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TERM_TYPES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={onConfirm}
          className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer rounded-md px-3 py-2 text-[11.5px] font-bold transition-colors"
        >
          Créer la correspondance
        </button>

        <button
          type="button"
          onClick={onCancel}
          aria-label="Annuler la sélection"
          className="cursor-pointer rounded-md px-2 text-[15px] leading-none text-faint transition-colors hover:text-foreground"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/**
 * Parcourt les tokens d'un paragraphe et produit les spans a afficher.
 * Les tokens couverts par une occurrence sont fusionnes en un seul span.
 *
 * Chaque span porte sa position (`data-p`, `data-i`) : c'est ce qui permet de
 * ramener une selection du navigateur a une plage de tokens.
 */
function renderParagraph({ tokens, p, marks, resultView, pseudo, removeTerm }) {
  const nodes = [];
  let i = 0;

  while (i < tokens.length) {
    const mark = marks[`${p}:${i}`];

    if (mark) {
      const { term, hit } = mark;
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
            data-p={p}
            data-i={i}
            style={{ "--mark": typeRgb(term.type) }}
            className="term-pseudo rounded-md px-1.5 py-0.5 font-mono text-[12.5px] text-strong"
          >
            {pseudo ? term.pseudo : term.text}
          </span>,
        );
      } else {
        nodes.push(
          <span
            key={`${p}:${i}`}
            data-p={p}
            data-i={i}
            role="button"
            tabIndex={0}
            title={`${familyLabel(term.type)} · ${term.pseudo} — cliquer pour retirer`}
            style={{ "--mark": typeRgb(term.type) }}
            onClick={() => removeTerm(term.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                removeTerm(term.id);
              }
            }}
            className="term-mark cursor-pointer rounded-md px-[5px] py-0.5 text-strong underline decoration-2 underline-offset-4 transition-colors"
          >
            {original}
          </span>,
        );
      }

      i = hit.to + 1;
      continue;
    }

    nodes.push(
      <span
        key={`${p}:${i}`}
        data-p={p}
        data-i={i}
        className="whitespace-pre-wrap"
      >
        {tokens[i].text}
      </span>,
    );
    i += 1;
  }

  return nodes;
}
