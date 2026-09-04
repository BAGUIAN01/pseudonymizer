//! Reecriture d'un document dans son format d'origine.
//!
//! Le principe est le meme pour tous les formats : on ne reconstruit jamais le
//! document, on remplace uniquement le texte la ou il se trouve. Ce qui n'est
//! pas touche — styles, images, tableaux, en-tetes — traverse intact.

use std::io::{Read, Write};

/// Une substitution, du texte source vers son remplacement.
#[derive(Debug, Clone)]
pub struct Replacement {
  pub from: String,
  pub to: String,
}

/* ------------------------------------------------------------------ */
/* Recherche insensible a la casse                                     */
/* ------------------------------------------------------------------ */

/// Position `(debut, fin)` en octets de la premiere occurrence de `needle`
/// dans `hay` a partir de `start`, sans tenir compte de la casse.
///
/// La comparaison se fait caractere par caractere plutot que sur une copie
/// mise en minuscules : `to_lowercase` peut changer la longueur d'un
/// caractere, ce qui decalerait les index par rapport a la chaine d'origine.
fn find_ci(hay: &str, needle: &str, start: usize) -> Option<(usize, usize)> {
  let target: Vec<char> = needle.chars().flat_map(char::to_lowercase).collect();
  if target.is_empty() || start > hay.len() {
    return None;
  }

  let mut i = start;
  while i <= hay.len() {
    if !hay.is_char_boundary(i) {
      i += 1;
      continue;
    }

    let mut k = 0;
    let mut consumed = 0;
    let mut ok = true;
    for c in hay[i..].chars() {
      if k == target.len() {
        break;
      }
      consumed += c.len_utf8();
      for lc in c.to_lowercase() {
        if k >= target.len() || target[k] != lc {
          ok = false;
          break;
        }
        k += 1;
      }
      if !ok {
        break;
      }
    }

    if ok && k == target.len() {
      return Some((i, i + consumed));
    }

    i += 1;
  }
  None
}

/// Applique les substitutions a une chaine.
pub fn apply_to_text(text: &str, reps: &[Replacement]) -> String {
  let mut out = text.to_string();
  for rep in reps {
    let mut result = String::with_capacity(out.len());
    let mut pos = 0;
    while let Some((s, e)) = find_ci(&out, &rep.from, pos) {
      result.push_str(&out[pos..s]);
      result.push_str(&rep.to);
      pos = e;
    }
    result.push_str(&out[pos..]);
    out = result;
  }
  out
}

/* ------------------------------------------------------------------ */
/* XML : segments de texte                                             */
/* ------------------------------------------------------------------ */

fn unescape_xml(s: &str) -> String {
  s.replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", "\"")
    .replace("&apos;", "'")
    .replace("&amp;", "&")
}

fn escape_xml(s: &str) -> String {
  s.replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
}

/// Une balise texte reperee dans le XML : ou commence son contenu, ou il
/// finit, et ou commence sa balise ouvrante (pour pouvoir la completer).
struct Segment {
  tag_start: usize,
  tag_end: usize,
  content_start: usize,
  content_end: usize,
  text: String,
}

/// Verifie que `<nom` est bien suivi d'une fin de nom de balise, pour ne pas
/// confondre `<w:t>` avec `<w:tab/>` ou `<w:tc>`.
fn tag_name_ends(xml: &str, at: usize) -> bool {
  match xml.as_bytes().get(at) {
    Some(b'>') | Some(b' ') | Some(b'/') | Some(b'\t') | Some(b'\n') | Some(b'\r') => true,
    _ => false,
  }
}

/// Repere toutes les balises `<tag>...</tag>` d'un fragment de XML.
fn collect_segments(xml: &str, tag: &str, from: usize, to: usize) -> Vec<Segment> {
  let open = format!("<{}", tag);
  let close = format!("</{}>", tag);
  let mut segs = Vec::new();
  let mut pos = from;

  while let Some(rel) = xml[pos..to].find(&open) {
    let tag_start = pos + rel;
    let after_name = tag_start + open.len();
    if !tag_name_ends(xml, after_name) {
      pos = after_name;
      continue;
    }
    let Some(gt) = xml[after_name..to].find('>') else { break };
    let content_start = after_name + gt + 1;
    // Balise auto-fermante : aucun contenu a traiter.
    if xml.as_bytes().get(content_start - 2) == Some(&b'/') {
      pos = content_start;
      continue;
    }
    let Some(rel_close) = xml[content_start..to].find(&close) else { break };
    let content_end = content_start + rel_close;

    segs.push(Segment {
      tag_start,
      tag_end: content_start,
      content_start,
      content_end,
      text: unescape_xml(&xml[content_start..content_end]),
    });
    pos = content_end + close.len();
  }
  segs
}

/// Retire `[s, e)` du texte reconstitue et insere `to` a cette position.
///
/// Le remplacement va entierement dans le premier segment touche ; les
/// suivants perdent seulement la part qui leur revenait. La mise en forme des
/// portions non couvertes est donc preservee.
fn splice(texts: &mut [String], s: usize, e: usize, to: &str) {
  let mut pos = 0;
  let mut inserted = false;

  for seg in texts.iter_mut() {
    let seg_start = pos;
    let seg_end = pos + seg.len();
    pos = seg_end;

    if e <= seg_start || s >= seg_end {
      continue;
    }
    let cut_start = s.max(seg_start) - seg_start;
    let cut_end = e.min(seg_end) - seg_start;

    let mut next = String::with_capacity(seg.len() + to.len());
    next.push_str(&seg[..cut_start]);
    if !inserted {
      next.push_str(to);
      inserted = true;
    }
    next.push_str(&seg[cut_end..]);
    *seg = next;
  }
}

