"use client";

import { useEffect, useState } from "react";

/**
 * Vrai sur un ecran de telephone.
 *
 * La largeur n'existe pas au rendu serveur : le crochet renvoie `null` tant
 * qu'il n'a pas mesure, et l'appelant n'affiche rien pendant ce temps. Rendre
 * la disposition de bureau par defaut produirait une image fausse le temps
 * d'une image sur un telephone.
 */
// Le meme seuil que `md` dans Tailwind : les deux doivent dire la meme chose.
const QUERY = "(max-width: 767.98px)";

export function useIsMobile() {
  const [matches, setMatches] = useState(null);

  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return matches;
}
