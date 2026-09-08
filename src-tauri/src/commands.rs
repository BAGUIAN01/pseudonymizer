//! Commandes natives exposees au frontend.
//!
//! La lecture des documents et des registres se fait cote JavaScript
//! (`src/lib/extract.js`) : pdf.js, mammoth et SheetJS suffisent, et le meme
//! code sert dans la webview et dans un navigateur.
//!
//! Le natif ne prend en charge que ce que JavaScript ne sait pas faire :
//! reecrire un document dans son format d'origine en preservant la mise en
//! page, ecrire a cote du fichier source, et ouvrir l'explorateur de fichiers.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::rewrite::{self, Replacement};

/// Une correspondance donnee personnelle -> pseudonyme.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Term {
  pub text: String,
  /// PERSONNE | ENTREPRISE | PROGRAMME | ADRESSE | EMAIL | TELEPHONE
  /// | IDENTIFIANT | MONTANT | DATE
  #[serde(rename = "type")]
  pub kind: String,
  pub pseudo: String,
  pub occurrences: usize,
}

/// Chemins des fichiers produits par un traitement.
#[derive(Debug, Serialize, Deserialize)]
pub struct Deliverables {
  pub document_path: String,
  pub registry_path: Option<String>,
}

/// Construit le chemin de sortie a cote du fichier source.
fn output_path(source: &Path, suffix: &str) -> Result<PathBuf, String> {
  let stem = source
    .file_stem()
    .and_then(|s| s.to_str())
    .ok_or_else(|| "Nom de fichier illisible".to_string())?;
  let extension = source
    .extension()
    .and_then(|s| s.to_str())
    .ok_or_else(|| "Le fichier source n'a pas d'extension".to_string())?;

  let parent = source.parent().unwrap_or_else(|| Path::new("."));
  Ok(parent.join(format!("{stem}{suffix}.{extension}")))
}

/// Un chemin encore libre, numerote si le fichier existe deja.
///
/// Traiter deux fois le meme document ne doit pas detruire le resultat
/// precedent — c'est deja la regle du telechargement. Sous Windows, c'est en
/// plus la seule facon d'aboutir : le fichier produit reste verrouille tant
/// qu'il est ouvert dans Word, un lecteur PDF ou Excel, et l'ecraser echoue
/// net (« le processus ne peut pas acceder au fichier », os error 32).
fn chemin_libre(target: PathBuf) -> PathBuf {
  if !target.exists() {
    return target;
  }

  let parent = target.parent().unwrap_or_else(|| Path::new(".")).to_path_buf();
  let stem = target
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("fichier")
    .to_string();
  let extension = target
    .extension()
    .and_then(|s| s.to_str())
    .unwrap_or_default()
    .to_string();

  for n in 2.. {
    let candidat = parent.join(if extension.is_empty() {
      format!("{stem} ({n})")
    } else {
      format!("{stem} ({n}).{extension}")
    });
    if !candidat.exists() {
      return candidat;
    }
  }
  target
}

/// Le fichier est-il tenu par quelqu'un d'autre ?
///
/// 32 : ERROR_SHARING_VIOLATION, ce que pose Word, Excel ou un lecteur PDF sur
/// un fichier ouvert. 33 : ERROR_LOCK_VIOLATION, qu'un antivirus ou une
/// synchronisation cloud peut poser le temps d'un scan.
fn verrouille(e: &std::io::Error) -> bool {
  matches!(e.raw_os_error(), Some(32) | Some(33))
}

/// Traduit l'echec d'une ecriture en quelque chose d'actionnable.
///
/// « os error 32 » ne dit pas quoi faire.
fn erreur_ecriture(target: &Path, e: &std::io::Error) -> String {
  let nom = target
    .file_name()
    .and_then(|s| s.to_str())
    .unwrap_or("Le fichier")
    .to_string();
  if verrouille(e) {
    return format!(
      "« {nom} » est ouvert dans une autre application. Fermez-le, puis relancez le traitement."
    );
  }
  format!("Ecriture impossible : {e}")
}