/// Applique les substitutions a un fragment XML.
///
/// `group_tag` delimite les zones sur lesquelles le texte est reconstitue
/// (un paragraphe Word, une chaine partagee Excel) : c'est ce qui permet de
/// retrouver « Jean Dupont » meme quand Word l'a coupe en deux balises.
///
/// Renvoie le XML modifie, ou `None` si rien n'a change.
fn rewrite_xml(xml: &str, group_tag: &str, text_tag: &str, reps: &[Replacement]) -> Option<String> {
  let group_open = format!("<{}", group_tag);
  let group_close = format!("</{}>", group_tag);

  // Les groupes sont parcourus dans l'ordre ; les modifications sont
  // accumulees puis appliquees d'un seul tenant a la fin.
  let mut edits: Vec<(usize, usize, String)> = Vec::new();
  let mut pos = 0;

  while let Some(rel) = xml[pos..].find(&group_open) {
    let start = pos + rel;
    let after_name = start + group_open.len();
    if !tag_name_ends(xml, after_name) {
      pos = after_name;
      continue;
    }
    let Some(rel_close) = xml[after_name..].find(&group_close) else { break };
    let end = after_name + rel_close;

    let segs = collect_segments(xml, text_tag, after_name, end);
    pos = end + group_close.len();
    if segs.is_empty() {
      continue;
    }

    let mut texts: Vec<String> = segs.iter().map(|s| s.text.clone()).collect();
    let before = texts.concat();

    for rep in reps {
      let mut search_from = 0;
      loop {
        let joined = texts.concat();
        let Some((s, e)) = find_ci(&joined, &rep.from, search_from) else { break };
        splice(&mut texts, s, e, &rep.to);
        search_from = s + rep.to.len();
      }
    }

    if texts.concat() == before {
      continue;
    }

    for (seg, text) in segs.iter().zip(texts.iter()) {
      // Un segment qui gagne une espace en bordure a besoin de
      // `xml:space="preserve"`, sinon Word la supprime a la lecture.
      let needs_space = text.starts_with(' ') || text.ends_with(' ');
      let open_tag = &xml[seg.tag_start..seg.tag_end];
      if needs_space && !open_tag.contains("xml:space") {
        let patched = open_tag.replacen(
          &format!("<{}", text_tag),
          &format!("<{} xml:space=\"preserve\"", text_tag),
          1,
        );
        edits.push((seg.tag_start, seg.tag_end, patched));
      }
      edits.push((seg.content_start, seg.content_end, escape_xml(text)));
    }
  }

  if edits.is_empty() {
    return None;
  }

  edits.sort_by_key(|(s, _, _)| *s);
  let mut out = String::with_capacity(xml.len());
  let mut cursor = 0;
  for (s, e, text) in edits {
    if s < cursor {
      continue;
    }
    out.push_str(&xml[cursor..s]);
    out.push_str(&text);
    cursor = e;
  }
  out.push_str(&xml[cursor..]);
  Some(out)
}

/* ------------------------------------------------------------------ */
/* Conteneurs OOXML                                                    */
/* ------------------------------------------------------------------ */

/// Vrai si cette entree du zip porte du texte a substituer.
fn ooxml_part(name: &str) -> Option<(&'static str, &'static str)> {
  // (group_tag, text_tag)
  if name == "word/document.xml"
    || name == "word/footnotes.xml"
    || name == "word/endnotes.xml"
    || (name.starts_with("word/header") && name.ends_with(".xml"))
    || (name.starts_with("word/footer") && name.ends_with(".xml"))
  {
    return Some(("w:p", "w:t"));
  }
  if name == "xl/sharedStrings.xml" {
    return Some(("si", "t"));
  }
  // Chaines ecrites directement dans la feuille plutot que mutualisees.
  if name.starts_with("xl/worksheets/") && name.ends_with(".xml") {
    return Some(("is", "t"));
  }
  None
}

/// Reecrit un conteneur OOXML en ne touchant qu'aux parties textuelles.
fn rewrite_ooxml(bytes: &[u8], reps: &[Replacement]) -> Result<Vec<u8>, String> {
  let reader = std::io::Cursor::new(bytes);
  let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("archive illisible : {e}"))?;

  let mut out = Vec::new();
  {
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(&mut out));
    let options: zip::write::FileOptions<'_, ()> =
      zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for i in 0..archive.len() {
      let mut entry = archive
        .by_index(i)
        .map_err(|e| format!("entree {i} illisible : {e}"))?;
      let name = entry.name().to_string();

      let mut data = Vec::new();
      entry
        .read_to_end(&mut data)
        .map_err(|e| format!("lecture de {name} : {e}"))?;

      if let Some((group_tag, text_tag)) = ooxml_part(&name) {
        if let Ok(xml) = std::str::from_utf8(&data) {
          if let Some(changed) = rewrite_xml(xml, group_tag, text_tag, reps) {
            data = changed.into_bytes();
          }
        }
      }

      writer
        .start_file(name.clone(), options)
        .map_err(|e| format!("ecriture de {name} : {e}"))?;
      writer
        .write_all(&data)
        .map_err(|e| format!("ecriture de {name} : {e}"))?;
    }

    writer
      .finish()
      .map_err(|e| format!("fermeture de l'archive : {e}"))?;
  }
  Ok(out)
}

/* ------------------------------------------------------------------ */
/* Texte brut                                                          */
/* ------------------------------------------------------------------ */

fn rewrite_plain(bytes: &[u8], reps: &[Replacement]) -> Vec<u8> {
  // Le BOM eventuel est conserve : sous Windows, c'est lui qui garantit que
  // les accents s'affichent correctement a la reouverture.
  const BOM: &[u8] = &[0xEF, 0xBB, 0xBF];
  let (bom, body) = if bytes.starts_with(BOM) {
    (BOM, &bytes[3..])
  } else {
    (&[][..], bytes)
  };

  let text = String::from_utf8_lossy(body);
  let mut out = bom.to_vec();
  out.extend_from_slice(apply_to_text(&text, reps).as_bytes());
  out
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

use std::collections::HashMap;

/// Nom sous lequel la police de secours est ajoutee aux ressources d'une page.
const FALLBACK_FONT: &str = "AnonymizerHelv";

/// Reencode en Latin-1, ou `None` si un caractere n'y tient pas.
fn latin1_encode(text: &str) -> Option<Vec<u8>> {
  text
    .chars()
    .map(|c| if (c as u32) < 256 { Some(c as u8) } else { None })
    .collect()
}

/// Une police de la page, avec de quoi lire son texte et le reecrire.
struct PageFont<'a> {
  encoding: lopdf::Encoding<'a>,
  /// Table inverse `caractere -> (code, longueur)`, pour les polices
  /// composites uniquement.
  inverse: Option<HashMap<char, (u32, u8)>>,
}

