"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

/**
 * Feuille basse.
 *
 * Deux mecaniques, selon l'usage :
 *
 * - `snaps` fourni — la feuille est permanente et s'arrete sur des paliers.
 *   Elle anime alors sa **hauteur** : translatee, elle depasserait l'ecran
 *   par le bas et son pied, donc l'action, resterait hors de vue tant
 *   qu'elle n'est pas tiree a fond.
 * - `snaps` absent — la feuille prend la hauteur de son contenu, monte par
 *   translation et se ferme d'un glissement vers le bas.
 *
 * La transition n'est posee qu'au repos : pendant le geste, elle ferait
 * trainer la feuille derriere le doigt.
 *
 * @param {number[]} [snaps] hauteurs visibles ; un nombre <= 1 vaut une
 *   fraction de la hauteur disponible. Passer une constante de module : le
 *   tableau entre dans les dependances des gestes.
 */
export function Sheet({
  snaps,
  index = 0,
  onIndex,
  title,
  subtitle,
  onClose,
  footer,
  children,
}) {
  const ref = useRef(null);
  const drag = useRef(null);

  const [box, setBox] = useState(0);
  const [height, setHeight] = useState(0);
  const [live, setLive] = useState(null); // hauteur ou translation pendant le geste
  const [dragging, setDragging] = useState(false);
  const [entered, setEntered] = useState(false);

  const permanent = Array.isArray(snaps) && snaps.length > 0;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el?.parentElement) return;

    const measure = () => {
      setBox(el.parentElement.clientHeight);
      if (!permanent) setHeight(el.offsetHeight);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el.parentElement);
    observer.observe(el);
    return () => observer.disconnect();
  }, [permanent]);

  // Les paliers ne se connaissent qu'une fois le conteneur mesure.
  const steps = useMemo(
    () => (permanent ? snaps.map((s) => (s <= 1 ? Math.round(box * s) : s)) : []),
    [box, permanent, snaps],
  );

  const visible = permanent ? (steps[index] ?? 0) : height;
  const max = permanent ? Math.max(...steps, 0) : height;
  const closed = permanent && visible <= 1 && live === null;

  // A la premiere image, une feuille contextuelle est encore basse : sans
  // cela elle apparaitrait deja en place, sans montee.
  useEffect(() => {
    if (permanent || !height) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [height, permanent]);

  const onPointerDown = useCallback(
    (event) => {
      if (event.target.closest("button")) return;
      drag.current = { y: event.clientY, from: permanent ? visible : 0 };
      setDragging(true);
      setLive(drag.current.from);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [permanent, visible],
  );

  const onPointerMove = useCallback(
    (event) => {
      const start = drag.current;
      if (!start) return;
      const delta = event.clientY - start.y;

      if (permanent) {
        let next = start.from - delta;
        if (next > max) next = max + (next - max) * 0.25; // caoutchouc en butee
        if (next < 0) next = 0;
        setLive(next);
        return;
      }
      setLive(delta < 0 ? delta * 0.25 : delta);
    },
    [max, permanent],
  );

  const onPointerUp = useCallback(() => {
    const start = drag.current;
    drag.current = null;
    setDragging(false);
    if (!start) return;

    const current = live ?? start.from;
    if (permanent) {
      let best = 0;
      steps.forEach((step, i) => {
        if (Math.abs(step - current) < Math.abs(steps[best] - current)) best = i;
      });
      setLive(null);
      if (best !== index) onIndex?.(best);
      return;
    }
    if (current > height * 0.35) onClose?.();
    setLive(null);
  }, [height, index, live, onClose, onIndex, permanent, steps]);

  const style = permanent
    ? { height: (live ?? visible) + "px" }
    : {
        transform: `translateY(${!entered ? height : (live ?? 0)}px)`,
        maxHeight: "84%",
      };

  return (
    <div
      ref={ref}
      style={style}
      aria-hidden={closed || undefined}
      className={cn(
        "bg-sheet absolute inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-[20px] border-t",
        !dragging && "sheet-settled",
        // Repliee, la feuille disparait vraiment : sans cela ses boutons
        // restaient atteignables au clavier et annonces par les lecteurs
        // d'ecran.
        closed && "invisible",
      )}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex-none touch-none"
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="h-[5px] w-10 rounded-full bg-tint/22" aria-hidden />
        </div>

        <div className="flex items-start gap-3 border-b px-5 pt-2 pb-3.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-bold tracking-[-0.025em] text-strong">
              {title}
            </span>
            {subtitle && (
              <span className="mt-[3px] block text-[12.5px] text-faint">
                {subtitle}
              </span>
            )}
          </span>
          <CloseButton onClick={onClose} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>

      {footer && (
        <div className="bg-sheet flex flex-none flex-col gap-1 border-t px-5 pt-3 pb-[30px]">
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * Fermeture d'une feuille.
 *
 * Un disque marque, et une croix tracee : en libelle de neuf pixels, elle ne
 * se voyait pas. La cible fait 46 px quand le disque en fait 36 — on ne
 * dessine pas un bouton de la taille du doigt, on l'atteint.
 */
export function CloseButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Fermer"
      className="relative flex size-9 flex-none cursor-pointer items-center justify-center rounded-full bg-tint/13 text-strong after:absolute after:-inset-[5px] after:content-['']"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

/** Voile : il ferme la feuille qu'il assombrit. */
export function Scrim({ onClick }) {
  return (
    <button
      type="button"
      // Pas « Fermer » : le bandeau du document porte deja ce nom, et deux
      // commandes homonymes se confondent a la lecture d'ecran.
      aria-label="Fermer la feuille"
      onClick={onClick}
      className="absolute inset-0 z-30 cursor-default bg-black/40"
    />
  );
}