/// Ecrit un livrable, en contournant un fichier verrouille plutot qu'en
/// echouant.
///
/// Ecraser son propre resultat precedent est ce qu'on attend quand on ajuste
/// une correspondance et qu'on relance : numeroter a chaque essai laisserait
/// une trainee de fichiers. Mais sous Windows le fichier produit est verrouille
/// des qu'il est ouvert dans Word, Excel ou un lecteur PDF, et l'ecrasement
/// echoue net — tout le traitement etait alors perdu pour un classeur reste
/// ouvert dans un coin. On ecrit donc a cote, sous un nom numerote, et
/// l'interface annonce le nom retenu : le travail aboutit.
///
/// Ce repli ne peut pas se verifier ici : Linux ne pose pas de verrou
/// obligatoire, une ecriture par-dessus un fichier ouvert y reussit.
fn ecrire(target: PathBuf, bytes: &[u8]) -> Result<PathBuf, String> {
  match std::fs::write(&target, bytes) {
    Ok(()) => Ok(target),
    Err(e) if verrouille(&e) => {
      let libre = chemin_libre(target);
      std::fs::write(&libre, bytes).map_err(|err| erreur_ecriture(&libre, &err))?;
      Ok(libre)
    }
    Err(e) => Err(erreur_ecriture(&target, &e)),
  }
}

/// Applique les substitutions et reecrit le document dans son format d'origine.
///
/// Les expressions les plus longues sont traitees en premier : sans cela,
/// « Jean » consommerait le debut de « Jean Dupont » et le nom de famille
/// resterait en clair dans le document produit.
#[tauri::command]
pub async fn apply_pseudonymisation(
  source_path: String,
  terms: Vec<Term>,
  reverse: bool,
) -> Result<Deliverables, String> {
  let source = PathBuf::from(&source_path);
  if !source.is_file() {
    return Err(format!("Fichier introuvable : {source_path}"));
  }

  let extension = source
    .extension()
    .and_then(|s| s.to_str())
    .unwrap_or_default()
    .to_string();

  let mut replacements: Vec<Replacement> = terms
    .iter()
    .map(|t| {
      if reverse {
        Replacement { from: t.pseudo.clone(), to: t.text.clone() }
      } else {
        Replacement { from: t.text.clone(), to: t.pseudo.clone() }
      }
    })
    .filter(|r| !r.from.trim().is_empty())
    .collect();
  replacements.sort_by_key(|r| std::cmp::Reverse(r.from.chars().count()));

  let bytes = std::fs::read(&source).map_err(|e| format!("Lecture impossible : {e}"))?;
  let rewritten = rewrite::rewrite(&extension, &bytes, &replacements)?;

  let target = output_path(&source, if reverse { "_restaure" } else { "_pseudonymise" })?;
  let target = ecrire(target, &rewritten)?;

  Ok(Deliverables {
    document_path: target.to_string_lossy().into_owned(),
    registry_path: None,
  })
}

/// Ecrit un fichier a cote du document source.
///
/// Sert au registre de correspondances, produit en JavaScript par SheetJS :
/// inutile de reimplementer un ecrivain xlsx en Rust, mais le plugin `fs` ne
/// peut pas ecrire hors de `$DOCUMENT` et `$DOWNLOAD`, d'ou ce passage par le
/// natif.
#[tauri::command]
pub async fn write_beside(
  source_path: String,
  file_name: String,
  contents: Vec<u8>,
) -> Result<String, String> {
  // Un nom de fichier ne doit designer qu'un nom : sans cette garde, un
  // `..\..` ecrirait n'importe ou sur le disque.
  if file_name.contains(['/', '\\']) || file_name.contains("..") {
    return Err(format!("Nom de fichier invalide : {file_name}"));
  }

  let source = PathBuf::from(&source_path);
  let parent = source
    .parent()
    .ok_or_else(|| "Dossier de destination introuvable".to_string())?;

  let target = ecrire(parent.join(&file_name), &contents)?;
  Ok(target.to_string_lossy().into_owned())
}