/// Construit la table inverse d'une CMap `ToUnicode`.
///
/// `ToUnicodeCMap` n'expose que `get` : la table est donc reconstruite par
/// balayage des codes possibles. C'est le seul moyen de savoir quels glyphes
/// une police sous-ensemblee contient reellement — et donc si le pseudonyme
/// peut y etre ecrit.
fn build_inverse(encoding: &lopdf::Encoding) -> Option<HashMap<char, (u32, u8)>> {
  let lopdf::Encoding::UnicodeMapEncoding(map) = encoding else {
    return None;
  };

  let mut inverse: HashMap<char, (u32, u8)> = HashMap::new();
  for &len in &[1u8, 2u8] {
    let max: u32 = if len == 1 { 0xFF } else { 0xFFFF };
    for code in 0..=max {
      let Some(units) = map.get(code, len) else { continue };
      let Ok(text) = String::from_utf16(&units) else { continue };
      let mut chars = text.chars();
      let (Some(c), None) = (chars.next(), chars.next()) else { continue };
      // Les codes courts sont enregistres en premier et ne sont pas ecrases :
      // a caractere egal, le plus compact est preferable.
      inverse.entry(c).or_insert((code, len));
    }
  }

  if inverse.is_empty() {
    None
  } else {
    Some(inverse)
  }
}

/// Encode un texte pour une police donnee, ou `None` si elle ne peut pas
/// l'ecrire.
///
/// Le controle par aller-retour n'est pas superflu : `encode_text` supprime
/// silencieusement les caracteres absents de la table. Un pseudonyme ampute
/// passerait la verification de suppression tout en rendant la restauration
/// impossible, puisqu'il ne correspondrait plus au registre.
fn encode_for_font(font: &PageFont, text: &str) -> Option<Vec<u8>> {
  if let Some(inverse) = &font.inverse {
    let mut out = Vec::new();
    for c in text.chars() {
      let &(code, len) = inverse.get(&c)?;
      match len {
        1 => out.push(code as u8),
        2 => out.extend_from_slice(&(code as u16).to_be_bytes()),
        _ => return None,
      }
    }
    return Some(out);
  }

  let bytes = lopdf::Document::encode_text(&font.encoding, text);
  let round_trip = lopdf::Document::decode_text(&font.encoding, &bytes).ok()?;
  if round_trip == text {
    Some(bytes)
  } else {
    None
  }
}

/// Texte porte par les operandes d'un operateur d'affichage.
fn operand_text(font: &PageFont, operands: &[lopdf::Object]) -> String {
  use lopdf::Object;

  let mut text = String::new();
  for operand in operands {
    match operand {
      Object::String(bytes, _) => {
        if let Ok(part) = lopdf::Document::decode_text(&font.encoding, bytes) {
          text.push_str(&part);
        }
      }
      Object::Array(items) => text.push_str(&operand_text(font, items)),
      _ => {}
    }
  }
  text
}

/// Un morceau de texte, selon qu'il vient du document ou qu'il le remplace.
enum Piece {
  Original(String),
  Pseudo(String),
}

/// Decoupe un texte en distinguant les remplacements du reste.
///
/// Un seul balayage de gauche a droite, en retenant la correspondance la plus
/// precoce. Les substitutions ne s'enchainent donc pas : le contenu d'un
/// pseudonyme ne peut pas etre re-substitue.
fn split_replacements(text: &str, reps: &[Replacement]) -> Vec<Piece> {
  let mut pieces = Vec::new();
  let mut pos = 0;

  loop {
    let mut best: Option<(usize, usize, &Replacement)> = None;
    for rep in reps {
      if let Some((s, e)) = find_ci(text, &rep.from, pos) {
        // A position egale, `reps` etant trie du plus long au plus court, la
        // premiere trouvee est la plus longue : on la garde.
        if best.map_or(true, |(bs, _, _)| s < bs) {
          best = Some((s, e, rep));
        }
      }
    }

    match best {
      None => {
        if pos < text.len() {
          pieces.push(Piece::Original(text[pos..].to_string()));
        }
        return pieces;
      }
      Some((s, e, rep)) => {
        if s > pos {
          pieces.push(Piece::Original(text[pos..s].to_string()));
        }
        pieces.push(Piece::Pseudo(rep.to.clone()));
        pos = e;
      }
    }
  }
}

/// Ce qu'il faut afficher apres substitution : une suite de fragments, chacun
/// dans la police d'origine ou dans celle de secours.
enum Rewritten {
  Unchanged,
  Pieces(Vec<(bool, Vec<u8>)>),
}

fn rewrite_show(
  font: &PageFont,
  operands: &[lopdf::Object],
  reps: &[Replacement],
  written: &mut HashMap<String, (usize, usize)>,
) -> Rewritten {
  let before = operand_text(font, operands);
  if before.is_empty() {
    return Rewritten::Unchanged;
  }

  let pieces = split_replacements(&before, reps);
  if !pieces.iter().any(|p| matches!(p, Piece::Pseudo(_))) {
    return Rewritten::Unchanged;
  }

  let mut out: Vec<(bool, Vec<u8>)> = Vec::new();
  for piece in &pieces {
    let (text, replacement) = match piece {
      Piece::Original(t) => (t, false),
      Piece::Pseudo(t) => (t, true),
    };

    // Le texte d'origine s'ecrit toujours dans sa propre police ; seul le
    // pseudonyme peut avoir besoin du secours, quand la police du document est
    // sous-ensemblee et ne contient ni crochets ni chiffres.
    if let Some(bytes) = encode_for_font(font, text) {
      if replacement {
        written.entry(text.clone()).or_default().0 += 1;
      }
      out.push((false, bytes));
      continue;
    }
    if !replacement {
      // Un fragment du document que sa propre police ne sait pas reecrire :
      // la verification finale refusera le document.
      return Rewritten::Unchanged;
    }
    match latin1_encode(text) {
      Some(bytes) => {
        written.entry(text.clone()).or_default().1 += 1;
        out.push((true, bytes));
      }
      None => return Rewritten::Unchanged,
    }
  }

  Rewritten::Pieces(out)
}

