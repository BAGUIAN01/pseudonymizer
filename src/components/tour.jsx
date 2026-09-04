"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useAnonymizer } from "@/store/use-anonymizer";

/**
 * Visite guidee du premier lancement.
 *
 * Elle pilote l'application plutot que de se contenter de la commenter : sans
 * document ouvert, la selection, le panneau et les livrables n'existent pas a
 * l'ecran et ne peuvent donc pas etre montres. La visite charge donc le
 * document d'exercice — sauf si l'utilisateur en a deja un ouvert, auquel cas
 * elle s'appuie sur le sien et ne detruit rien.
 *
 * Les cibles sont reperees par `data-tour` et non par des classes : un attribut
 * dedie survit aux retouches de style.
 */
const ETAPES = [
  {
    cible: null,
    titre: "Bienvenue dans Anonymizer",
    texte:
      "Cet outil remplace les données personnelles d’un document par des pseudonymes, puis sait faire le chemin inverse. Tout se passe sur cette machine : aucun document ne part sur le réseau.",
  },
  {
    cible: "projet",
    titre: "Commencez par un projet",
    texte:
      "Un projet retient les correspondances entre données réelles et pseudonymes. C’est lui qui rendra la restauration possible, sans avoir à retrouver un fichier de registre.",
    // Inutile d'expliquer comment en creer un a quelqu'un qui en a deja un.
    variante: ({ projet }) =>
      projet && {
        titre: "Votre projet en cours",
        texte:
          "Il retient les correspondances entre données réelles et pseudonymes, et les réapplique à chaque nouveau document du dossier. C’est lui qui rendra la restauration possible.",
      },
  },
  {
    cible: "depot",
    titre: "Déposez un document",
    texte:
      "Glissez un PDF, un DOCX, un tableur ou un fichier texte. Pour cette visite, nous ouvrons un document d’exercice.",
    // Un document est deja ouvert : la zone de depot n'est meme plus a
    // l'ecran, et l'etape n'aurait rien a designer.
    montrerSi: ({ document }) => !document,
  },
  {
    cible: "document",
    titre: "Désignez ce qui doit disparaître",
    texte:
      "Surlignez le texte au curseur, comme dans un traitement de texte. Un double-clic sur un nom capture l’entité entière : « Dupont » attrape « Jean Dupont ». Une barre vous montre le terme exact avant de le créer.",
    prepare: "exemple",
    variante: ({ document }) =>
      document && {
        titre: "Désignez ce qui doit disparaître",
        texte:
          "Dans votre document, surlignez le texte au curseur. Un double-clic sur un nom capture l’entité entière : « Dupont » attrape « Jean Dupont ». Une barre vous montre le terme exact avant de le créer.",
      },
  },
  {
    cible: "panneau",
    titre: "Vérifiez les correspondances",
    texte:
      "Chaque terme apparaît ici avec son type et son pseudonyme, modifiables. Le champ de recherche ajoute un terme sans avoir à le retrouver dans le texte, et indique combien de fois il apparaît.",
  },
  {
    cible: "traitement",
    titre: "Lancez le traitement",
    texte:
      "Le document est réécrit dans son format d’origine, et un registre des correspondances est produit à côté. Gardez ce registre : c’est lui qui permet de restaurer le document.",
  },
  {
    cible: "livrables",
    titre: "Récupérez vos fichiers",
    texte:
      "Le traitement vient d’être lancé sur ce document d’exercice. Une fois terminé, un bouton « Tout télécharger » apparaît ici : il dépose le document pseudonymisé et son registre dans le dossier de votre choix.",
    prepare: "traitement",
  },
  {
    cible: "apercu",
    titre: "Comparez avant et après",
    texte:
      "Vous voyez maintenant l’aperçu du résultat : les données sont remplacées par leurs pseudonymes. Ces deux onglets font l’aller-retour avec le document d’origine — c’est le moment de vérifier qu’aucune donnée n’a été oubliée.",
    prepare: "apercu",
  },
  {
    cible: "modes",
    titre: "Puis faites le chemin inverse",
    texte:
      "Passez en « Dé-pseudonymiser » et déposez le texte revenu de votre traitement extérieur. Les pseudonymes y reprennent leurs valeurs d’origine — le document n’a pas besoin d’être identique à celui de départ.",
  },
  {
    cible: "depot",
    titre: "Déposez le texte revenu",
    texte:
      "Nous voici en restauration. Déposez ici le rapport revenu de votre traitement extérieur : ses pseudonymes reprendront leurs valeurs d’origine. Le projet actif fournit les correspondances, aucun registre à recharger.",
    prepare: "restauration",
  },
  {
    cible: "panneau",
    titre: "Les correspondances vous suivent",
    texte:
      "Nous avons ouvert un texte pseudonymisé d’exemple. Ses pseudonymes sont déjà reconnus, avec les valeurs d’origine en face : il ne reste qu’à lancer la restauration.",
    prepare: "exemple-restauration",
  },
  {
    cible: "theme",
    titre: "Sombre ou clair, à votre main",
    texte:
      "Ces deux boutons changent l’apparence de l’application. Le thème sombre est celui par défaut ; le clair convient mieux à un écran lu en plein jour. Votre choix est retenu.",
  },
];