/// Copie les fichiers produits vers un dossier choisi par l'utilisateur.
///
/// C'est l'equivalent d'un telechargement pour une application installee : les
/// livrables sont deja sur le disque, a cote du document source, et l'utilisateur
/// decide ou en deposer une copie.
///
/// Un fichier deja present a la destination n'est pas ecrase : un suffixe
/// numerique est ajoute. Traiter deux fois le meme document ne doit pas
/// detruire silencieusement le resultat precedent.
#[tauri::command]
pub async fn copy_to_dir(paths: Vec<String>, dir: String) -> Result<Vec<String>, String> {
  let destination = PathBuf::from(&dir);
  if !destination.is_dir() {
    return Err(format!("Dossier introuvable : {dir}"));
  }

  let mut written = Vec::new();
  for path in paths {
    let source = PathBuf::from(&path);
    let name = source
      .file_name()
      .ok_or_else(|| format!("Nom de fichier illisible : {path}"))?;

    let target = destination.join(name);

    // Le fichier produit se trouve deja a cote du document source. Choisir ce
    // meme dossier pour le telechargement ne doit pas en fabriquer une copie
    // numerotee : c'est le meme fichier.
    let meme_fichier = match (source.canonicalize(), target.canonicalize()) {
      (Ok(a), Ok(b)) => a == b,
      _ => false,
    };
    if meme_fichier {
      written.push(target.to_string_lossy().into_owned());
      continue;
    }

    let target = chemin_libre(target);
    std::fs::copy(&source, &target).map_err(|e| format!("Copie impossible : {e}"))?;
    written.push(target.to_string_lossy().into_owned());
  }
  Ok(written)
}

/* ------------------------------------------------------------------ */
/* Projets                                                             */
/* ------------------------------------------------------------------ */

/// Emplacement du fichier de projets, dans le dossier de donnees de
/// l'application.
///
/// Le stockage passe par un vrai fichier plutot que par le `localStorage` de
/// la webview : celui-ci disparait avec le cache du navigateur embarque, et il
/// contiendrait ici les correspondances entre donnees reelles et pseudonymes —
/// exactement ce qu'il ne faut pas perdre.
fn projects_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  use tauri::Manager;

  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("Dossier de donnees introuvable : {e}"))?;
  std::fs::create_dir_all(&dir).map_err(|e| format!("Dossier de donnees illisible : {e}"))?;
  Ok(dir.join("projets.json"))
}

/// Relit les projets enregistres. Renvoie une chaine vide a la premiere
/// ouverture, quand aucun fichier n'existe encore.
///
/// Le contenu n'est pas interprete ici : sa forme appartient au frontend, qui
/// est seul a s'en servir. Le natif ne fait que garder le fichier.
#[tauri::command]
pub async fn projects_load(app: tauri::AppHandle) -> Result<String, String> {
  let path = projects_file(&app)?;
  if !path.exists() {
    return Ok(String::new());
  }
  std::fs::read_to_string(&path).map_err(|e| format!("Projets illisibles : {e}"))
}