/// Reecrit le texte d'un PDF en place, puis verifie le resultat.
fn rewrite_pdf(bytes: &[u8], reps: &[Replacement]) -> Result<Vec<u8>, String> {
  use lopdf::content::{Content, Operation};
  use lopdf::{dictionary, Document, Object};

  let mut doc = Document::load_mem(bytes).map_err(|e| format!("PDF illisible : {e}"))?;

  // Termes reellement presents dans le document : eux seuls doivent avoir
  // disparu a l'arrivee, et leur pseudonyme etre lisible.
  let present = terms_present(&doc, reps);

  let fallback_id = doc.add_object(dictionary! {
    "Type" => "Font",
    "Subtype" => "Type1",
    "BaseFont" => "Helvetica",
    "Encoding" => "WinAnsiEncoding",
  });

  let mut written: HashMap<String, (usize, usize)> = HashMap::new();
  let page_ids: Vec<lopdf::ObjectId> = doc.get_pages().into_values().collect();
  let mut updates: Vec<(lopdf::ObjectId, Vec<u8>, bool)> = Vec::new();

  for page_id in &page_ids {
    // Tout le travail de lecture se fait ici, tant que `doc` est emprunte en
    // lecture : les modifications sont appliquees ensuite.
    let fonts = match doc.get_page_fonts(*page_id) {
      Ok(fonts) => fonts,
      Err(e) => return Err(format!("Polices de la page illisibles : {e}")),
    };
    let mut codecs: HashMap<Vec<u8>, PageFont> = HashMap::new();
    for (name, dict) in fonts {
      if let Ok(encoding) = dict.get_font_encoding(&doc) {
        let inverse = build_inverse(&encoding);
        codecs.insert(name, PageFont { encoding, inverse });
      }
    }

    let data = doc
      .get_page_content(*page_id)
      .map_err(|e| format!("Contenu de page illisible : {e}"))?;
    let content = Content::decode(&data).map_err(|e| format!("Flux illisible : {e}"))?;

    let mut operations: Vec<Operation> = Vec::with_capacity(content.operations.len());
    let mut current: Option<Vec<u8>> = None;
    let mut size: Object = Object::Integer(12);
    let mut changed = false;
    let mut uses_fallback = false;

    for op in content.operations {
      if op.operator == "Tf" {
        current = op.operands.first().and_then(|o| o.as_name().ok()).map(|n| n.to_vec());
        if let Some(s) = op.operands.get(1) {
          size = s.clone();
        }
        operations.push(op);
        continue;
      }

      let is_show = matches!(op.operator.as_str(), "Tj" | "TJ" | "'" | "\"");
      let font = current.as_ref().and_then(|name| codecs.get(name));
      let Some(font) = font.filter(|_| is_show) else {
        operations.push(op);
        continue;
      };

      match rewrite_show(font, &op.operands, reps, &mut written) {
        Rewritten::Unchanged => operations.push(op),
        Rewritten::Pieces(pieces) => {
          changed = true;
          let original = current.clone().unwrap_or_default();
          let mut on_fallback = false;

          for (needs_fallback, bytes) in pieces {
            // La police n'est changee qu'aux transitions : un `Tf` par
            // fragment alourdirait le flux sans rien apporter.
            if needs_fallback != on_fallback {
              let name = if needs_fallback {
                FALLBACK_FONT.as_bytes().to_vec()
              } else {
                original.clone()
              };
              operations.push(Operation::new("Tf", vec![Object::Name(name), size.clone()]));
              on_fallback = needs_fallback;
              uses_fallback |= needs_fallback;
            }
            operations.push(show_operation(&op, bytes));
          }

          // La police d'origine est retablie pour la suite de la page.
          if on_fallback {
            operations.push(Operation::new("Tf", vec![Object::Name(original), size.clone()]));
          }
        }
      }
    }

    if changed {
      let encoded = Content { operations }
        .encode()
        .map_err(|e| format!("Reecriture du contenu impossible : {e}"))?;
      updates.push((*page_id, encoded, uses_fallback));
    }
  }

  for (page_id, content, uses_fallback) in updates {
    doc
      .change_page_content(page_id, content)
      .map_err(|e| format!("Mise a jour de la page impossible : {e}"))?;
    if uses_fallback {
      add_fallback_font(&mut doc, page_id, fallback_id)?;
    }
  }

  let mut out = Vec::new();
  doc
    .save_to(&mut out)
    .map_err(|e| format!("Enregistrement du PDF impossible : {e}"))?;

  verify_pdf(&out, &present, &written)?;
  Ok(out)
}

/// Reconstruit un operateur d'affichage avec une nouvelle chaine.
///
/// Un `TJ` perd ses corrections d'espacement au passage : elles decrivaient le
/// texte d'origine, pas le pseudonyme qui le remplace.
fn show_operation(original: &lopdf::content::Operation, bytes: Vec<u8>) -> lopdf::content::Operation {
  use lopdf::content::Operation;
  use lopdf::{Object, StringFormat};

  let string = Object::String(bytes, StringFormat::Literal);
  match original.operator.as_str() {
    "TJ" => Operation::new("TJ", vec![Object::Array(vec![string])]),
    "\"" => {
      let mut operands = original.operands.clone();
      if let Some(last) = operands.last_mut() {
        *last = string;
      }
      Operation::new("\"", operands)
    }
    other => Operation::new(other, vec![string]),
  }
}

