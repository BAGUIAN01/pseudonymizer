"use client";

import { cn } from "@/lib/utils";
import { useAnonymizer } from "@/store/use-anonymizer";
import { TabHeader } from "./chrome";
import { FileIcon, GridIcon } from "./icons";

/**
 * Racine d'un mode : deux depots, et rien d'autre.
 *
 * L'ecran d'accueil du bureau expliquait, proposait un exemple, rappelait le
 * projet actif et listait les documents recents. Au doigt, l'ecran ne demande
 * plus que deux choses, chacune sur la moitie de la hauteur.
 *
 * Les zones courent jusqu'au bas de l'ecran et glissent sous la barre
 * d'onglets : c'est ce qui donne au verre quelque chose a flouter. Leur
 * contenu est decale de la hauteur des couches flottantes, sans quoi il se
 * lirait a travers elles.
 */
export function ModeScreen() {
  const mode = useAnonymizer((s) => s.mode);
  const document = useAnonymizer((s) => s.document);
  const registry = useAnonymizer((s) => s.registry);
  const openDocument = useAnonymizer((s) => s.openDocument);
  const openRegistry = useAnonymizer((s) => s.openRegistry);
  const confirmStage = useAnonymizer((s) => s.confirmStage);

  const pseudo = mode === "pseudo";
  const pret = Boolean(document) && (pseudo || Boolean(registry));

  return (
    <>
      <TabHeader
        title={pseudo ? "Le document à pseudonymiser" : "Le document à restaurer"}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-6">
        <Zone
          label="Le document"
          value={document?.fileName}
          hint="PDF · DOCX · XLSX · TXT"
          Icon={FileIcon}
          onClick={openDocument}
        />
        <Zone
          label="Les correspondances"
          value={registry?.fileName}
          hint={pseudo ? "Facultatif · .xlsx" : "Requis · .xlsx"}
          hintAccent={!pseudo}
          Icon={GridIcon}
          onClick={openRegistry}
          // Sous le bouton de validation, puis sous les onglets.
          style={{ paddingBottom: document ? 156 : 90 }}
        />
      </div>

      {document && (
        <div className="absolute inset-x-5 bottom-[calc(env(safe-area-inset-bottom,0px)+100px)] z-29">
          <button
            type="button"
            onClick={confirmStage}
            disabled={!pret}
            className="bg-primary text-primary-foreground w-full cursor-pointer rounded-xl px-4 py-4 text-[14px] font-bold disabled:cursor-default disabled:opacity-35"
          >
            {pseudo
              ? "Continuer vers la sélection"
              : "Continuer vers la restauration"}
          </button>
        </div>
      )}
    </>
  );
}

function Zone({ label, value, hint, hintAccent, Icon, onClick, style }) {
  const charge = Boolean(value);

  return (
    <button
      type="button"
      onClick={onClick}
      data-loaded={charge}
      style={style}
      className="zone flex flex-1 cursor-pointer flex-col items-center justify-center gap-[7px] rounded-[22px] p-[22px] text-center"
    >
      {charge ? (
        <>
          <span className="font-mono text-[9.5px] tracking-[0.16em] text-faint uppercase">
            {label}
          </span>
          <span className="max-w-full text-[17px] font-semibold break-words text-strong">
            {value}
          </span>
          <span className="text-accent-strong text-[12.5px] font-semibold">
            Remplacer
          </span>
        </>
      ) : (
        <>
          <span className="mb-0.5 text-faint opacity-55">
            <Icon />
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-strong">
            {label}
          </span>
          <span
            className={cn(
              "text-[12.5px]",
              hintAccent ? "text-accent-strong" : "text-faint",
            )}
          >
            {hint}
          </span>
        </>
      )}
    </button>
  );
}
