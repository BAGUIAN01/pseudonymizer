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
  projects: [],
  activeProjectId: null,
  confirmed: false, // l'espace de travail ne s'ouvre qu'apres validation
  onboardingDone: true, // vrai jusqu'a la lecture du fichier : evite un
  // clignotement de la visite au demarrage
  tourContext: null, // etat fige a l'ouverture de la visite
  document: null,
  doc: [], // document tokenise
  registry: null, // { fileName, terms }
  terms: [],
  nextId: 1,
  ...initialProcess,

  /* ---------------------------------------------------------------- */
  /* Projets                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Un projet retient les correspondances etablies : c'est ce qui permet de
   * de-pseudonymiser plus tard sans avoir a retrouver le fichier de registre.
   */

  /**
   * Marque la visite guidee comme vue, ou la repropose.
   *
   * Armer la visite fige l'etat de l'application au meme instant : elle
   * ouvrira elle-meme un document a l'une de ses etapes, et son parcours ne
   * doit pas se reordonner en cours de route a cause de ce qu'elle a provoque.
   */
  async setOnboardingDone(done) {
    set({
      onboardingDone: done,
      tourContext: done
        ? null
        : { document: Boolean(get().document), projet: Boolean(get().activeProjectId) },
    });
    await get().persist();
  },

  async loadProjects() {
    const { projects, activeId, onboardingDone } = await backend.loadProjects();
    set({
      projects,
      onboardingDone,
      tourContext: onboardingDone
        ? null
        : { document: Boolean(get().document), projet: Boolean(activeId) },
    });
    // Retrouver son projet a l'ouverture fait partie de ne rien perdre.
    if (activeId && projects.some((p) => p.id === activeId)) {
      get().selectProject(activeId);
    }
  },

  /** Ecrit l'etat des projets sur le disque apres chaque modification. */
  async persist() {
    const { projects, activeProjectId, onboardingDone } = get();
    try {
      await backend.saveProjects({
        projects,
        activeId: activeProjectId,
        onboardingDone,
      });
    } catch (err) {
      toast.error(`Projet non enregistré : ${err.message ?? err}`);
    }
  },

  async persistProjects(projects) {
    set({ projects });
    await get().persist();
  },

  async createProject(name) {
    const label = String(name ?? "").trim();
    if (!label) return null;

    const project = {
      id: `p${Date.now().toString(36)}`,
      name: label,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      terms: [],
    };
    // Le projet devient actif avant d'etre ecrit : dans l'ordre inverse, le
    // fichier conservait `activeId: null` jusqu'a la prochaine ecriture.
    set({ activeProjectId: project.id });
    await get().persistProjects([...get().projects, project]);
    toast.success(`Projet « ${label} » créé`);
    return project;
  },

  /**
   * Active un projet. En de-pseudonymisation, ses correspondances tiennent
   * lieu de registre : c'est tout l'interet de les avoir gardees.
   */
  selectProject(id) {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;

    // Changer de projet repart toujours d'une page blanche. Sans cette remise
    // a zero inconditionnelle, le document du projet precedent restait a
    // l'ecran — et donnait a croire qu'il appartenait au dossier qu'on venait
    // d'ouvrir.
    set({
      activeProjectId: id,
      document: null,
      doc: [],
      registry: null,
      terms: [],
      nextId: 1,
      confirmed: false,
      ...initialProcess,
    });
    get().persist();

    if (get().mode === "depseudo") {
      // Les correspondances du projet tiennent lieu de registre : c'est tout
      // l'interet de les avoir gardees.
      //
      // Le document d'origine n'est volontairement pas rouvert : en
      // restauration, ce qu'on attend est le texte revenu du traitement
      // exterieur, pas le fichier de depart — qui contient justement les
      // donnees reelles.
      if (project.terms.length) {
        get().setRegistry({
          fileName: `Projet « ${project.name} »`,
          path: "",
          terms: project.terms,
          fromProject: project.name,
        });
      }
      return;
    }

    // En pseudonymisation, rouvrir le dernier document evite de repartir de
    // zero : sans lui, l'espace de travail reste ferme et le projet parait
    // vide.
    const last = project.documents?.[0];
    if (last) get().openStoredDocument(last);
  },

  /**
   * Verse les correspondances connues du projet actif dans la session.
   *
   * Un terme deja detecte automatiquement prend le pseudonyme du projet : un
   * meme nom doit porter le meme pseudonyme d'un document a l'autre, sans quoi
   * les registres de deux documents du meme dossier se contrediraient.
   *
   * Les termes du projet absents du document courant sont ignores : ils
   * encombreraient la liste sans rien designer.
   */
  applyProjectTerms() {
    const { projects, activeProjectId, doc, terms, mode } = get();
    const project = projects.find((p) => p.id === activeProjectId);
    if (!project?.terms.length || !doc.length) return;

    const byText = new Map(terms.map((t) => [t.text.toLowerCase(), t]));
    let id = get().nextId;
    let added = 0;

    for (const row of project.terms) {
      const key = row.text.toLowerCase();
      const existing = byText.get(key);
      const hits = findOccurrences(doc, mode === "pseudo" ? row.text : row.pseudo);

      if (existing) {
        byText.set(key, { ...existing, type: row.type, pseudo: row.pseudo, hits });
      } else if (hits.length) {
        byText.set(key, {
          id: id++,
          text: row.text,
          type: row.type,
          pseudo: row.pseudo,
          hits,
        });
        added += 1;
      }
    }

    set({ terms: [...byText.values()], nextId: id, ...initialProcess });

    if (added) {
      toast(
        `${added} correspondance${added > 1 ? "s" : ""} du projet « ${project.name} » retrouvée${added > 1 ? "s" : ""}`,
      );
    }
  },

  async deleteProject(id) {
    const rest = get().projects.filter((p) => p.id !== id);
    await get().persistProjects(rest);
    if (get().activeProjectId === id) {
      set({ activeProjectId: null });
      await get().persist();
    }
  },

  /**
   * Verse les correspondances du document courant dans le projet actif.
   *
   * Les termes deja connus sont mis a jour plutot que dupliques : un meme nom
   * doit garder le meme pseudonyme d'un document a l'autre, sans quoi le
   * registre du projet deviendrait ambigu.
   */
  /**
   * Verse dans le projet actif le travail du document courant : les
   * correspondances, et le document lui-meme.
   *
   * Le texte extrait est conserve, pas seulement le chemin : rouvrir un projet
   * doit rendre l'apercu meme si le fichier a ete deplace ou renomme depuis.
   *
   * Les termes deja connus sont mis a jour plutot que dupliques : un meme nom
   * doit garder le meme pseudonyme d'un document a l'autre, sans quoi le
   * registre du projet deviendrait ambigu.
   */
  async rememberWork() {
    const { activeProjectId, projects, terms, document: extracted } = get();
    if (!activeProjectId) return;

    const next = projects.map((project) => {
      if (project.id !== activeProjectId) return project;

      const byText = new Map(
        project.terms.map((t) => [t.text.toLowerCase(), t]),
      );
      for (const term of terms) {
        byText.set(term.text.toLowerCase(), {
          text: term.text,
          type: term.type,
          pseudo: term.pseudo,
        });
      }

      let documents = project.documents ?? [];
      if (extracted) {
        const key = extracted.path || extracted.fileName;
        documents = [
          {
            fileName: extracted.fileName,
            path: extracted.path ?? "",
            format: extracted.format,
            title: extracted.title,
            paragraphs: extracted.paragraphs,
            savedAt: new Date().toISOString(),
          },
          ...documents.filter((d) => (d.path || d.fileName) !== key),
          // Le fichier de projets ne doit pas croitre sans fin.
        ].slice(0, 20);
      }

      return {
        ...project,
        terms: [...byText.values()],
        documents,
        updatedAt: new Date().toISOString(),
      };
    });

    await get().persistProjects(next);
  },

  /**
   * Reouvre un document conserve dans un projet.
   *
   * La detection automatique n'est volontairement pas relancee : le projet
   * contient les correspondances que l'utilisateur a validees, et re-proposer
   * des termes qu'il avait ecartes serait un retour en arriere.
   */
  openStoredDocument(stored) {
    const doc = tokenizeDocument(stored.paragraphs);
    set({
      document: {
        fileName: stored.fileName,
        path: stored.path ?? "",
        format: stored.format,
        title: stored.title,
        paragraphs: stored.paragraphs,
      },
      doc,
      confirmed: true,
      ...initialProcess,
    });

    const { mode, projects, activeProjectId } = get();
    const project = projects.find((p) => p.id === activeProjectId);
    if (mode === "depseudo" && project?.terms.length) {
      get().applyRegistry(project.terms);
      set({ registry: { fileName: `Projet « ${project.name} »`, path: "", terms: project.terms } });
      return;
    }
    get().applyProjectTerms();
  },

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
      confirmed: false,
      ...initialProcess,
    });

    // Changer d'onglet ne doit pas defaire le travail en cours : le projet
    // actif est reapplique dans les deux sens. `selectProject` sait quoi faire
    // de chaque mode — rouvrir le dernier document en pseudonymisation,
    // fournir les correspondances en restauration.
    const { activeProjectId } = get();
    if (activeProjectId) {
      get().selectProject(activeProjectId);
    }
  },

  /** Ouvre l'espace de travail sur ce qui vient d'etre depose. */
  confirmStage() {
    if (!get().document) return;
    set({ confirmed: true });
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
      confirmed: false,
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
    set({ document: extracted, doc, confirmed: false, ...initialProcess });

    const { mode, registry } = get();
    if (mode === "pseudo") {
      get().runAutoDetect();
      // Le projet actif prime sur la detection : ses pseudonymes sont ceux
      // deja livres pour les documents precedents.
      get().applyProjectTerms();
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
      set({ confirmed: true });
      return;
    }
    get().setDocument({ ...SAMPLE_DOCUMENT });
    set({ confirmed: true });
  },

  async openRegistry() {
    try {
      const registry = await backend.pickRegistry();
      if (!registry) return;
      get().setRegistry(registry);
    } catch (err) {
      toast.error(`Registre illisible : ${err.message ?? err}`);
    }
  },

  async openDroppedRegistry(file, path) {
    try {
      const registry = await backend.readDroppedRegistry(file, path);
      if (registry) get().setRegistry(registry);
    } catch (err) {
      toast.error(`Registre illisible : ${err.message ?? err}`);
    }
  },

  setRegistry(registry) {
    set({ registry });
    if (get().doc.length) get().applyRegistry(registry.terms);
  },

  /**
   * Point d'entree du glisser-deposer sur toute la surface de la fenetre.
   *
   * En mode restauration, un tableur depose alors qu'aucun registre n'est
   * charge est pris pour le registre : c'est la seule lecture raisonnable.
   */
  openDroppedAny(file, path) {
    const name = path || file?.name || "";
    const spreadsheet = /\.(xlsx|xls|csv)$/i.test(name);
    const { mode, registry } = get();
    if (mode === "depseudo" && spreadsheet && !registry) {
      get().openDroppedRegistry(file, path);
      return;
    }
    get().openDroppedFile(file, path);
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

    // Un registre peut couvrir plusieurs documents, ou avoir ete saisi avec
    // des graphies differentes : une correspondance introuvable n'est pas une
    // erreur, mais elle doit se voir. Sans cela, l'utilisateur croit tout
    // traiter alors qu'une partie passe a travers.
    const trouves = terms.filter((t) => t.hits.length).length;
    const absents = terms.length - trouves;

    if (!terms.length) {
      toast.error("Ce registre ne contient aucune correspondance lisible");
    } else if (!trouves) {
      toast.error(
        `Aucune des ${terms.length} correspondances du registre n'apparaît dans ce document. S'agit-il du bon fichier ?`,
      );
    } else if (absents) {
      toast(
        `${trouves} correspondance${trouves > 1 ? "s" : ""} sur ${terms.length} retrouvée${trouves > 1 ? "s" : ""} — ${absents} absente${absents > 1 ? "s" : ""} de ce document`,
      );
    } else {
      toast.success(
        `${trouves} correspondance${trouves > 1 ? "s" : ""} retrouvée${trouves > 1 ? "s" : ""}`,
      );
    }
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
   * le document. Le type vient de la barre de selection quand l'utilisateur
   * l'a choisi ; sinon il est devine.
   */
  addTerm(p, a, b, type) {
    const { doc } = get();
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    return get().addTermByText(phraseAt(doc, p, from, to), type);
  },

  /**
   * Cree une correspondance a partir d'un texte, qu'il vienne du document, du
   * champ de recherche ou d'une saisie directe. Toutes les occurrences sont
   * reperees, y compris celles que l'utilisateur n'a pas vues.
   *
   * @returns {boolean} vrai si la correspondance a ete creee
   */
  addTermByText(text, type) {
    const clean = String(text ?? "").trim();
    if (!clean) return false;

    const { doc, terms } = get();
    const existing = terms.find(
      (t) => t.text.toLowerCase() === clean.toLowerCase(),
    );
    if (existing) {
      toast(`« ${existing.text} » figure déjà dans les correspondances`);
      return false;
    }

    const kind = type ?? guessType(clean);
    const term = {
      id: get().nextId,
      text: clean,
      type: kind,
      pseudo: buildPseudo(kind, nextIndexForType(terms, kind)),
      hits: findOccurrences(doc, clean),
    };
    set((s) => ({
      terms: [...s.terms, term],
      nextId: s.nextId + 1,
      ...initialProcess,
    }));
    return true;
  },

  removeTerm(id) {
    const term = get().terms.find((t) => t.id === id);
    set((s) => ({ terms: s.terms.filter((t) => t.id !== id) }));
    // Sans cet oubli, le terme revient des que le projet est rouvert : il
    // n'aurait ete retire que de la session.
    if (term) get().forgetTerm(term.text);
  },

  /** Retire durablement un terme du projet actif. */
  async forgetTerm(text) {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) return;

    const cle = String(text).toLowerCase();
    let modifie = false;
    const next = projects.map((project) => {
      if (project.id !== activeProjectId) return project;
      const restants = project.terms.filter((t) => t.text.toLowerCase() !== cle);
      if (restants.length === project.terms.length) return project;
      modifie = true;
      return { ...project, terms: restants, updatedAt: new Date().toISOString() };
    });

    if (modifie) await get().persistProjects(next);
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
      if (mode === "pseudo") get().rememberWork();
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
    const { document: extracted, mode, registry, confirmed } = get();
    return (
      Boolean(extracted) &&
      confirmed &&
      (mode === "pseudo" || Boolean(registry))
    );
  },
}));