/// Declare la police de secours dans les ressources d'une page.
///
/// Le dictionnaire des polices est le plus souvent un objet indirect : il faut
/// le resoudre et l'enrichir. Le remplacer ferait perdre toutes les polices de
/// la page, et plus aucun texte n'y serait lisible.
fn add_fallback_font(
  doc: &mut lopdf::Document,
  page_id: lopdf::ObjectId,
  font_id: lopdf::ObjectId,
) -> Result<(), String> {
  use lopdf::{Dictionary, Object};

  let resources_id = {
    let (_, ids) = doc.get_page_resources(page_id).map_err(|e| format!("{e}"))?;
    ids.first().copied()
  };

  // Lecture d'abord : le document ne peut pas etre emprunte deux fois.
  let fonts_id = {
    let resources = match resources_id {
      Some(id) => doc.get_dictionary(id).ok(),
      None => doc
        .get_dictionary(page_id)
        .ok()
        .and_then(|page| page.get(b"Resources").ok())
        .and_then(|o| o.as_dict().ok()),
    };
    resources
      .and_then(|r| r.get(b"Font").ok())
      .and_then(|o| o.as_reference().ok())
  };

  if let Some(id) = fonts_id {
    return match doc.get_object_mut(id) {
      Ok(Object::Dictionary(fonts)) => {
        fonts.set(FALLBACK_FONT, Object::Reference(font_id));
        Ok(())
      }
      _ => Err("Dictionnaire de polices illisible".into()),
    };
  }

  // Sinon `/Font` est ecrit directement dans les ressources.
  let target = resources_id.unwrap_or(page_id);
  let container = match doc.get_object_mut(target) {
    Ok(Object::Dictionary(dict)) => dict,
    _ => return Err("Ressources de page introuvables".into()),
  };
  let resources = if resources_id.is_some() {
    container
  } else {
    match container.get_mut(b"Resources") {
      Ok(Object::Dictionary(dict)) => dict,
      _ => return Err("Ressources de page introuvables".into()),
    }
  };

  match resources.get_mut(b"Font") {
    Ok(Object::Dictionary(fonts)) => {
      fonts.set(FALLBACK_FONT, Object::Reference(font_id));
      Ok(())
    }
    // Une entree `/Font` d'un autre type n'est pas ecrasee : mieux vaut
    // renoncer que produire une page dont les polices ont disparu.
    Ok(_) => Err("Entree /Font inattendue dans les ressources".into()),
    Err(_) => {
      let mut fonts = Dictionary::new();
      fonts.set(FALLBACK_FONT, Object::Reference(font_id));
      resources.set("Font", Object::Dictionary(fonts));
      Ok(())
    }
  }
}

/// Termes effectivement presents dans le document d'origine.
fn terms_present(doc: &lopdf::Document, reps: &[Replacement]) -> Vec<Replacement> {
  let numbers: Vec<u32> = doc.get_pages().into_keys().collect();
  let Ok(text) = doc.extract_text(&numbers) else {
    // Sans lecture possible, on verifiera tout : mieux vaut refuser a tort que
    // laisser passer une donnee.
    return reps.to_vec();
  };
  let compact = strip_spaces(&text);
  reps
    .iter()
    .filter(|r| find_ci(&compact, &strip_spaces(&r.from), 0).is_some())
    .cloned()
    .collect()
}

/// Relit le PDF produit et s'assure que la substitution a bien eu lieu.
///
/// Deux controles, pas un : le terme d'origine doit avoir disparu, et son
/// pseudonyme doit etre lisible. Le second protege la restauration — un
/// pseudonyme ampute par une police incomplete ne correspondrait plus au
/// registre.
/// Retire tous les blancs d'un texte.
///
/// L'extraction PDF n'est pas fiable sur l'espacement : elle insere un espace a
/// chaque frontiere de fragment et a chaque crenage un peu fort, et n'en produit
/// aucun la ou l'espace vient d'un positionnement plutot que d'un glyphe.
/// Comparer sans les blancs est le seul moyen sur de savoir si un texte est
/// present.
///
/// Le choix va dans le bon sens pour les deux controles : il rend la detection
/// d'une donnee residuelle plus sensible, et celle du texte substitue plus
/// tolerante.
fn strip_spaces(text: &str) -> String {
  text.chars().filter(|c| !c.is_whitespace()).collect()
}

/// Extrait de texte autour du plus long debut de `wanted` retrouve : indique ou
/// la relecture a decroche, plutot que de constater un echec sans indice.
fn excerpt(text: &str, wanted: &str) -> String {
  let compact = strip_spaces(text);
  let target = strip_spaces(wanted);

  for taille in (1..=target.chars().count()).rev() {
    let debut: String = target.chars().take(taille).collect();
    if let Some((pos, _)) = find_ci(&compact, &debut, 0) {
      let mut d = pos.saturating_sub(20);
      while d < compact.len() && !compact.is_char_boundary(d) {
        d += 1;
      }
      let mut f = (pos + debut.len() + 40).min(compact.len());
      while f < compact.len() && !compact.is_char_boundary(f) {
        f += 1;
      }
      return format!("...{}... ({taille} premiers caracteres retrouves)", &compact[d..f]);
    }
  }
  "aucun fragment retrouve, le texte n'a probablement pas ete ecrit".into()
}

/// Resume la maniere dont un texte a ete ecrit pendant la reecriture.
fn report_writes(written: &HashMap<String, (usize, usize)>, wanted: &str) -> String {
  match written.get(wanted) {
    None => "aucune, le texte n'a jamais ete substitue".into(),
    Some((police_origine, secours)) => format!(
      "{police_origine} dans la police du document, {secours} en police de secours"
    ),
  }
}

fn verify_pdf(
  bytes: &[u8],
  present: &[Replacement],
  written: &HashMap<String, (usize, usize)>,
) -> Result<(), String> {
  use lopdf::Document;

  if present.is_empty() {
    return Ok(());
  }

  let doc = Document::load_mem(bytes)
    .map_err(|e| format!("Le PDF produit n'a pas pu etre relu pour verification : {e}"))?;
  let numbers: Vec<u32> = doc.get_pages().into_keys().collect();

  let text = doc.extract_text(&numbers).map_err(|e| {
    format!(
      "Le texte du PDF produit n'a pas pu etre relu pour verification ({e}). \
       Le document n'a pas ete conserve : rien ne garantit que les donnees en aient disparu."
    )
  })?;

  let compact = strip_spaces(&text);

  for rep in present {
    if find_ci(&compact, &strip_spaces(&rep.from), 0).is_some() {
      return Err(format!(
        "« {} » subsiste dans le PDF produit : la substitution n'a pas pu l'atteindre. \
         Le fichier n'a pas ete conserve.",
        rep.from
      ));
    }
    if find_ci(&compact, &strip_spaces(&rep.to), 0).is_none() {
      return Err(format!(
        "« {} » n'a pas pu etre ecrit lisiblement dans ce PDF. Le fichier n'a pas ete conserve : un texte incomplet empecherait de restaurer le document. Ce que la relecture a trouve : {}",
        rep.to,
        format!("{} [ecritures : {}]", excerpt(&text, &rep.to), report_writes(written, &rep.to))
      ));
    }
  }
  Ok(())
}

