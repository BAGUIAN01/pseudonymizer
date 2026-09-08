"use client";

import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { useAnonymizer } from "@/store/use-anonymizer";
import { FolderIcon, MaskIcon, MoonIcon, RevealIcon, SunIcon } from "./icons";

/**
 * Bascule de theme, dans le bandeau.
 *
 * Un etat, pas une action : le vert de marque n'y a pas sa place. Le segment
 * retenu se detache par un fond clair, comme un curseur.
 *
 * `resolvedTheme` reste indefini jusqu'a l'hydratation et fait donc office
 * d'indicateur de montage, comme dans la bascule du bureau.
 */
export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const monte = resolvedTheme !== undefined;
  const sombre = resolvedTheme !== "light";

  return (
    <div
      className={cn(
        "glass flex flex-none gap-0.5 rounded-[13px] p-0.5",
        !monte && "invisible",
      )}
    >
      {[
        ["light", SunIcon, "Thème clair"],
        ["dark", MoonIcon, "Thème sombre"],
      ].map(([value, Icon, label]) => {
        const actif = value === (sombre ? "dark" : "light");
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={actif}
            aria-label={label}
            className={cn(
              "flex h-7 w-9 cursor-pointer items-center justify-center rounded-[11px] transition-colors",
              actif
                ? "bg-paper text-strong shadow-[0_1px_3px_rgba(16,24,40,.14)]"
                : "text-faint",
            )}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}

/** Bandeau d'un onglet : l'identite, la bascule de theme, le titre. */
export function TabHeader({ title }) {
  return (
    <header className="flex flex-none flex-col gap-1.5 px-5 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-3.5">
      <div className="flex items-center justify-between gap-3.5">
        <span className="font-mono text-[9.5px] tracking-[0.16em] text-faint uppercase">
          Filtre IA
        </span>
        <ThemeSwitch />
      </div>
      <h1 className="text-[25px] leading-[1.15] font-bold tracking-[-0.035em] text-balance text-strong">
        {title}
      </h1>
    </header>
  );
}

const TABS = [
  { id: "pseudo", label: "Pseudonymiser", Icon: MaskIcon },
  { id: "depseudo", label: "Dé-pseudonymiser", Icon: RevealIcon },
];

/**
 * Navigation : deux pastilles detachees.
 *
 * Au bureau, le selecteur de mode est le seul element de la colonne a porter
 * une ombre, volontairement detache du reste. Il descend ici dans la zone du
 * pouce et garde ce statut : ce sont les deux seules ombres de l'interface.
 *
 * Le contenu passe dessous ; le verre le laisse deviner.
 */
export function NavBar({ tab, onTab }) {
  const mode = useAnonymizer((s) => s.mode);
  const setMode = useAnonymizer((s) => s.setMode);

  function goMode(id) {
    setMode(id);
    onTab("mode");
  }

  return (
    <nav className="pointer-events-none absolute inset-x-5 bottom-[calc(env(safe-area-inset-bottom,0px)+22px)] z-30 flex items-center justify-between gap-3">
      <div className="glass pointer-events-auto flex gap-1 rounded-[22px] p-[5px]">
        {TABS.map(({ id, label, Icon }) => (
          <TabButton
            key={id}
            label={label}
            Icon={Icon}
            active={tab === "mode" && mode === id}
            onClick={() => goMode(id)}
          />
        ))}
      </div>

      <div className="glass pointer-events-auto flex rounded-[22px] p-[5px]">
        <TabButton
          label="Projet"
          Icon={FolderIcon}
          active={tab === "project"}
          onClick={() => onTab("project")}
        />
      </div>
    </nav>
  );
}

function TabButton({ label, Icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-[3px] rounded-[17px] px-3 pt-2 pb-[7px] transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-dim",
      )}
    >
      <Icon />
      <span className="text-[10px] font-semibold tracking-[-0.005em] whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}
