"use client";

import { cn } from "@/lib/utils";
import { useAnonymizer } from "@/store/use-anonymizer";

const MODES = [
  { value: "pseudo", label: "Pseudonymiser", index: "01" },
  { value: "depseudo", label: "Dé-pseudonymiser", index: "02" },
];

/**
 * Colonne de gauche : identite du produit, selecteur de mode, et rappel
 * permanent que le traitement ne quitte pas la machine.
 *
 * Les deux boutons de mode sont les seuls elements de l'interface a porter une
 * ombre : c'est ce qui les detache du reste, entierement plat.
 */
export function ModeSidebar() {
  const mode = useAnonymizer((s) => s.mode);
  const setMode = useAnonymizer((s) => s.setMode);

  return (
    <aside className="flex w-56 flex-none flex-col px-4 py-5">
      <div className="flex flex-col gap-1 px-2">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Filtre IA
        </span>
        <span className="text-[15px] font-semibold text-[#C7CCD3]">
          Anonymizer
        </span>
      </div>

      <nav className="flex flex-1 flex-col justify-center">
        <div className="flex flex-col gap-[5px] rounded-2xl bg-white/4 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
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
                    ? "bg-accent text-accent-foreground"
                    : "text-sidebar-foreground bg-transparent hover:bg-white/4 hover:text-[#C7CCD3]",
                )}
              >
                <span className="text-[13.5px] font-semibold">
                  {item.label}
                </span>
                <span className="font-mono text-[10px] opacity-60">
                  {item.index}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="text-muted-foreground flex items-center gap-2 px-2 font-mono text-[10px] tracking-[0.1em]">
        <span className="bg-primary size-1.5 rounded-full" />
        TRAITEMENT LOCAL
      </div>
    </aside>
  );
}
