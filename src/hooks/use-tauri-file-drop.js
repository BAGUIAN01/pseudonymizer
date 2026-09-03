"use client";

import { useEffect } from "react";

import { isTauri } from "@/lib/backend";

/**
 * Sous Tauri, le glisser-deposer HTML5 ne fournit pas le chemin du fichier :
 * la webview intercepte l'evenement et expose les chemins via son propre
 * canal. Ce hook s'y abonne et transmet le premier chemin depose.
 *
 * Hors Tauri il ne fait rien, le glisser-deposer HTML5 des zones de depot
 * suffisant dans un navigateur.
 */
export function useTauriFileDrop(onPaths) {
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten;
    let cancelled = false;

    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "drop" && event.payload.paths?.length) {
            onPaths(event.payload.paths);
          }
        }),
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // La webview n'expose pas l'evenement : on reste sur le depot HTML5.
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onPaths]);
}
