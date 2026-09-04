/**
 * Acces au bucket R2 : lecture de la configuration, televersement signe.
 *
 * La signature S3 est ecrite a la main plutot que de tirer le SDK AWS —
 * plusieurs mega-octets de dependances pour deux requetes PUT.
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

export const RACINE = resolve(import.meta.dirname, "..", "..");
export const SORTIE_NSIS = join(
  RACINE,
  "src-tauri/target/release/bundle/nsis",
);

/** Lit `.env` sans dependance : le fichier n'est jamais commite. */
export async function lireEnv() {
  const brut = await readFile(join(RACINE, ".env"), "utf8").catch(() => {
    throw new Error(
      "`.env` introuvable. Il doit porter R2_ACCOUNT_ID, R2_BUCKET_NAME, " +
        "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY et R2_PUBLIC_URL.",
    );
  });

  const env = {};
  for (const ligne of brut.split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }

  const manquants = [
    "R2_ACCOUNT_ID",
    "R2_BUCKET_NAME",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_PUBLIC_URL",
  ].filter((k) => !env[k]);
  if (manquants.length) {
    throw new Error(`Clés absentes de .env : ${manquants.join(", ")}`);
  }
  return env;
}

export function basePublique(env) {
  return env.R2_PUBLIC_URL.replace(/\/$/, "");
}

/** Televerse un objet dans le bucket et renvoie son adresse publique. */
export async function televerser({ env, cle, corps, type }) {
  const hote = `${env.R2_BUCKET_NAME}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  const sha = (data) => createHash("sha256").update(data).digest("hex");
  const hmac = async (key, data) => {
    const k = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return new Uint8Array(
      await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)),
    );
  };

  const horodatage = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const jour = horodatage.slice(0, 8);
  const empreinte = sha(corps);

  const enTetes = [
    `host:${hote}`,
    `x-amz-content-sha256:${empreinte}`,
    `x-amz-date:${horodatage}`,
  ].join("\n");
  const signes = "host;x-amz-content-sha256;x-amz-date";

  const requeteCanonique = [
    "PUT",
    `/${cle}`,
    "",
    enTetes,
    "",
    signes,
    empreinte,
  ].join("\n");

  const portee = `${jour}/auto/s3/aws4_request`;
  const aSigner = [
    "AWS4-HMAC-SHA256",
    horodatage,
    portee,
    sha(requeteCanonique),
  ].join("\n");

  let cleSignature = new TextEncoder().encode(`AWS4${env.R2_SECRET_ACCESS_KEY}`);
  for (const part of [jour, "auto", "s3", "aws4_request"]) {
    cleSignature = await hmac(cleSignature, part);
  }
  const signature = Buffer.from(await hmac(cleSignature, aSigner)).toString(
    "hex",
  );

  const reponse = await fetch(`https://${hote}/${cle}`, {
    method: "PUT",
    headers: {
      Host: hote,
      "x-amz-date": horodatage,
      "x-amz-content-sha256": empreinte,
      "Content-Type": type,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${portee}, ` +
        `SignedHeaders=${signes}, Signature=${signature}`,
    },
    body: corps,
  });

  if (!reponse.ok) {
    throw new Error(
      `Téléversement de ${cle} refusé : ${reponse.status} ${await reponse.text()}`,
    );
  }
  return `${basePublique(env)}/${cle}`;
}

/**
 * Version actuellement publiee, lue depuis le manifeste du bucket.
 * Renvoie `null` si aucune version n'a encore ete publiee.
 */
export async function versionPubliee(env) {
  const url = `${basePublique(env)}/updates/latest.json?t=${Date.now()}`;
  try {
    const reponse = await fetch(url, { cache: "no-store" });
    if (reponse.status === 404) return null;
    if (!reponse.ok) {
      throw new Error(`${reponse.status} ${reponse.statusText}`);
    }
    const manifeste = await reponse.json();
    return manifeste.version ?? null;
  } catch (err) {
    throw new Error(
      `Manifeste illisible sur le bucket (${err.message}). ` +
        "Vérifiez que le bucket est public en lecture.",
    );
  }
}

/** Compare deux versions semver. Renvoie 1, 0 ou -1. */
export function comparerVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

/** Incremente une version selon le niveau demande. */
export function incrementer(version, niveau = "patch") {
  const [majeur, mineur, correctif] = String(version).split(".").map(Number);
  if (niveau === "major") return `${majeur + 1}.0.0`;
  if (niveau === "minor") return `${majeur}.${mineur + 1}.0`;
  return `${majeur}.${mineur}.${correctif + 1}`;
}

/**
 * Construit le manifeste de mise a jour a partir d'un installeur signe.
 */
export async function construireManifeste({ env, version, installeur, notes }) {
  const signature = await readFile(
    join(SORTIE_NSIS, `${installeur}.sig`),
    "utf8",
  ).catch(() => {
    throw new Error(
      `${installeur}.sig manquant : la build n'a pas été signée. ` +
        "TAURI_SIGNING_PRIVATE_KEY doit être défini avant la construction.",
    );
  });

  return {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: signature.trim(),
        url: `${basePublique(env)}/updates/${installeur}`,
      },
    },
  };
}

/** Televerse l'installeur puis le manifeste, dans cet ordre. */
export async function publier({ env, version, installeur, manifeste }) {
  // L'installeur d'abord : un manifeste qui pointerait vers un fichier absent
  // casserait la mise a jour de tous les postes deja installes.
  process.stdout.write(`  installeur ${installeur}… `);
  await televerser({
    env,
    cle: `updates/${installeur}`,
    corps: await readFile(join(SORTIE_NSIS, installeur)),
    type: "application/octet-stream",
  });
  process.stdout.write("envoyé\n");

  process.stdout.write("  manifeste latest.json… ");
  const url = await televerser({
    env,
    cle: "updates/latest.json",
    corps: Buffer.from(JSON.stringify(manifeste, null, 2)),
    type: "application/json",
  });
  process.stdout.write("envoyé\n");
  return url;
}
