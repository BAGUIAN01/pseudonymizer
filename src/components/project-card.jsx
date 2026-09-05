"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAnonymizer } from "@/store/use-anonymizer";

/**
 * Carte de projet, en pied de barre laterale.
 *
 * Un projet retient les correspondances etablies : sans lui, tout le travail
 * de selection disparait a la fermeture, et une de-pseudonymisation exige de
 * retrouver le fichier de registre. Avec lui, les paires sont deja la.
 */
export function ProjectCard() {
  const projects = useAnonymizer((s) => s.projects);
  const activeProjectId = useAnonymizer((s) => s.activeProjectId);
  const loadProjects = useAnonymizer((s) => s.loadProjects);

  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const active = projects.find((p) => p.id === activeProjectId) ?? null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div
        data-tour="projet"
        className="bg-paper flex flex-col gap-1.5 rounded-2xl border p-1.5 shadow-[var(--shadow-panel)]"
      >
        {/*
          Le projet actif se lit au-dessus du bouton, qui reste toujours en
          place : c'est le point d'entree unique pour changer de projet comme
          pour en creer un.
        */}
        {active && (
          <div className="flex flex-col gap-0.5 px-2.5 pt-2 pb-1">
            <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
              Projet actif
            </span>
            <span className="truncate text-[13px] font-semibold text-foreground">
              {active.name}
            </span>
            <span className="text-accent-strong font-mono text-[10px] font-semibold">
              {active.terms.length} correspondance
              {active.terms.length > 1 ? "s" : ""} en mémoire
            </span>
            {!!active.documents?.length && (
              <span className="text-muted-foreground font-mono text-[9.5px]">
                {active.documents.length} document
                {active.documents.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        <Dialog.Trigger className="bg-primary text-primary-foreground hover:bg-primary/90 w-full cursor-pointer rounded-xl px-3.5 py-3 text-[12.5px] font-bold transition-colors">
          {projects.length ? "Choisir un projet" : "Créer un projet"}
        </Dialog.Trigger>
      </div>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[440px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border border-tint/10 bg-surface p-5 shadow-[var(--shadow-dialog)]">
          <div className="flex flex-col gap-1">
            <Dialog.Title className="text-[15px] font-semibold text-strong">
              Projets
            </Dialog.Title>
            <Dialog.Description className="text-muted-foreground text-[12px] leading-[1.5]">
              Un projet conserve les correspondances entre données réelles et
              pseudonymes. Il rend la restauration possible sans recharger de
              registre.
            </Dialog.Description>
          </div>

          <ProjectList onChosen={() => setOpen(false)} />
          <ProjectDocuments onChosen={() => setOpen(false)} />
          <NewProject />
          <RevoirGuide onLance={() => setOpen(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ProjectList({ onChosen }) {
  const projects = useAnonymizer((s) => s.projects);
  const activeProjectId = useAnonymizer((s) => s.activeProjectId);
  const selectProject = useAnonymizer((s) => s.selectProject);
  const deleteProject = useAnonymizer((s) => s.deleteProject);

  if (!projects.length) {
    return (
      <p className="rounded-lg border border-dashed border-tint/12 px-4 py-6 text-center text-[12px] text-faint">
        Aucun projet pour l’instant.
      </p>
    );
  }

  return (
    <div className="flex max-h-[260px] flex-col overflow-auto rounded-lg border">
      {projects.map((project) => {
        const active = project.id === activeProjectId;
        return (
          <div
            key={project.id}
            className={cn(
              "flex items-center gap-2 border-b px-3 py-2.5 last:border-b-0 transition-colors",
              active ? "bg-tint/6" : "hover:bg-tint/3",
            )}
          >
            <button
              type="button"
              onClick={() => {
                selectProject(project.id);
                onChosen();
              }}
              className="flex min-w-0 flex-1 cursor-pointer flex-col text-left"
            >
              <span className="truncate text-[12.5px] font-semibold text-foreground">
                {project.name}
              </span>
              <span className="text-muted-foreground font-mono text-[10px]">
                {project.terms.length} correspondance
                {project.terms.length > 1 ? "s" : ""}
                {project.documents?.length
                  ? ` · ${project.documents.length} document${project.documents.length > 1 ? "s" : ""}`
                  : ""}
              </span>
            </button>

            {active && (
              <span className="text-accent-strong flex-none font-mono text-[9.5px] tracking-[0.12em] uppercase">
                Actif
              </span>
            )}

            <button
              type="button"
              onClick={() => deleteProject(project.id)}
              aria-label={`Supprimer ${project.name}`}
              className="hover:text-destructive flex-none cursor-pointer text-[15px] leading-none text-faint transition-colors"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Documents conserves dans le projet actif.
 *
 * Choisir un projet rouvre le dernier ; cette liste sert a revenir sur les
 * precedents sans avoir a retrouver les fichiers sur le disque.
 */
function ProjectDocuments({ onChosen }) {
  const projects = useAnonymizer((s) => s.projects);
  const activeProjectId = useAnonymizer((s) => s.activeProjectId);
  const openStoredDocument = useAnonymizer((s) => s.openStoredDocument);

  const active = projects.find((p) => p.id === activeProjectId);
  const documents = active?.documents ?? [];
  if (documents.length < 2) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
        Documents du projet
      </span>
      <div className="flex max-h-[160px] flex-col overflow-auto rounded-lg border">
        {documents.map((document) => (
          <button
            key={document.path || document.fileName}
            type="button"
            onClick={() => {
              openStoredDocument(document);
              onChosen();
            }}
            className="cursor-pointer truncate border-b px-3 py-2 text-left text-[12px] text-foreground transition-colors last:border-b-0 hover:bg-tint/4"
          >
            {document.fileName}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Rejoue la visite guidee du premier lancement. */
function RevoirGuide({ onLance }) {
  const setOnboardingDone = useAnonymizer((s) => s.setOnboardingDone);

  return (
    <button
      type="button"
      onClick={() => {
        setOnboardingDone(false);
        onLance();
      }}
      className="hover:text-foreground cursor-pointer self-start font-mono text-[10px] text-dim transition-colors"
    >
      Revoir le guide de démarrage
    </button>
  );
}

function NewProject() {
  const createProject = useAnonymizer((s) => s.createProject);
  const [name, setName] = useState("");

  async function submit() {
    const label = name.trim();
    if (!label) return;
    await createProject(label);
    setName("");
  }

  return (
    <div className="flex gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Nom du nouveau projet…"
        aria-label="Nom du nouveau projet"
        className="h-9 flex-1 rounded-md border-0 bg-tint/6 px-2.5 text-[12px] text-foreground focus-visible:bg-tint/10 focus-visible:ring-0"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!name.trim()}
        className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer rounded-md px-3.5 text-[12px] font-bold transition-colors disabled:cursor-default disabled:opacity-40"
      >
        Créer
      </button>
    </div>
  );
}
