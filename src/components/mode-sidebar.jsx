"use client";

import Image from "next/image";

import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";
import { useAnonymizer } from "@/store/use-anonymizer";

/*
  La carte de projet lit un stockage local, qui n'existe pas au rendu serveur :
  la rendre des deux cotes produisait une divergence d'hydratation. Elle est
  donc montee cote client uniquement.
*/
const ProjectCard = dynamic(
  () => import("@/components/project-card").then((m) => m.ProjectCard),
  { ssr: false },
);

// La bascule de theme depend de ce qui est enregistre sur le poste : rendue
// des deux cotes, elle produisait une divergence d'hydratation sur sa classe,
// que React ne corrige pas — le bouton restait invisible definitivement.
// La fiche du logiciel lit la version de l'application : rien a faire au
// rendu serveur.
const AboutDialog = dynamic(
  () => import("@/components/about-dialog").then((m) => m.AboutDialog),
  { ssr: false },
);

const ThemeToggle = dynamic(
  () => import("@/components/theme-toggle").then((m) => m.ThemeToggle),
  { ssr: false },
);

// La proposition de mise a jour interroge le reseau : elle n'a rien a faire
// au rendu serveur.
const UpdateBanner = dynamic(
  () => import("@/components/update-banner").then((m) => m.UpdateBanner),
  { ssr: false },
);

/**
 * Rappel du guide, toujours accessible.
 *
 * Le lien de l'ecran d'accueil disparait des qu'un document est ouvert, et
 * personne ne cherche de l'aide dans un dialogue de projets.
 */
function GuideButton() {
  const setOnboardingDone = useAnonymizer((s) => s.setOnboardingDone);

  return (
    <button
      type="button"
      onClick={() => setOnboardingDone(false)}
      aria-label="Revoir le guide de démarrage"
      title="Revoir le guide de démarrage"
      className="bg-tint/5 hover:bg-tint/10 flex size-7 cursor-pointer items-center justify-center rounded-lg text-[12px] font-bold text-dim transition-colors hover:text-foreground"
    >
      ?
    </button>
  );
}

const MODES = [
  { value: "pseudo", label: "Pseudonymiser", index: "01" },
  { value: "depseudo", label: "Dé-pseudonymiser", index: "02" },
];

/**
 * Colonne de gauche : identite du produit, selecteur de mode, et rappel
 * permanent que le traitement ne quitte pas la machine.
 *
 * Le selecteur de mode et la carte de projet sont les seuls elements a porter
 * une ombre : ce sont les deux points de commande permanents de la colonne, et
 * l'ombre les detache du reste, entierement plat.
 */
export function ModeSidebar() {
  const mode = useAnonymizer((s) => s.mode);
  const setMode = useAnonymizer((s) => s.setMode);

  return (
    <aside className="flex w-56 min-h-0 flex-none flex-col overflow-hidden px-4 py-5">
      <div className="flex items-center gap-2.5 px-2">
        <Image
          src="/logo.png"
          alt="Armoiries du Burkina Faso"
          width={30}
          height={34}
          priority
          className="h-[34px] w-auto flex-none"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[10px] tracking-[0.18em] text-foreground uppercase">
            Filtre IA
          </span>
          <span className="text-[16px] font-bold tracking-[-0.01em] text-strong">
            Pseudonymizer
          </span>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col justify-center" data-tour="modes">
        <div className="bg-paper flex flex-col gap-[5px] rounded-2xl border p-1.5 shadow-[var(--shadow-panel)]">
          {MODES.map((item) => {
            const active = mode === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setMode(item.value)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2.5 rounded-xl px-3.5 py-3 text-left transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-tint/80 hover:bg-tint/6 hover:text-strong",
                )}
              >
                <span className="text-[13.5px] font-bold">{item.label}</span>
                <span className="font-mono text-[10px] opacity-80">
                  {item.index}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="flex flex-col gap-2">
        <UpdateBanner />

        {/*
          La bascule de theme n'est plus dans le bandeau, qui n'apparait
          qu'avec un document ouvert. Elle se colle a la carte de projet pour
          former un seul bloc en pied de colonne.
        */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-center gap-1.5 px-1">
            <div data-tour="theme">
              <ThemeToggle />
            </div>
            <GuideButton />
            <AboutDialog />
          </div>
          <ProjectCard />
        </div>
      </div>
    </aside>
  );
}
