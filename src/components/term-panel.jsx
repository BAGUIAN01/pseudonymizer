"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon, FileUpIcon } from "lucide-react";

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
import {
  bareLabel,
  familyLabel,
  TERM_TYPES,
  typeLabel,
  typeRgb,
} from "@/lib/types";
import { useAnonymizer } from "@/store/use-anonymizer";
import { Deliverables } from "@/components/deliverables";

/** D'ou vient une paire — ce que la ligne dépliée annonce en premier. */
function provenance(term) {
  if (term.fromRegistry) return "Fournie par le registre";
  if (term.auto) return "Pré-détectée";
  return "Ajoutée à la main";
}

function matches(term, needle) {
  return (
    term.text.toLowerCase().includes(needle) ||
    term.pseudo.toLowerCase().includes(needle) ||
    typeLabel(term.type).toLowerCase().includes(needle)
  );
}

/**
 * Panneau lateral : le registre des correspondances, et le lancement du
 * traitement.
 *
 * C'est un tableau. Chaque ligne met la valeur et son pseudonyme en regard,
 * dans des colonnes qui tiennent d'une ligne a l'autre ; le reste — le type,
 * le pseudonyme modifiable, le retrait — se deplie sous la ligne.
 *
 * Auparavant chaque terme portait en permanence son selecteur de type et son
 * champ de pseudonyme, soit une centaine de pixels de haut : a quarante
 * termes, le panneau devenait un mur qu'on faisait defiler sans rien y
 * retrouver. Une ligne de tableau en fait trente-six, et l'edition n'apparait
 * que la ou on la demande.
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

  const [query, setQuery] = useState("");
  // Une seule ligne ouverte a la fois : deux depliages simultanes rendent la
  // colonne aussi haute que la liste qu'on cherchait a raccourcir.
  const [openId, setOpenId] = useState(null);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? terms.filter((t) => matches(t, needle)) : terms),
    [terms, needle],
  );

  return (
    <aside
      data-tour="panneau"
      className="bg-panel flex min-h-0 w-[400px] flex-none flex-col border-l"
    >
      <header className="flex h-14 flex-none items-center justify-between gap-2 border-b px-5">
        <h2 className="text-[13.5px] font-semibold">Registre</h2>

        <span className="text-muted-foreground font-mono text-[11px] whitespace-nowrap">
          {needle
            ? `${shown.length} sur ${count}`
            : `${count} paire${count > 1 ? "s" : ""}`}
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

      <TermSearch
        value={query}
        onChange={setQuery}
        found={shown.length}
        total={count}
        editable={pseudo}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {count ? (
          <>
            {/* L'en-tete tient pendant qu'on fait defiler : un tableau sans
                ses colonnes redevient une liste des la troisieme ligne. */}
            <div className="bg-panel sticky top-0 z-10 grid grid-cols-[1fr_auto_auto_14px] items-baseline gap-2.5 border-b px-5 py-2 font-mono text-[9px] tracking-[0.14em] text-faint uppercase">
              <span>Valeur</span>
              <span>Pseudonyme</span>
              <span className="text-right">Occ.</span>
              <span />
            </div>

            {shown.map((term) => (
              <TermRow
                key={term.id}
                term={term}
                editable={pseudo}
                open={openId === term.id}
                onToggle={() =>
                  setOpenId((id) => (id === term.id ? null : term.id))
                }
              />
            ))}

            {!shown.length && (
              <p className="px-5 py-8 text-center text-[12px] leading-[1.6] text-faint">
                Aucune paire ne contient « {query.trim()} ».
              </p>
            )}
          </>
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
 * Un seul champ pour deux gestes : il filtre le tableau a mesure qu'on tape,
 * et cree la correspondance si le terme n'y figure pas encore.
 *
 * Le nombre d'occurrences dans le document s'affiche avant la creation — un
 * terme absent reste ajoutable, une graphie peut devoir figurer au registre
 * sans apparaitre dans le texte.
 */