/** Marge autour de la cible eclairee. */
const MARGE = 8;

export function Tour() {
  const onboardingDone = useAnonymizer((s) => s.onboardingDone);
  const setOnboardingDone = useAnonymizer((s) => s.setOnboardingDone);
  const loadSample = useAnonymizer((s) => s.loadSample);
  const setMode = useAnonymizer((s) => s.setMode);
  const setView = useAnonymizer((s) => s.setView);
  const run = useAnonymizer((s) => s.run);
  const status = useAnonymizer((s) => s.status);
  const hasDocument = useAnonymizer((s) => Boolean(s.document));
  const tourContext = useAnonymizer((s) => s.tourContext);

  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const lanceRef = useRef(null);

  const actif = !onboardingDone;

  // Le parcours decoule de l'instantane pris quand la visite a ete armee, pas
  // de l'etat courant : la visite ouvre elle-meme un document a l'une de ses
  // etapes, et sa liste se reordonnerait a cause de ce qu'elle a provoque.
  const parcours = useMemo(() => {
    if (!tourContext) return ETAPES;
    return ETAPES.filter(
      (e) => !e.montrerSi || e.montrerSi(tourContext),
    ).map((e) => ({ ...e, ...(e.variante?.(tourContext) || {}) }));
  }, [tourContext]);

  const etape = parcours[index];

  const terminer = useCallback(() => {
    setIndex(0);
    // La visite a pu basculer en restauration pour la montrer : on rend
    // l'application dans son mode de depart.
    setMode("pseudo");
    setOnboardingDone(true);
  }, [setMode, setOnboardingDone]);

  // Certaines etapes ont besoin que l'application soit dans un etat donne.
  // Le document de l'utilisateur prime : la visite ne remplace jamais son
  // travail par l'exercice.
  useEffect(() => {
    if (!actif) return;
    const prepare = parcours[index]?.prepare;
    if (prepare === "exemple" && !hasDocument) loadSample();
    // Le traitement s'execute vraiment : le document d'exercice n'a pas de
    // chemin disque, rien n'est donc ecrit sur la machine.
    // Une seule tentative : sans ce garde, un traitement qui echoue ramene le
    // statut a « idle », l'effet se redeclenche, et la visite tourne en
    // boucle.
    if (prepare === "traitement" && status === "idle" && lanceRef.current !== index) {
      lanceRef.current = index;
      run();
    }
    // La bascule attend la fin du traitement, sinon elle serait refusee.
    if (prepare === "apercu" && status === "done") setView("result");
    // La restauration n'a rien a montrer tant qu'on est en pseudonymisation :
    // la visite change de mode elle-meme, puis ouvre l'exemple pseudonymise.
    if (prepare === "restauration") setMode("depseudo");
    if (prepare === "exemple-restauration" && !hasDocument) loadSample();
  }, [
    actif,
    index,
    parcours,
    hasDocument,
    status,
    loadSample,
    run,
    setView,
    setMode,
  ]);

  // La mesure est reportee hors du corps de l'effet : la cible d'une etape qui
  // vient de changer l'etat n'est pas encore dans le DOM. Un report a zero
  // plutot qu'une image d'animation, car celle-ci est suspendue quand la
  // fenetre passe en arriere-plan — le projecteur resterait alors fige.
  useEffect(() => {
    if (!actif) return undefined;

    const mesurer = () => {
      const cible = parcours[index]?.cible;
      if (!cible) {
        setRect(null);
        return;
      }
      const noeud = document.querySelector(`[data-tour="${cible}"]`);
      setRect(noeud ? noeud.getBoundingClientRect() : null);
    };

    const planifier = mesurer;
    const premier = setTimeout(mesurer, 0);
    // Une cible qui apparait apres un changement d'etat n'existe pas encore au
    // premier passage : on remesure brievement.
    const rattrapage = setInterval(planifier, 250);
    const arret = setTimeout(() => clearInterval(rattrapage), 2000);

    window.addEventListener("resize", planifier);
    window.addEventListener("scroll", planifier, true);
    return () => {
      clearTimeout(premier);
      clearInterval(rattrapage);
      clearTimeout(arret);
      window.removeEventListener("resize", planifier);
      window.removeEventListener("scroll", planifier, true);
    };
  }, [actif, index, parcours]);

  useEffect(() => {
    if (!actif) return undefined;
    const auClavier = (e) => {
      if (e.key === "Escape") terminer();
      if (e.key === "Enter") setIndex((i) => Math.min(i + 1, parcours.length - 1));
    };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [actif, parcours, terminer]);

  if (!actif || !etape) return null;

  const dernier = index === parcours.length - 1;

  return (
    <div className="fixed inset-0 z-50">
      {/*
        Le projecteur : une boite posee sur la cible, dont l'ombre couvre tout
        le reste de l'ecran. Un seul element suffit, sans masque SVG.
      */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl transition-all duration-200"
          style={{
            left: rect.left - MARGE,
            top: rect.top - MARGE,
            width: rect.width + MARGE * 2,
            height: rect.height + MARGE * 2,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.62)",
            outline: "2px solid var(--primary)",
            outlineOffset: "-1px",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/62" />
      )}

      <Bulle
        rect={rect}
        etape={etape}
        index={index}
        total={parcours.length}
        dernier={dernier}
        onPrecedent={() => setIndex((i) => Math.max(0, i - 1))}
        onSuivant={() => (dernier ? terminer() : setIndex((i) => i + 1))}
        onPasser={terminer}
      />
    </div>
  );
}

function Bulle({
  rect,
  etape,
  index,
  total,
  dernier,
  onPrecedent,
  onSuivant,
  onPasser,
}) {
  const LARGEUR = 340;

  // Sans cible, la bulle se centre. Sinon elle se place du cote ou il reste de
  // la place, pour ne jamais recouvrir ce qu'elle designe.
  let style;
  if (!rect) {
    style = {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: LARGEUR,
    };
  } else {
    const placeADroite = window.innerWidth - rect.right > LARGEUR + 40;
    const gauche = placeADroite
      ? rect.right + 20
      : Math.max(20, rect.left - LARGEUR - 20);
    // La bulle est bornee par sa propre hauteur : sans cela, une cible en bas
    // d'ecran la poussait hors du cadre et ses boutons devenaient
    // inatteignables.
    const HAUTEUR = 260;
    style = {
      left: Math.min(gauche, window.innerWidth - LARGEUR - 20),
      top: Math.min(
        Math.max(16, rect.top + rect.height / 2 - HAUTEUR / 2),
        Math.max(16, window.innerHeight - HAUTEUR - 16),
      ),
      width: LARGEUR,
    };
  }

  return (
    <div
      style={style}
      className="bg-surface absolute flex flex-col gap-3 rounded-2xl border p-4 shadow-[var(--shadow-dialog)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-accent-strong font-mono text-[9.5px] font-semibold tracking-[0.16em] uppercase">
          Étape {index + 1} sur {total}
        </span>
        <button
          type="button"
          onClick={onPasser}
          className="hover:text-foreground cursor-pointer font-mono text-[10px] text-dim transition-colors"
        >
          Passer
        </button>
      </div>

      <h2 className="text-[15px] font-bold text-strong">{etape.titre}</h2>
      <p className="text-[12.5px] leading-[1.6] text-foreground">
        {etape.texte}
      </p>

      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                i === index ? "bg-primary" : "bg-tint/20",
              )}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {index > 0 && (
            <button
              type="button"
              onClick={onPrecedent}
              className="cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-bold text-foreground transition-colors hover:bg-tint/8"
            >
              Retour
            </button>
          )}
          <button
            type="button"
            onClick={onSuivant}
            className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer rounded-lg px-3.5 py-1.5 text-[12px] font-bold transition-colors"
          >
            {dernier ? "Terminer" : "Suivant"}
          </button>
        </div>
      </div>
    </div>
  );
}
