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
 * Feuille basse, glissante.
 *
 * Deux usages, une seule mecanique :
 *
 * - `snaps` fourni : la feuille est permanente et s'arrete sur des paliers
 *   (apercu, moitie, plein). C'est le panneau des correspondances, qui doit
 *   rester atteignable sans masquer le document.
 * - `snaps` absent : la feuille prend la hauteur de son contenu et se ferme
 *   d'un glissement vers le bas. C'est le cas de toutes les feuilles
 *   contextuelles.
 *
 * La transition n'est posee qu'au repos : pendant le geste, elle ferait
 * trainer la feuille derriere le doigt.
 *
 * @param {number[]} [snaps] hauteurs visibles ; un nombre < 1 vaut une
 *   fraction de la hauteur disponible
 */
export function Sheet({
  snaps,
  index = 0,
  onIndex,
  onClose,
  header,
  footer,
  children,
  className,
}) {
  const ref = useRef(null);
  const [box, setBox] = useState(0); // hauteur du conteneur
  const [height, setHeight] = useState(0); // hauteur de la feuille
  const [offset, setOffset] = useState(null); // translation courante, en px
  const [dragging, setDragging] = useState(false);

  const permanent = Array.isArray(snaps) && snaps.length > 0;

  // Les paliers se calculent une fois la hauteur du conteneur connue. Ils
  // sont memorises : ils entrent dans les dependances des gestes.
  const steps = useMemo(
    () => (permanent ? snaps.map((s) => (s <= 1 ? Math.round(box * s) : s)) : []),
    [box, permanent, snaps],
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el?.parentElement) return;

    function measure() {
      setBox(el.parentElement.clientHeight);
      setHeight(permanent ? 0 : el.offsetHeight);
    }
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el.parentElement);
    observer.observe(el);
    return () => observer.disconnect();
  }, [permanent]);

  const full = permanent ? (steps.length ? Math.max(...steps) : 0) : height;
  const visible = permanent ? (steps[index] ?? steps[0] ?? 0) : full;

  // Position de repos : la feuille descend de ce qui doit rester cache.
  const resting = Math.max(0, full - visible);

  // A la premiere image, la feuille est entierement basse : sans cela elle
  // apparaitrait deja en place, sans montee.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!full) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [full]);

  const translate = !entered ? full : (offset ?? resting);

  const drag = useRef(null);

  const onPointerDown = useCallback(
    (event) => {
      if (event.target.closest("button")) return;
      drag.current = { y: event.clientY, from: resting };
      setDragging(true);
      setOffset(resting);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [resting],
  );

  const onPointerMove = useCallback(
    (event) => {
      const start = drag.current;
      if (!start) return;

      let next = start.from + (event.clientY - start.y);
      // Caoutchouc en butee haute, et en butee basse quand la feuille ne se
      // ferme pas : le geste garde une reponse sans franchir la limite.
      const min = 0;
      const max = permanent ? full - (steps[0] ?? 0) : full;
      if (next < min) next = min + (next - min) * 0.25;
      if (next > max && permanent) next = max + (next - max) * 0.25;
      setOffset(next);
    },
    [full, permanent, steps],
  );

  const onPointerUp = useCallback(() => {
    const start = drag.current;
    drag.current = null;
    setDragging(false);
    if (!start) return;

    const current = full - (offset ?? resting);

    if (permanent) {
      // On s'arrete au palier le plus proche de la hauteur atteinte.
      let best = 0;
      steps.forEach((step, i) => {
        if (Math.abs(step - current) < Math.abs(steps[best] - current)) best = i;
      });
      setOffset(null);
      if (best !== index) onIndex?.(best);
      return;
    }

    if (current < full * 0.65) {
      onClose?.();
      return;
    }
    setOffset(null);
  }, [full, index, offset, onClose, onIndex, permanent, resting, steps]);

  return (
    <div
      ref={ref}
      style={{
        transform: `translateY(${translate}px)`,
        height: permanent && full ? `${full}px` : undefined,
        maxHeight: permanent ? undefined : "84%",
      }}
      className={cn(
        "bg-sheet absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-[20px] border-t",
        !dragging && "sheet-settled",
        className,
      )}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex-none touch-none"
      >
        <div className="flex justify-center pt-[9px] pb-[3px]">
          <span className="h-1 w-[34px] rounded-full bg-tint/16" aria-hidden />
        </div>
        {header && (
          <div className="flex items-center gap-3 px-5 pt-1.5 pb-4">{header}</div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>

      {footer && (
        <div className="bg-sheet flex flex-none flex-col gap-0.5 border-t px-5 pt-3 pb-[30px]">
          {footer}
        </div>
      )}
    </div>
  );
}

/** Voile : il ferme la feuille qu'il assombrit. */
export function Scrim({ onClick }) {
  return (
    <button
      type="button"
      aria-label="Fermer"
      onClick={onClick}
      className="absolute inset-0 z-30 cursor-default bg-black/40"
    />
  );
}
