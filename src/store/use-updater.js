"use client";

import { create } from "zustand";
import { toast } from "sonner";

import { isTauri } from "@/lib/backend";

/**
 * Mise a jour de l'application.
 *
 * Le manifeste et les installeurs sont servis par le bucket, mais c'est la
 * signature qui fait foi : l'application refuse tout paquet qui ne correspond
 * pas a sa cle publique. Un bucket compromis ne peut donc pas livrer un
 * installeur substitue — ce qui compte pour un outil qui manipule des donnees
 * personnelles.
 */
export const useUpdater = create((set, get) => ({
  // idle | checking | available | downloading | ready | error
  status: "idle",
  version: null,
  notes: null,
  progress: 0,
  update: null,

  /**
   * Interroge le manifeste.
   *
   * @param {boolean} silencieux vrai au demarrage : on ne derange pas
   *   l'utilisateur si le bucket est injoignable ou deja a jour.
   */
  async check(silencieux = false) {
    if (!isTauri() || get().status === "downloading") return;

    set({ status: "checking" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();

      if (!update) {
        set({ status: "idle", update: null });
        if (!silencieux) toast("L’application est à jour");
        return;
      }

      set({
        status: "available",
        version: update.version,
        notes: update.body || null,
        update,
      });
    } catch (err) {
      set({ status: "error", update: null });
      // Une machine hors ligne ne doit pas etre alertee a chaque demarrage.
      if (!silencieux) {
        toast.error(`Vérification impossible : ${err.message ?? err}`);
      }
    }
  },

  /** Telecharge et installe, puis redemarre l'application. */
  async install() {
    const { update } = get();
    if (!update) return;

    set({ status: "downloading", progress: 0 });
    try {
      let recus = 0;
      let total = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          recus += event.data.chunkLength ?? 0;
          // Sans taille annoncee, la barre resterait a zero : on affiche
          // alors une progression indeterminee plutot qu'un faux zero.
          set({ progress: total ? Math.min(99, (recus / total) * 100) : 50 });
        } else if (event.event === "Finished") {
          set({ progress: 100 });
        }
      });

      set({ status: "ready" });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      set({ status: "error" });
      toast.error(`Mise à jour interrompue : ${err.message ?? err}`);
    }
  },

  /** Ecarte la proposition jusqu'au prochain demarrage. */
  dismiss() {
    set({ status: "idle", update: null });
  },
}));
