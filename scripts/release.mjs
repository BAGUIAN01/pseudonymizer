#!/usr/bin/env node
/**
 * Publie une nouvelle version, d'un seul geste.
 *
 *   npm run release                      -- correctif (0.1.0 -> 0.1.1)
 *   npm run release -- --minor           -- 0.1.0 -> 0.2.0
 *   npm run release -- --major           -- 0.1.0 -> 1.0.0
 *   npm run release -- --version 1.4.0   -- version imposee
 *   npm run release -- --notes "…"       -- texte affiche a l'utilisateur
 *   npm run release -- --dry-run         -- tout sauf le televersement
 *
 * La version de depart est celle publiee sur le bucket, pas celle du dossier :
 * c'est la seule qui dise ce que les postes installes connaissent deja. Si le
 * dossier est en avance — une version construite mais jamais publiee — c'est
 * elle qui sert de reference.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import process from "node:process";

import {
  RACINE,
  SORTIE_NSIS,
  comparerVersions,
  construireManifeste,
  incrementer,
  lireEnv,
  publier,
  versionPubliee,
} from "./lib/r2.mjs";

const CLE_PRIVEE =
  process.env.TAURI_SIGNING_PRIVATE_KEY_PATH ??
  join(homedir(), ".tauri", "anonymizer-updater.key");

function options() {
  const args = process.argv.slice(2);
  const valeur = (nom) => {
    const i = args.indexOf(nom);
    return i >= 0 ? args[i + 1] : undefined;
  };
  // Selon le terminal, `npm run release -- --notes "..."` peut perdre le
  // drapeau en route. Le texte restant, hors options connues, fait alors
  // office de notes.
  const connues = new Set(["--dry-run", "--major", "--minor"]);
  const restant = args.filter((a, i) => {
    if (connues.has(a)) return false;
    if (a === "--notes" || a === "--version") return false;
    const precedent = args[i - 1];
    return precedent !== "--notes" && precedent !== "--version";
  });

  return {
    simulation: args.includes("--dry-run"),
    niveau: args.includes("--major")
      ? "major"
      : args.includes("--minor")
        ? "minor"
        : "patch",
    imposee: valeur("--version"),
    notes: valeur("--notes") ?? restant.join(" ").trim(),
  };
}

/** Ecrit la version dans les deux fichiers qui la portent. */
async function ecrireVersion(version) {
  const confChemin = join(RACINE, "src-tauri/tauri.conf.json");
  const conf = JSON.parse(await readFile(confChemin, "utf8"));
  conf.version = version;
  await writeFile(confChemin, JSON.stringify(conf, null, 2) + "\n");

  const pkgChemin = join(RACINE, "package.json");
  const pkg = JSON.parse(await readFile(pkgChemin, "utf8"));
  pkg.version = version;
  await writeFile(pkgChemin, JSON.stringify(pkg, null, 2) + "\n");

  // `Cargo.toml` porte la version du binaire : la laisser diverger rendrait
  // les proprietes du fichier .exe trompeuses.
  const cargoChemin = join(RACINE, "src-tauri/Cargo.toml");
  const cargo = await readFile(cargoChemin, "utf8");
  await writeFile(
    cargoChemin,
    cargo.replace(/^version = "[^"]*"$/m, `version = "${version}"`),
  );
}

/**
 * Complete le PATH avec le dossier de cargo s'il en est absent.
 *
 * Une fenetre ouverte avant l'installation de rustup porte un PATH fige, et
 * `tauri build` echoue alors sur « cargo metadata : program not found » — sans
 * rapport apparent avec la publication.
 */
function cheminAvecCargo() {
  const dossier = join(homedir(), ".cargo", "bin");
  if (!existsSync(dossier)) return process.env.PATH;
  const chemins = (process.env.PATH ?? "").split(delimiter);
  return chemins.includes(dossier)
    ? process.env.PATH
    : [dossier, ...chemins].join(delimiter);
}

function executer(commande, args, env) {
  return new Promise((resolve, reject) => {
    const processus = spawn(commande, args, {
      cwd: RACINE,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...env },
    });
    processus.on("error", reject);
    processus.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`\`${commande} ${args.join(" ")}\` a échoué (code ${code})`)),
    );
  });
}

async function main() {
  const { simulation, niveau, imposee, notes } = options();
  const env = await lireEnv();

  // 1. Determiner la prochaine version.
  const publiee = await versionPubliee(env);
  const conf = JSON.parse(
    await readFile(join(RACINE, "src-tauri/tauri.conf.json"), "utf8"),
  );
  const locale = conf.version;

  const reference =
    publiee && comparerVersions(publiee, locale) >= 0 ? publiee : locale;
  const version = imposee ?? incrementer(reference, niveau);

  if (publiee && comparerVersions(version, publiee) <= 0) {
    throw new Error(
      `La version ${version} n'est pas supérieure à ${publiee}, déjà publiée. ` +
        "Aucun poste ne la proposerait.",
    );
  }

  console.log(`Version publiée sur le bucket : ${publiee ?? "aucune"}`);
  console.log(`Version du dossier            : ${locale}`);
  console.log(`Nouvelle version              : ${version}\n`);

  // 2. Verifier la cle avant de construire : dix minutes de compilation pour
  //    decouvrir ensuite qu'il manque la signature serait inutilement long.
  const clePrivee = await readFile(CLE_PRIVEE, "utf8").catch(() => {
    throw new Error(
      `Clé privée introuvable : ${CLE_PRIVEE}\n` +
        "Définissez TAURI_SIGNING_PRIVATE_KEY_PATH, ou générez-en une avec " +
        "`npx tauri signer generate`.",
    );
  });

  await ecrireVersion(version);
  console.log(`Version inscrite dans tauri.conf.json, package.json et Cargo.toml.\n`);

  // 3. Construire en signant.
  console.log("Construction…\n");
  await executer("npm", ["run", "tauri", "build"], {
    TAURI_SIGNING_PRIVATE_KEY: clePrivee.trim(),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD:
      process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "",
    PATH: cheminAvecCargo(),
  });

  // 4. Retrouver l'installeur produit.
  const fichiers = await readdir(SORTIE_NSIS).catch(() => []);
  const installeur = fichiers.find(
    (f) => f.includes(version) && f.endsWith("-setup.exe"),
  );
  if (!installeur) {
    throw new Error(`Aucun installeur en version ${version} dans ${SORTIE_NSIS}`);
  }

  const manifeste = await construireManifeste({
    env,
    version,
    installeur,
    notes,
  });

  if (simulation) {
    console.log("\nSimulation — rien n'a été envoyé.\n");
    console.log(JSON.stringify(manifeste, null, 2));
    return;
  }

  // 5. Publier.
  console.log("\nPublication…");
  const url = await publier({ env, version, installeur, manifeste });

  await writeFile(
    join(SORTIE_NSIS, "latest.json"),
    JSON.stringify(manifeste, null, 2) + "\n",
  );

  console.log(`\nVersion ${version} publiée.`);
  console.log(`Manifeste : ${url}`);
  console.log(
    "Les postes installés la proposeront à leur prochain démarrage.",
  );
}

main().catch((err) => {
  console.error(`\nÉchec : ${err.message}`);
  process.exit(1);
});
