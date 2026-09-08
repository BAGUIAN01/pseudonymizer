"use client";

import { useState } from "react";

import { useAnonymizer } from "@/store/use-anonymizer";
import { NavBar } from "./chrome";
import { ModeScreen } from "./mode-screen";
import { ProjectScreen } from "./project-screen";
import { Workspace } from "./workspace";

/**
 * Fenetre tactile.
 *
 * Trois onglets : les deux modes, et le projet. Ils ne sont pas un etat de
 * plus — le mode vit deja dans le store, et l'espace de travail s'ouvre a la
 * meme condition qu'au bureau (`isReady`). Seul l'onglet du projet est local
 * a cette vue.
 *
 * L'espace de travail prend l'ecran entier : la barre s'en va avec lui, comme
 * un ecran pousse sur une pile.
 *
 * `overflow-clip` et non `overflow-hidden` : une feuille est plus haute que
 * l'ecran et remontee par une translation, or le navigateur calcule la mise
 * au point sur la position de mise en page, que la translation ne deplace
 * pas. Avec `hidden`, appuyer un bouton du bas d'une feuille faisait defiler
 * le conteneur pour « reveler » ce bouton, et l'ecran entier remontait.
 * Un conteneur clippe n'est pas defilable : la question ne se pose plus.
 */
export function MobileApp() {
  const isReady = useAnonymizer((s) => s.isReady());
  const [tab, setTab] = useState("mode");

  return (
    <main className="bg-paper relative h-full overflow-clip">
      {isReady ? (
        <Workspace />
      ) : (
        <div className="flex h-full flex-col">
          {tab === "project" ? <ProjectScreen /> : <ModeScreen />}
        </div>
      )}

      {!isReady && <NavBar tab={tab} onTab={setTab} />}
    </main>
  );
}
