"use client";

import { useSyncExternalStore } from "react";

import { isTauri } from "@/lib/backend";

// La valeur ne change jamais au cours d'une session : rien a souscrire.
const subscribe = () => () => {};
const serverSnapshot = () => false;

/**
 * Indique si l'application tourne dans la fenetre Tauri.
 *
 * La detection lit `window`, absent au prerendu : la lire pendant le rendu
 * provoquerait une divergence d'hydratation. `useSyncExternalStore` fournit
 * `false` au serveur puis la valeur reelle au client, sans effet de bord.
 */
export function useIsTauri() {
  return useSyncExternalStore(subscribe, isTauri, serverSnapshot);
}