/// Enregistre les projets.
///
/// L'ecriture passe par un fichier temporaire renomme ensuite : une coupure en
/// pleine ecriture laisserait sinon un fichier tronque, et toutes les
/// correspondances seraient perdues.
#[tauri::command]
pub async fn projects_save(app: tauri::AppHandle, contents: String) -> Result<(), String> {
  let path = projects_file(&app)?;
  let temporary = path.with_extension("json.tmp");

  std::fs::write(&temporary, contents.as_bytes())
    .map_err(|e| format!("Enregistrement impossible : {e}"))?;
  std::fs::rename(&temporary, &path).map_err(|e| format!("Enregistrement impossible : {e}"))?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn terme() -> Term {
    Term {
      text: "Jean Dupont".into(),
      kind: "PERSONNE".into(),
      pseudo: "[PERSONNE_0001]".into(),
      occurrences: 1,
    }
  }

  #[test]
  fn ecrit_le_document_a_cote_de_la_source() {
    let dir = std::env::temp_dir().join("anonymizer_test_cmd");
    std::fs::create_dir_all(&dir).unwrap();
    let source = dir.join("convention.txt");
    std::fs::write(&source, "Signe par Jean Dupont.").unwrap();

    let out = tauri::async_runtime::block_on(apply_pseudonymisation(
      source.to_string_lossy().into_owned(),
      vec![terme()],
      false,
    ))
    .expect("le traitement doit reussir");

    let produit = PathBuf::from(&out.document_path);
    assert_eq!(produit.file_name().unwrap(), "convention_pseudonymise.txt");
    let contenu = std::fs::read_to_string(&produit).unwrap();
    assert_eq!(contenu, "Signe par [PERSONNE_0001].");

    std::fs::remove_dir_all(&dir).ok();
  }

  /// Relancer apres avoir ajuste une correspondance remplace le resultat :
  /// un fichier par essai ferait une trainee dans le dossier de l'utilisateur.
  #[test]
  fn relancer_remplace_le_resultat_precedent() {
    let dir = std::env::temp_dir().join("anonymizer_test_relance");
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).unwrap();
    let source = dir.join("convention.txt");
    std::fs::write(&source, "Signe par Jean Dupont.").unwrap();

    let un = tauri::async_runtime::block_on(apply_pseudonymisation(
      source.to_string_lossy().into_owned(),
      vec![terme()],
      false,
    ))
    .unwrap();
    let deux = tauri::async_runtime::block_on(apply_pseudonymisation(
      source.to_string_lossy().into_owned(),
      vec![terme()],
      false,
    ))
    .unwrap();

    assert_eq!(un.document_path, deux.document_path);
    assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 2, "un seul produit");

    std::fs::remove_dir_all(&dir).ok();
  }

  /// Le repli quand le fichier est verrouille : le verrou lui-meme n'existe
  /// pas sous Linux, mais le choix du nom, lui, se verifie partout.
  #[test]
  fn choisit_un_nom_libre_a_cote_du_fichier_pris() {
    let dir = std::env::temp_dir().join("anonymizer_test_libre");
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).unwrap();

    let pris = dir.join("rapport_pseudonymise.docx");
    assert_eq!(chemin_libre(pris.clone()), pris, "libre, donc inchange");

    std::fs::write(&pris, b"x").unwrap();
    let second = chemin_libre(pris.clone());
    assert_eq!(second.file_name().unwrap(), "rapport_pseudonymise (2).docx");

    std::fs::write(&second, b"x").unwrap();
    assert_eq!(
      chemin_libre(pris).file_name().unwrap(),
      "rapport_pseudonymise (3).docx"
    );

    std::fs::remove_dir_all(&dir).ok();
  }

  /// « os error 32 » ne dit pas quoi faire ; le message, lui, doit le dire.
  #[test]
  fn nomme_l_application_qui_tient_le_fichier() {
    let verrou = std::io::Error::from_raw_os_error(32);
    let message = erreur_ecriture(Path::new("C:/dossier/rapport.docx"), &verrou);
    assert!(message.contains("rapport.docx"), "{message}");
    assert!(message.contains("ouvert dans une autre application"), "{message}");

    // Les autres echecs gardent leur cause en clair.
    let autre = std::io::Error::from_raw_os_error(13);
    assert!(
      erreur_ecriture(Path::new("/tmp/x.txt"), &autre).starts_with("Ecriture impossible"),
      "message inattendu"
    );
  }

  #[test]
  fn signale_un_fichier_source_absent() {
    let err = tauri::async_runtime::block_on(apply_pseudonymisation(
      "C:/nexiste/pas.docx".into(),
      vec![terme()],
      false,
    ))
    .unwrap_err();
    assert!(err.contains("introuvable"), "{err}");
  }

  #[test]
  fn refuse_un_nom_de_fichier_qui_remonte_l_arborescence() {
    let err = tauri::async_runtime::block_on(write_beside(
      "C:/dossier/doc.docx".into(),
      "../../evade.xlsx".into(),
      vec![1, 2, 3],
    ))
    .unwrap_err();
    assert!(err.contains("invalide"), "{err}");
  }
}