/* ------------------------------------------------------------------ */
/* Point d'entree                                                      */
/* ------------------------------------------------------------------ */

/// Reecrit le contenu d'un document selon son extension.
pub fn rewrite(extension: &str, bytes: &[u8], reps: &[Replacement]) -> Result<Vec<u8>, String> {
  match extension.to_ascii_lowercase().as_str() {
    "docx" | "xlsx" => rewrite_ooxml(bytes, reps),
    "txt" | "md" | "csv" => Ok(rewrite_plain(bytes, reps)),
    "pdf" => rewrite_pdf(bytes, reps),
    other => Err(format!("Format non pris en charge : .{other}")),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn reps() -> Vec<Replacement> {
    vec![
      Replacement { from: "Jean Dupont".into(), to: "[PERSONNE_0001]".into() },
      Replacement { from: "Awa".into(), to: "[PERSONNE_0002]".into() },
    ]
  }

  #[test]
  fn remplace_sans_tenir_compte_de_la_casse() {
    let out = apply_to_text("jean dupont et Awa", &reps());
    assert_eq!(out, "[PERSONNE_0001] et [PERSONNE_0002]");
  }

  #[test]
  fn recolle_un_nom_coupe_entre_deux_balises() {
    let xml = "<w:p><w:r><w:t>Jean </w:t></w:r><w:r><w:t>Dupont signe</w:t></w:r></w:p>";
    let out = rewrite_xml(xml, "w:p", "w:t", &reps()).expect("le XML doit changer");
    assert!(out.contains("[PERSONNE_0001]"), "{out}");
    assert!(out.contains("signe"), "{out}");
  }

  #[test]
  fn ne_confond_pas_w_t_avec_w_tab() {
    let xml = "<w:p><w:r><w:tab/><w:t>Awa</w:t></w:r></w:p>";
    let out = rewrite_xml(xml, "w:p", "w:t", &reps()).expect("le XML doit changer");
    assert!(out.contains("<w:tab/>"), "{out}");
    assert!(out.contains("[PERSONNE_0002]"), "{out}");
  }

  #[test]
  fn laisse_intact_un_paragraphe_sans_correspondance() {
    let xml = "<w:p><w:r><w:t>Rien a voir</w:t></w:r></w:p>";
    assert!(rewrite_xml(xml, "w:p", "w:t", &reps()).is_none());
  }

  /// Construit un .docx minimal mais valide : un zip avec la partie document.
  fn docx_minimal(paragraphes: &[&str]) -> Vec<u8> {
    let corps: String = paragraphes
      .iter()
      .map(|p| format!("<w:p><w:r><w:t>{p}</w:t></w:r></w:p>"))
      .collect();
    let document = format!(
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document><w:body>{corps}</w:body></w:document>"
    );

    let mut out = Vec::new();
    {
      let mut w = zip::ZipWriter::new(std::io::Cursor::new(&mut out));
      let opts: zip::write::FileOptions<'_, ()> =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
      w.start_file("[Content_Types].xml", opts).unwrap();
      w.write_all(b"<Types/>").unwrap();
      w.start_file("word/document.xml", opts).unwrap();
      w.write_all(document.as_bytes()).unwrap();
      w.finish().unwrap();
    }
    out
  }

  fn lire_document(docx: &[u8]) -> String {
    let mut a = zip::ZipArchive::new(std::io::Cursor::new(docx)).unwrap();
    let mut s = String::new();
    a.by_name("word/document.xml").unwrap().read_to_string(&mut s).unwrap();
    s
  }

  #[test]
  fn reecrit_un_docx_de_bout_en_bout() {
    let docx = docx_minimal(&["Jean Dupont signe.", "Awa relit."]);
    let out = rewrite("docx", &docx, &reps()).expect("la reecriture doit reussir");

    let xml = lire_document(&out);
    assert!(xml.contains("[PERSONNE_0001] signe."), "{xml}");
    assert!(xml.contains("[PERSONNE_0002] relit."), "{xml}");
    assert!(!xml.contains("Dupont"), "le nom doit avoir disparu : {xml}");

    // Les autres entrees de l'archive traversent intactes.
    let mut a = zip::ZipArchive::new(std::io::Cursor::new(&out[..])).unwrap();
    assert!(a.by_name("[Content_Types].xml").is_ok());
  }

  /// Construit un PDF d'une page avec une police standard Helvetica.
  fn pdf_minimal(fragments: &[&str]) -> Vec<u8> {
    use lopdf::content::{Content, Operation};
    use lopdf::{dictionary, Document, Object, Stream};

    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let font_id = doc.add_object(dictionary! {
      "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica",
    });
    let resources_id = doc.add_object(dictionary! {
      "Font" => dictionary! { "F1" => font_id },
    });

    // Les fragments partent dans un seul TJ : c'est ainsi qu'un PDF reel
    // decoupe un nom entre deux corrections d'espacement.
    let morceaux: Vec<Object> = fragments
      .iter()
      .flat_map(|f| vec![Object::string_literal(*f), Object::Integer(-2)])
      .collect();

    let content = Content {
      operations: vec![
        Operation::new("BT", vec![]),
        Operation::new("Tf", vec!["F1".into(), 12.into()]),
        Operation::new("Td", vec![50.into(), 700.into()]),
        Operation::new("TJ", vec![Object::Array(morceaux)]),
        Operation::new("ET", vec![]),
      ],
    };
    let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
    let page_id = doc.add_object(dictionary! {
      "Type" => "Page", "Parent" => pages_id, "Contents" => content_id,
    });
    doc.objects.insert(
      pages_id,
      Object::Dictionary(dictionary! {
        "Type" => "Pages",
        "Kids" => vec![page_id.into()],
        "Count" => 1,
        "Resources" => resources_id,
        "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
      }),
    );
    let catalog_id = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog_id);

    let mut out = Vec::new();
    doc.save_to(&mut out).unwrap();
    out
  }

  #[test]
  fn reecrit_un_pdf_dont_le_nom_est_coupe_en_fragments() {
    let pdf = pdf_minimal(&["Signe par Jean ", "Dupont", " ce jour"]);
    let out = rewrite("pdf", &pdf, &reps()).expect("la reecriture doit reussir");

    let doc = lopdf::Document::load_mem(&out).unwrap();
    let pages: Vec<u32> = doc.get_pages().into_keys().collect();
    let texte = doc.extract_text(&pages).unwrap();

    assert!(texte.contains("[PERSONNE_0001]"), "{texte}");
    assert!(!texte.contains("Dupont"), "le nom doit avoir disparu : {texte}");
    assert!(texte.contains("ce jour"), "le reste du texte doit survivre : {texte}");
  }

  #[test]
  fn laisse_intact_un_pdf_sans_correspondance() {
    let pdf = pdf_minimal(&["Aucune donnee ici"]);
    let out = rewrite("pdf", &pdf, &reps()).expect("la reecriture doit reussir");
    let doc = lopdf::Document::load_mem(&out).unwrap();
    let pages: Vec<u32> = doc.get_pages().into_keys().collect();
    assert!(doc.extract_text(&pages).unwrap().contains("Aucune donnee ici"));
  }

  #[test]
  fn refuse_un_pdf_ou_le_nom_subsiste() {
    // Le PDF n'est volontairement pas reecrit : c'est l'etat dans lequel se
    // trouve un document a police composite, que la substitution n'atteint
    // pas. Le filet doit se declencher plutot que de laisser passer un
    // fichier d'apparence anonymisee.
    let pdf = pdf_minimal(&["Signe par Jean Dupont"]);
    let err = verify_pdf(&pdf, &reps(), &HashMap::new()).unwrap_err();
    assert!(err.contains("subsiste"), "{err}");
  }

  /// Construit une CMap `ToUnicode` couvrant exactement les caracteres
  /// donnes, chacun sur un code de deux octets.
  ///
  /// Reproduire ce mecanisme est indispensable : une police sous-ensemblee ne
  /// contient que les glyphes du document, et c'est precisement ce qui decide
  /// si le pseudonyme pourra y etre ecrit.
  fn to_unicode_cmap(chars: &str) -> (Vec<u8>, std::collections::HashMap<char, u16>) {
    let mut codes = std::collections::HashMap::new();
    let mut entries = String::new();
    for (i, c) in chars.chars().enumerate() {
      let code = (i + 1) as u16;
      codes.insert(c, code);
      entries.push_str(&format!("<{:04X}> <{:04X}>\n", code, c as u32));
    }

    let cmap = format!(
      "/CIDInit /ProcSet findresource begin\n\
       12 dict begin\n\
       begincmap\n\
       /CMapName /Anonymizer def\n\
       /CMapType 2 def\n\
       1 begincodespacerange\n\
       <0000> <FFFF>\n\
       endcodespacerange\n\
       {} beginbfchar\n\
       {}endbfchar\n\
       endcmap\n\
       CMapName currentdict /CMap defineresource pop\n\
       end\n\
       end",
      codes.len(),
      entries
    );
    (cmap.into_bytes(), codes)
  }

  /// PDF d'une page dont le texte est ecrit avec une police composite.
  ///
  /// La police contient toujours les caracteres du document — c'est ce que
  /// produit un sous-ensemblage — plus ceux passes en `supplement`. Laisser
  /// `supplement` vide donne une police incapable d'ecrire un pseudonyme,
  /// faute de crochets, de tiret bas et de chiffres.
  fn pdf_police_composite(texte: &str, supplement: &str) -> Vec<u8> {
    use lopdf::content::{Content, Operation};
    use lopdf::{dictionary, Document, Object, Stream, StringFormat};

    let mut glyphes = String::new();
    for c in texte.chars().chain(supplement.chars()) {
      if !glyphes.contains(c) {
        glyphes.push(c);
      }
    }
    let (cmap, codes) = to_unicode_cmap(&glyphes);

    let mut doc = Document::with_version("1.5");
    let cmap_id = doc.add_object(Stream::new(dictionary! {}, cmap));
    let font_id = doc.add_object(dictionary! {
      "Type" => "Font",
      "Subtype" => "Type0",
      "BaseFont" => "AAAAAA+Composite",
      "Encoding" => "Identity-H",
      "ToUnicode" => cmap_id,
    });
    // Le dictionnaire des polices est un objet indirect : c'est ce que
    // produisent les vrais generateurs de PDF, et le cas ou une ecriture
    // maladroite ferait perdre toutes les polices de la page.
    let fonts_id = doc.add_object(dictionary! { "F1" => font_id });
    let resources_id = doc.add_object(dictionary! { "Font" => fonts_id });

    // Le texte est ecrit en codes de deux octets, comme le ferait un vrai
    // producteur de PDF.
    let mut bytes = Vec::new();
    for c in texte.chars() {
      let code = *codes.get(&c).expect("le glyphe doit exister dans la police");
      bytes.extend_from_slice(&code.to_be_bytes());
    }

    let content = Content {
      operations: vec![
        Operation::new("BT", vec![]),
        Operation::new("Tf", vec!["F1".into(), 12.into()]),
        Operation::new("Td", vec![50.into(), 700.into()]),
        Operation::new("Tj", vec![Object::String(bytes, StringFormat::Literal)]),
        Operation::new("ET", vec![]),
      ],
    };
    let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
    let page_id = doc.add_object(dictionary! {
      "Type" => "Page", "Parent" => (1, 0), "Contents" => content_id,
    });
    let pages_id = doc.add_object(dictionary! {
      "Type" => "Pages",
      "Kids" => vec![page_id.into()],
      "Count" => 1,
      "Resources" => resources_id,
      "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
    });
    if let Ok(Object::Dictionary(page)) = doc.get_object_mut(page_id) {
      page.set("Parent", pages_id);
    }
    let catalog_id = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog_id);

    let mut out = Vec::new();
    doc.save_to(&mut out).unwrap();
    out
  }

  fn texte_du_pdf(bytes: &[u8]) -> String {
    let doc = lopdf::Document::load_mem(bytes).unwrap();
    let pages: Vec<u32> = doc.get_pages().into_keys().collect();
    doc.extract_text(&pages).unwrap()
  }

  #[test]
  fn reecrit_un_pdf_a_police_composite() {
    // La police contient tout ce qu'il faut, crochets et tiret bas compris :
    // le pseudonyme peut etre ecrit dans la police d'origine.
    let pdf = pdf_police_composite("Signe par Jean Dupont.", "[]_PERSON0123456789");

    let out = rewrite("pdf", &pdf, &reps()).expect("la reecriture doit reussir");
    let texte = texte_du_pdf(&out);

    assert!(texte.contains("[PERSONNE_0001]"), "{texte}");
    assert!(!texte.contains("Dupont"), "le nom doit avoir disparu : {texte}");
  }

  #[test]
  fn bascule_sur_la_police_de_secours_quand_les_glyphes_manquent() {
    // Police sous-ensemblee : ni crochets, ni tiret bas, ni chiffres. Le
    // pseudonyme ne peut pas y etre ecrit, et c'est le cas le plus courant sur
    // un vrai document.
    let pdf = pdf_police_composite("Signe par Jean Dupont.", "");

    let out = rewrite("pdf", &pdf, &reps()).expect("le repli doit permettre d'aboutir");
    let texte = texte_du_pdf(&out);

    assert!(texte.contains("[PERSONNE_0001]"), "pseudonyme absent : {texte}");
    assert!(!texte.contains("Dupont"), "le nom doit avoir disparu : {texte}");

    // La police de secours doit etre declaree dans les ressources de la page,
    // sans quoi le lecteur n'afficherait rien.
    let doc = lopdf::Document::load_mem(&out).unwrap();
    let page_id = *doc.get_pages().values().next().unwrap();
    let fonts = doc.get_page_fonts(page_id).unwrap();
    assert!(
      fonts.contains_key(FALLBACK_FONT.as_bytes()),
      "police de secours non declaree"
    );

    // Le dictionnaire des polices est un objet indirect : l'enrichir ne doit
    // pas faire disparaitre celles du document. Sans cette garantie, plus
    // aucun texte de la page ne serait lisible — ni a l'ecran, ni par la
    // verification.
    assert!(
      fonts.contains_key(b"F1".as_slice()),
      "la police d'origine a disparu des ressources"
    );

    // Le secours ne doit servir qu'au pseudonyme : le texte du document garde
    // sa police, et celle-ci est retablie ensuite.
    let content =
      lopdf::content::Content::decode(&doc.get_page_content(page_id).unwrap()).unwrap();
    let polices: Vec<String> = content
      .operations
      .iter()
      .filter(|o| o.operator == "Tf")
      .filter_map(|o| o.operands.first()?.as_name().ok())
      .map(|n| String::from_utf8_lossy(n).into_owned())
      .collect();

    assert_eq!(
      polices,
      vec!["F1", FALLBACK_FONT, "F1"],
      "la police doit basculer pour le seul pseudonyme puis revenir"
    );
  }

  #[test]
  fn aller_retour_pseudonymisation_puis_restauration() {
    // Le cas reel : un montant contenant des espaces, dans un document a
    // police composite qui ne sait ecrire ni crochets ni tiret bas. La
    // pseudonymisation passe donc par la police de secours, et la
    // restauration doit savoir relire ce qu'elle a ecrit.
    let montant = "305 646 FCFA";
    let pseudo = "[MONTANT_0001]";

    let aller = vec![Replacement { from: montant.into(), to: pseudo.into() }];
    let retour = vec![Replacement { from: pseudo.into(), to: montant.into() }];

    let source = pdf_police_composite("Le solde est de 305 646 FCFA ce jour.", "");

    let pseudonymise = rewrite("pdf", &source, &aller).expect("pseudonymisation");
    let texte = texte_du_pdf(&pseudonymise);
    assert!(texte.contains(pseudo), "pseudonyme absent : {texte}");
    assert!(!texte.contains("305 646"), "le montant subsiste : {texte}");

    let restaure = rewrite("pdf", &pseudonymise, &retour).expect("restauration");
    let texte = texte_du_pdf(&restaure);
    assert!(
      strip_spaces(&texte).contains(&strip_spaces(montant)),
      "montant non restaure : {texte}"
    );
    assert!(!texte.contains(pseudo), "le pseudonyme subsiste : {texte}");
  }

  #[test]
  fn refuse_un_pdf_illisible() {
    let err = rewrite("pdf", b"%PDF-1.7 tronque", &reps()).unwrap_err();
    assert!(err.contains("PDF"), "{err}");
  }

  #[test]
  fn conserve_le_bom_du_texte_brut() {
    let mut src = vec![0xEF, 0xBB, 0xBF];
    src.extend_from_slice("Jean Dupont".as_bytes());
    let out = rewrite("txt", &src, &reps()).unwrap();
    assert_eq!(&out[..3], &[0xEF, 0xBB, 0xBF]);
    assert_eq!(&out[3..], "[PERSONNE_0001]".as_bytes());
  }

  #[test]
  fn echappe_le_texte_insere() {
    let r = vec![Replacement { from: "X".into(), to: "a & b".into() }];
    let xml = "<w:p><w:r><w:t>X</w:t></w:r></w:p>";
    let out = rewrite_xml(xml, "w:p", "w:t", &r).expect("le XML doit changer");
    assert!(out.contains("a &amp; b"), "{out}");
  }
}
