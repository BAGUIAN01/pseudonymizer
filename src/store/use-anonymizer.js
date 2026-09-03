"use client";

import { create } from "zustand";
import { toast } from "sonner";

import { autoDetect, guessType, wordCount } from "@/lib/detect";
import {
  applyTerms,
  findOccurrences,
  phraseAt,
  tokenizeDocument,
} from "@/lib/tokenize";
import { buildPseudo } from "@/lib/types";
import * as backend from "@/lib/backend";
import {
  SAMPLE_DOCUMENT,
  SAMPLE_PSEUDONYMISED_DOCUMENT,
  SAMPLE_REGISTRY,
} from "@/lib/sample-doc";

const initialProcess = {
  status: "idle", // idle | running | done
  progress: 0,
  view: "source", // source | result
  deliverables: null,
};

/** Renumerote les pseudonymes d'un type apres ajout ou changement de type. */
function nextIndexForType(terms, type, excludeId) {
  return terms.filter((t) => t.type === type && t.id !== excludeId).length + 1;
}

export const useAnonymizer = create((set, get) => ({
  mode: "pseudo", // pseudo | depseudo
  document: null,
  doc: [], // document tokenise
  registry: null, // { fileName, terms }
  terms: [],
  nextId: 1,
  ...initialProcess,

  /* ---------------------------------------------------------------- */
  /* Navigation                                                       */
  /* ---------------------------------------------------------------- */

  setMode(mode) {
    if (get().mode === mode) return;
    set({
      mode,
      document: null,
      doc: [],
      registry: null,
      terms: [],
      nextId: 1,
      ...initialProcess,
    });
  },

  setView(view) {
    if (view === "result" && get().status !== "done") {
      toast("Lancez d'abord le traitement");
      return;
    }
    set({ view });
  },

  reset() {
    set({
      document: null,
      doc: [],
      registry: null,
      terms: [],
      nextId: 1,
      ...initialProcess,
    });
  },

  /* ---------------------------------------------------------------- */
  /* Chargement                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Installe un document extrait : tokenisation, puis pre-detection
   * automatique en mode pseudonymisation, ou application du registre deja
   * charge en mode de-pseudonymisation.
   */
  setDocument(extracted) {
    if (!extracted) return;
    const doc = tokenizeDocument(extracted.paragraphs);
    set({ document: extracted, doc, ...initialProcess });

    const { mode, registry } = get();
    if (mode === "pseudo") {
      get().runAutoDetect();
    } else if (registry) {
      get().applyRegistry(registry.terms);
    }
  },

  async openDocument() {
    try {
      const extracted = await backend.pickDocument();
      if (extracted) get().setDocument(extracted);
    } catch (err) {
      toast.error(`Lecture impossible : ${err.message ?? err}`);
    }
  },

  async openDroppedFile(file, path) {
    try {
      const extracted = await backend.extractDroppedFile(file, path);
      if (extracted) get().setDocument(extracted);
    } catch (err) {
      toast.error(`Lecture impossible : ${err.message ?? err}`);
    }
  },

  /**
   * Charge l'exercice de demonstration. Permet d'essayer les deux flux sans
   * fichier reel — utile tant que l'extraction native n'est pas branchee.
   */
  loadSample() {
    if (get().mode === "depseudo") {
      // La restauration part du document deja pseudonymise et de son registre.
      set({
        registry: {
          fileName: "Correspondances_Exercice1.xlsx",
          terms: SAMPLE_REGISTRY,
        },
      });
      get().setDocument({ ...SAMPLE_PSEUDONYMISED_DOCUMENT });
      return;
    }
    get().setDocument({ ...SAMPLE_DOCUMENT });
  },

  async openRegistry() {
    try {
      const registry = await backend.pickRegistry();
      if (!registry) return;
      set({ registry });
      if (get().doc.length) get().applyRegistry(registry.terms);
    } catch (err) {
      toast.error(`Registre illisible : ${err.message ?? err}`);
    }
  },

  /** Transforme les lignes d'un registre en correspondances positionnees. */
  applyRegistry(rows) {
    const { doc, mode } = get();
    let id = 1;
    const terms = rows.map((row) => ({
      id: id++,
      text: row.text,
      type: row.type,
      pseudo: row.pseudo,
      // En de-pseudonymisation, ce sont les pseudonymes qui figurent dans le
      // document : c'est donc eux qu'on repere.
      hits: findOccurrences(doc, mode === "pseudo" ? row.text : row.pseudo),
    }));
    set({ terms, nextId: id, ...initialProcess });
  },

  /** Pre-detection par expressions regulieres. */
  runAutoDetect() {
    const { document: extracted, doc } = get();
    if (!extracted) return;

    const detected = autoDetect(extracted.paragraphs, doc);
    if (!detected.length) return;

    // Les expressions les plus longues d'abord, pour que la numerotation des
    // pseudonymes suive l'ordre de lecture du document.
    detected.sort((a, b) => wordCount(b.text) - wordCount(a.text));

    let id = get().nextId;
    const terms = [];
    for (const item of detected) {
      const index = terms.filter((t) => t.type === item.type).length + 1;
      terms.push({
        id: id++,
        text: item.text,
        type: item.type,
        pseudo: buildPseudo(item.type, index),
        hits: item.hits,
        auto: true,
      });
    }
    set({ terms, nextId: id });

    const plural = terms.length > 1 ? "s" : "";
    toast(
      `${terms.length} donnée${plural} pré-détectée${plural} — complétez la sélection dans le document`,
    );
  },

  /* ---------------------------------------------------------------- */
  /* Correspondances                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Cree une correspondance a partir d'une plage de tokens selectionnee dans
   * le document. Re-selectionner un terme existant le supprime.
   */
  addTerm(p, a, b) {
    const { doc, terms } = get();
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    const text = phraseAt(doc, p, from, to);
    if (!text) return;

    const existing = terms.find(
      (t) => t.text.toLowerCase() === text.toLowerCase(),
    );
    if (existing) {
      get().removeTerm(existing.id);
      return;
    }

    const type = guessType(text);
    const term = {
      id: get().nextId,
      text,
      type,
      pseudo: buildPseudo(type, nextIndexForType(terms, type)),
      hits: findOccurrences(doc, text),
    };
    set((s) => ({
      terms: [...s.terms, term],
      nextId: s.nextId + 1,
      ...initialProcess,
    }));
  },

  removeTerm(id) {
    set((s) => ({ terms: s.terms.filter((t) => t.id !== id) }));
  },

  setTermType(id, type) {
    set((s) => ({
      terms: s.terms.map((t) =>
        t.id === id
          ? {
              ...t,
              type,
              pseudo: buildPseudo(type, nextIndexForType(s.terms, type, id)),
            }
          : t,
      ),
    }));
  },

  setTermPseudo(id, pseudo) {
    set((s) => ({
      terms: s.terms.map((t) => (t.id === id ? { ...t, pseudo } : t)),
    }));
  },

  /* ---------------------------------------------------------------- */
  /* Traitement                                                       */
  /* ---------------------------------------------------------------- */

  async run() {
    const { mode, status, terms, document: extracted } = get();
    if (status === "running") return;

    if (!terms.length) {
      toast(
        mode === "pseudo"
          ? "Sélectionnez au moins un terme dans le document"
          : "Chargez le registre de correspondance",
      );
      return;
    }

    set({ status: "running", progress: 0 });

    // La progression reelle n'est pas connue tant que le backend n'a pas
    // rendu la main : on avance jusqu'a 90 %, puis on complete a la reponse.
    const timer = setInterval(() => {
      set((s) => ({
        progress: Math.min(90, s.progress + 6 + Math.random() * 8),
      }));
    }, 170);

    try {
      const deliverables = await backend.runProcessing({
        document: extracted,
        terms,
        reverse: mode !== "pseudo",
      });
      clearInterval(timer);
      set({ status: "done", progress: 100, view: "result", deliverables });
      toast.success(
        mode === "pseudo"
          ? "Document pseudonymisé — registre généré"
          : "Document restauré",
      );
    } catch (err) {
      clearInterval(timer);
      set({ status: "idle", progress: 0 });
      toast.error(`Traitement interrompu : ${err.message ?? err}`);
    }
  },

  /* ---------------------------------------------------------------- */
  /* Selecteurs derives                                               */
  /* ---------------------------------------------------------------- */

  /** Texte du document apres substitution, pour l'apercu et l'export. */
  resultParagraphs() {
    const { doc, terms, mode } = get();
    return applyTerms(doc, terms, { reverse: mode !== "pseudo" });
  },

  /** Le workspace ne s'affiche qu'une fois les prerequis reunis. */
  isReady() {
    const { document: extracted, mode, registry } = get();
    return Boolean(extracted) && (mode === "pseudo" || Boolean(registry));
  },
}));
