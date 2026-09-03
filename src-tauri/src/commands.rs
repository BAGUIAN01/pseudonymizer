//! Commandes exposees au frontend.
//!
//! Etat : signatures et types figes, implementations a venir.
//! Le frontend appelle ces commandes via `src/lib/backend.js`, qui bascule
//! automatiquement sur des donnees simulees quand l'app tourne dans un
//! navigateur (hors Tauri).

use serde::{Deserialize, Serialize};

/// Un document apres extraction : le texte brut, paragraphe par paragraphe.
#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractedDocument {
  pub file_name: String,
  pub path: String,
  /// Format d'origine : "pdf" | "docx" | "xlsx" | "txt"
  pub format: String,
  pub title: String,
  pub paragraphs: Vec<String>,
}

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

/// Extrait le texte d'un document, en conservant son format d'origine.
#[tauri::command]
pub async fn extract_document(path: String) -> Result<ExtractedDocument, String> {
  let _ = path;
  Err("extract_document : non implemente".into())
}

/// Applique les substitutions et reecrit le document dans son format d'origine.
///
/// Pour un PDF, la strategie retenue est la redaction en place : on efface la
/// zone du terme et on redessine le pseudonyme avec la meme police, en
/// reduisant la taille si le pseudonyme est plus large que l'original.
#[tauri::command]
pub async fn apply_pseudonymisation(
  source_path: String,
  terms: Vec<Term>,
  reverse: bool,
) -> Result<Deliverables, String> {
  let _ = (source_path, terms, reverse);
  Err("apply_pseudonymisation : non implemente".into())
}

/// Ecrit le registre de correspondances au format Excel de l'app existante.
#[tauri::command]
pub async fn write_registry(terms: Vec<Term>, out_dir: String) -> Result<String, String> {
  let _ = (terms, out_dir);
  Err("write_registry : non implemente".into())
}

/// Relit un registre Excel pour le mode de-pseudonymisation.
#[tauri::command]
pub async fn read_registry(path: String) -> Result<Vec<Term>, String> {
  let _ = path;
  Err("read_registry : non implemente".into())
}

/// Ouvre l'explorateur de fichiers sur le fichier produit.
#[tauri::command]
pub async fn reveal_in_folder(path: String) -> Result<(), String> {
  let _ = path;
  Err("reveal_in_folder : non implemente".into())
}