function TermSearch({ value, onChange, found, total, editable }) {
  const doc = useAnonymizer((s) => s.doc);
  const addTermByText = useAnonymizer((s) => s.addTermByText);

  const query = value.trim();

  const count = useMemo(
    () => (query ? findOccurrences(doc, query).length : 0),
    [doc, query],
  );

  function submit() {
    if (!query) return;
    if (addTermByText(query)) onChange("");
  }

  return (
    <div className="flex flex-none flex-col gap-1.5 border-b px-5 py-3">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && editable) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            editable ? "Filtrer ou ajouter un terme…" : "Filtrer le registre…"
          }
          aria-label={
            editable ? "Filtrer ou ajouter un terme" : "Filtrer le registre"
          }
          className="bg-paper focus-visible:border-ring h-9 flex-1 rounded-md border px-2.5 text-[12px] text-foreground focus-visible:ring-0"
        />
        {editable && (
          <button
            type="button"
            onClick={submit}
            disabled={!query}
            className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer rounded-md px-3.5 text-[12px] font-bold transition-colors disabled:cursor-default disabled:opacity-40"
          >
            Ajouter
          </button>
        )}
      </div>

      {query && (
        <p className="text-muted-foreground font-mono text-[10px]">
          {found
            ? `${found} paire${found > 1 ? "s" : ""} sur ${total}`
            : count
              ? `${count} occurrence${count > 1 ? "s" : ""} dans le document`
              : "absent du document — sera ajouté au registre"}
        </p>
      )}
    </div>
  );
}

function TermRow({ term, editable, open, onToggle }) {
  const setTermType = useAnonymizer((s) => s.setTermType);
  const setTermPseudo = useAnonymizer((s) => s.setTermPseudo);
  const removeTerm = useAnonymizer((s) => s.removeTerm);

  const n = term.hits.length;

  return (
    <div className={cn("border-b", open && "bg-tint/[0.03]")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        data-term-row={term.id}
        className="hover:bg-tint/[0.045] grid w-full cursor-pointer grid-cols-[1fr_auto_auto_14px] items-baseline gap-2.5 px-5 py-2.5 text-left transition-colors"
      >
        <span className="flex min-w-0 items-baseline gap-2.5">
          <span
            title={familyLabel(term.type)}
            className="term-dot size-1.5 flex-none translate-y-[-1px] rounded-full"
            style={{ "--mark": typeRgb(term.type) }}
          />
          <span className="line-clamp-2 min-w-0 text-[12.5px] font-semibold break-words">
            {term.text}
          </span>
        </span>

        {/* Le pseudonyme se lit sans ses crochets : la colonne le delimite.
            Il n'est pas non plus a la teinte d'accent — une colonne entiere
            de vert citron la disputerait au seul bouton qui agit. */}
        <span className="font-mono text-[10.5px] whitespace-nowrap text-foreground tabular-nums">
          {bareLabel(term.pseudo)}
        </span>

        <span
          title={
            n
              ? undefined
              : "Ce terme ne figure pas dans le document : il ne sera pas remplacé."
          }
          className={cn(
            "text-right font-mono text-[10px] whitespace-nowrap tabular-nums",
            n ? "text-muted-foreground" : "text-destructive font-semibold",
          )}
        >
          {n}×
        </span>

        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-3.5 self-center text-faint transition-transform duration-200",
            open && "text-foreground rotate-180",
          )}
        />
      </button>

      {/*
        Le depli se joue sur une seule rangee de grille, de 0fr a 1fr : la
        hauteur s'anime sans qu'on ait a la mesurer. La colonne, elle, est
        bornee — sans minmax(0,1fr) un contenu plus large que le panneau
        l'etirerait au lieu d'etre clippe.

        `inert` referme vraiment la ligne : sans lui, le selecteur et le champ
        restaient atteignables au clavier sous une hauteur nulle.
      */}
      <div
        inert={!open}
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-clip">
          <div className="flex flex-col gap-2 px-5 pt-0.5 pb-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground font-mono text-[10px]">
                {provenance(term)} · {n} occurrence{n > 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={() => removeTerm(term.id)}
                className="hover:text-destructive cursor-pointer text-[11.5px] font-semibold text-faint transition-colors"
              >
                Retirer
              </button>
            </div>

            <div className="grid grid-cols-[130px_1fr] gap-2">
              <Select
                value={term.type}
                onValueChange={(value) => setTermType(term.id, value)}
                disabled={!editable}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={`Type de ${term.text}`}
                  className="bg-paper w-full cursor-pointer rounded-md border text-[11px] font-semibold text-foreground"
                >
                  {/* Sans cette fonction, Base UI affiche la valeur brute :
                      le sélecteur montrait « TELEPHONE » et non « Téléphone ». */}
                  <SelectValue>{(v) => typeLabel(v)}</SelectValue>
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
                className={cn(
                  "focus-visible:border-ring w-full rounded-md border px-2.5 py-2 font-mono text-[11px] text-foreground focus-visible:ring-0",
                  // En restauration le pseudonyme n'est pas modifiable : il
                  // doit s'en apercevoir, comme le selecteur a cote.
                  editable ? "bg-paper" : "bg-tint/5 text-dim",
                )}
              />
            </div>
          </div>
        </div>
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
