"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAnonymizer } from "@/store/use-anonymizer";
import { TabHeader } from "./chrome";

/** Initiales du projet, pour la pastille d'identite. */
function initials(name) {
  return name
    .split(/\s+/)
    .filter((w) => /[\p{L}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/**
 * Troisieme onglet : le projet, et rien qui appartienne a un flux.
 *
 * Le projet actif est un bloc, de la meme matiere que les deux depots des
 * onglets 01 et 02 — les trois onglets parlent la meme langue. Les autres
 * projets se reduisent a leur nom et a leur compte.
 */
export function ProjectScreen() {
  const projects = useAnonymizer((s) => s.projects);
  const activeProjectId = useAnonymizer((s) => s.activeProjectId);
  const loadProjects = useAnonymizer((s) => s.loadProjects);
  const selectProject = useAnonymizer((s) => s.selectProject);
  const createProject = useAnonymizer((s) => s.createProject);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const active = projects.find((p) => p.id === activeProjectId) ?? null;
  const others = projects.filter((p) => p.id !== activeProjectId);

  async function submit() {
    const label = name.trim();
    if (!label) return;
    await createProject(label);
    setName("");
    setCreating(false);
  }

  return (
    <>
      <TabHeader title="Projet" />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+110px)]">
        {active ? (
          <div className="zone flex w-full items-center gap-3.5 rounded-[22px] p-4 text-left">
            <span className="bg-primary text-primary-foreground flex size-12 flex-none items-center justify-center rounded-2xl font-mono text-[15px] font-bold tracking-[0.03em]">
              {initials(active.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold tracking-[-0.02em] break-words text-strong">
                {active.name}
              </span>
              <span className="mt-[3px] block text-[12.5px] text-faint">
                {active.terms.length} paire{active.terms.length > 1 ? "s" : ""}
                {active.documents?.length
                  ? ` · ${active.documents.length} document${active.documents.length > 1 ? "s" : ""}`
                  : ""}
              </span>
            </span>
          </div>
        ) : (
          <p className="text-[13px] leading-[1.6] text-dim">
            Un projet retient les paires établies. Il rend la restauration
            possible sans avoir à retrouver le fichier de registre.
          </p>
        )}

        {others.length > 0 && (
          <div className="mt-6">
            <span className="block pb-2 font-mono text-[9.5px] tracking-[0.16em] text-faint uppercase">
              Autres projets
            </span>
            <div className="flex flex-col border-t">
              {others.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProject(p.id)}
                  className="flex min-h-12 w-full cursor-pointer items-baseline gap-3 border-b py-3.5 text-left"
                >
                  <span className="min-w-0 flex-1 text-[14px] font-semibold break-words text-strong">
                    {p.name}
                  </span>
                  <span className="font-mono text-[10px] whitespace-nowrap text-faint">
                    {p.terms.length} paire{p.terms.length > 1 ? "s" : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {creating ? (
          <div className="mt-4 flex gap-3">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Nom du projet"
              aria-label="Nom du projet"
              className="bg-paper h-11 flex-1 rounded-xl border px-3 text-[13px]"
            />
            <button
              type="button"
              onClick={submit}
              className="text-accent-strong cursor-pointer px-1 font-mono text-[9.5px] font-semibold tracking-[0.16em] uppercase"
            >
              Créer
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={cn(
              "w-full cursor-pointer py-4 text-center text-[13px] font-semibold text-dim",
              others.length ? "mt-1" : "mt-4",
            )}
          >
            Nouveau projet
          </button>
        )}

        <p className="mt-auto pt-8 text-center text-[11.5px] leading-[1.6] text-dim">
          Traitement local — le document, le registre et les projets restent sur
          l’appareil.
        </p>
      </div>
    </>
  );
}
