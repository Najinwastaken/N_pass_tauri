//! CRUD for all entry types + drag&drop reordering.
//!
//! Security rule: list commands NEVER include secrets — the frontend gets
//! metadata only. A secret crosses into the WebView exclusively via a
//! `reveal_*` command (explicit user action, one entry, one field).

use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::models::{CardEntry, KeyEntry, NoteEntry, PasswordEntry};
use crate::state::{AppState, UnlockedVault};

use super::err_code;

/// Run `f` with the unlocked vault, or fail with "locked".
///
/// Rust note: `FnOnce(&mut UnlockedVault) -> Result<T, String>` is a closure
/// type — this helper owns the lock/unlock boilerplate and every command
/// passes just its own logic.
fn with_vault<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&mut UnlockedVault) -> Result<T, String>,
) -> Result<T, String> {
    state.touch();
    let mut guard = state.vault.lock().expect("poisoned");
    let vault = guard.as_mut().ok_or_else(|| "locked".to_string())?;
    f(vault)
}

/// Mutate the vault data, then immediately persist to disk. If the save
/// fails the in-memory change is kept, but the caller gets the error.
/// A failed best-effort backup copy is surfaced to the UI as a toast.
fn mutate<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&mut UnlockedVault) -> Result<T, String>,
) -> Result<T, String> {
    let (result, backup_error) = with_vault(state, |vault| {
        let result = f(vault)?;
        let backup_error = vault.save().map_err(err_code)?;
        Ok((result, backup_error))
    })?;
    state.report_backup_result(backup_error);
    Ok(result)
}

/// Reorder a list to match `ordered_ids` (the frontend sends the full id
/// sequence after a drag&drop). Ids missing from the list keep their
/// relative order at the end; unknown ids are ignored.
fn apply_order<T, F: Fn(&T) -> Uuid>(items: &mut [T], ordered_ids: &[Uuid], id_of: F) {
    let index_of = |id: &Uuid| ordered_ids.iter().position(|x| x == id);
    // sort_by_key is stable: ties (items not in ordered_ids) keep order.
    items.sort_by_key(|item| index_of(&id_of(item)).unwrap_or(usize::MAX));
}

// ---------------------------------------------------------------- passwords

/// What the frontend sees in the list: everything except the password.
#[derive(Serialize)]
pub struct PasswordMeta {
    pub id: Uuid,
    pub title: String,
    pub username: String,
    pub url: String,
    pub notes: String,
}

impl From<&PasswordEntry> for PasswordMeta {
    fn from(e: &PasswordEntry) -> Self {
        Self {
            id: e.id,
            title: e.title.clone(),
            username: e.username.clone(),
            url: e.url.clone(),
            notes: e.notes.clone(),
        }
    }
}

/// Fields the frontend sends when creating/editing an entry.
#[derive(Deserialize)]
pub struct PasswordInput {
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: String,
    pub notes: String,
}

#[tauri::command]
pub fn list_passwords(state: State<'_, AppState>) -> Result<Vec<PasswordMeta>, String> {
    with_vault(&state, |vault| {
        Ok(vault.data.passwords.iter().map(PasswordMeta::from).collect())
    })
}

#[tauri::command]
pub fn add_password(
    state: State<'_, AppState>,
    input: PasswordInput,
) -> Result<PasswordMeta, String> {
    if input.title.trim().is_empty() {
        return Err("empty_title".into());
    }
    mutate(&state, |vault| {
        let entry = PasswordEntry {
            id: Uuid::new_v4(),
            title: input.title.trim().to_string(),
            username: input.username,
            password: input.password,
            url: input.url,
            notes: input.notes,
        };
        let meta = PasswordMeta::from(&entry);
        vault.data.passwords.push(entry);
        Ok(meta)
    })
}

#[tauri::command]
pub fn update_password(
    state: State<'_, AppState>,
    id: Uuid,
    input: PasswordInput,
) -> Result<(), String> {
    if input.title.trim().is_empty() {
        return Err("empty_title".into());
    }
    mutate(&state, |vault| {
        let entry = vault
            .data
            .passwords
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or_else(|| "not_found".to_string())?;
        entry.title = input.title.trim().to_string();
        entry.username = input.username;
        entry.password = input.password;
        entry.url = input.url;
        entry.notes = input.notes;
        Ok(())
    })
}

#[tauri::command]
pub fn delete_password(state: State<'_, AppState>, id: Uuid) -> Result<(), String> {
    mutate(&state, |vault| {
        let before = vault.data.passwords.len();
        vault.data.passwords.retain(|e| e.id != id);
        if vault.data.passwords.len() == before {
            return Err("not_found".to_string());
        }
        Ok(())
    })
}

/// Return the plaintext password of ONE entry — explicit user action only.
#[tauri::command]
pub fn reveal_password(state: State<'_, AppState>, id: Uuid) -> Result<String, String> {
    with_vault(&state, |vault| {
        vault
            .data
            .passwords
            .iter()
            .find(|e| e.id == id)
            .map(|e| e.password.clone())
            .ok_or_else(|| "not_found".to_string())
    })
}

// -------------------------------------------------------------------- cards

/// Card list item: number reduced to its last 4 digits, no CVV at all.
#[derive(Serialize)]
pub struct CardMeta {
    pub id: Uuid,
    pub title: String,
    pub provider: String,
    pub cardholder: String,
    pub last4: String,
    pub expiry: String,
    pub notes: String,
}

impl From<&CardEntry> for CardMeta {
    fn from(e: &CardEntry) -> Self {
        let digits = e.number.len();
        Self {
            id: e.id,
            title: e.title.clone(),
            provider: e.provider.clone(),
            cardholder: e.cardholder.clone(),
            last4: e.number[digits.saturating_sub(4)..].to_string(),
            expiry: e.expiry.clone(),
            notes: e.notes.clone(),
        }
    }
}

#[derive(Deserialize)]
pub struct CardInput {
    pub title: String,
    #[serde(default)]
    pub provider: String,
    pub cardholder: String,
    /// Digits only — the frontend strips separators before sending.
    pub number: String,
    /// "MM/YY"
    pub expiry: String,
    pub cvv: String,
    pub notes: String,
}

fn validate_card(input: &CardInput) -> Result<(), String> {
    if input.title.trim().is_empty() {
        return Err("empty_title".into());
    }
    if !input.number.chars().all(|c| c.is_ascii_digit()) {
        return Err("invalid_card_number".into());
    }
    if !input.cvv.chars().all(|c| c.is_ascii_digit()) {
        return Err("invalid_cvv".into());
    }
    Ok(())
}

#[tauri::command]
pub fn list_cards(state: State<'_, AppState>) -> Result<Vec<CardMeta>, String> {
    with_vault(&state, |vault| {
        Ok(vault.data.cards.iter().map(CardMeta::from).collect())
    })
}

#[tauri::command]
pub fn add_card(state: State<'_, AppState>, input: CardInput) -> Result<CardMeta, String> {
    validate_card(&input)?;
    mutate(&state, |vault| {
        let entry = CardEntry {
            id: Uuid::new_v4(),
            title: input.title.trim().to_string(),
            provider: input.provider,
            cardholder: input.cardholder,
            number: input.number,
            expiry: input.expiry,
            cvv: input.cvv,
            notes: input.notes,
        };
        let meta = CardMeta::from(&entry);
        vault.data.cards.push(entry);
        Ok(meta)
    })
}

#[tauri::command]
pub fn update_card(state: State<'_, AppState>, id: Uuid, input: CardInput) -> Result<(), String> {
    validate_card(&input)?;
    mutate(&state, |vault| {
        let entry = vault
            .data
            .cards
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or_else(|| "not_found".to_string())?;
        entry.title = input.title.trim().to_string();
        entry.provider = input.provider;
        entry.cardholder = input.cardholder;
        entry.number = input.number;
        entry.expiry = input.expiry;
        entry.cvv = input.cvv;
        entry.notes = input.notes;
        Ok(())
    })
}

#[tauri::command]
pub fn delete_card(state: State<'_, AppState>, id: Uuid) -> Result<(), String> {
    mutate(&state, |vault| {
        let before = vault.data.cards.len();
        vault.data.cards.retain(|e| e.id != id);
        if vault.data.cards.len() == before {
            return Err("not_found".to_string());
        }
        Ok(())
    })
}

/// Reveal one field of one card. `field` is "number" or "cvv".
#[tauri::command]
pub fn reveal_card_field(
    state: State<'_, AppState>,
    id: Uuid,
    field: String,
) -> Result<String, String> {
    with_vault(&state, |vault| {
        let entry = vault
            .data
            .cards
            .iter()
            .find(|e| e.id == id)
            .ok_or_else(|| "not_found".to_string())?;
        match field.as_str() {
            "number" => Ok(entry.number.clone()),
            "cvv" => Ok(entry.cvv.clone()),
            _ => Err("unknown_field".into()),
        }
    })
}

// -------------------------------------------------------------------- notes

/// Note list item: title only — the body is the secret.
#[derive(Serialize)]
pub struct NoteMeta {
    pub id: Uuid,
    pub title: String,
}

#[derive(Deserialize)]
pub struct NoteInput {
    pub title: String,
    pub body: String,
}

#[tauri::command]
pub fn list_notes(state: State<'_, AppState>) -> Result<Vec<NoteMeta>, String> {
    with_vault(&state, |vault| {
        Ok(vault
            .data
            .notes
            .iter()
            .map(|e| NoteMeta {
                id: e.id,
                title: e.title.clone(),
            })
            .collect())
    })
}

#[tauri::command]
pub fn add_note(state: State<'_, AppState>, input: NoteInput) -> Result<NoteMeta, String> {
    if input.title.trim().is_empty() {
        return Err("empty_title".into());
    }
    mutate(&state, |vault| {
        let entry = NoteEntry {
            id: Uuid::new_v4(),
            title: input.title.trim().to_string(),
            body: input.body,
        };
        let meta = NoteMeta {
            id: entry.id,
            title: entry.title.clone(),
        };
        vault.data.notes.push(entry);
        Ok(meta)
    })
}

#[tauri::command]
pub fn update_note(state: State<'_, AppState>, id: Uuid, input: NoteInput) -> Result<(), String> {
    if input.title.trim().is_empty() {
        return Err("empty_title".into());
    }
    mutate(&state, |vault| {
        let entry = vault
            .data
            .notes
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or_else(|| "not_found".to_string())?;
        entry.title = input.title.trim().to_string();
        entry.body = input.body;
        Ok(())
    })
}

#[tauri::command]
pub fn delete_note(state: State<'_, AppState>, id: Uuid) -> Result<(), String> {
    mutate(&state, |vault| {
        let before = vault.data.notes.len();
        vault.data.notes.retain(|e| e.id != id);
        if vault.data.notes.len() == before {
            return Err("not_found".to_string());
        }
        Ok(())
    })
}

/// Multi-word match: every query word must occur somewhere in `haystack`
/// (already lowercased), in any order.
fn matches_all_words(haystack: &str, words: &[String]) -> bool {
    words.iter().all(|w| haystack.contains(w.as_str()))
}

/// Full-text note search, executed entirely on the Rust side where the
/// decrypted bodies already live. Only ids/titles of matching notes are
/// returned — bodies never reach the WebView in bulk. Case-insensitive
/// including non-ASCII (both sides lowercased), multi-word in any order.
#[tauri::command]
pub fn search_notes(state: State<'_, AppState>, query: String) -> Result<Vec<NoteMeta>, String> {
    let words: Vec<String> = query
        .trim()
        .to_lowercase()
        .split_whitespace()
        .map(String::from)
        .collect();
    with_vault(&state, |vault| {
        Ok(vault
            .data
            .notes
            .iter()
            .filter(|e| {
                words.is_empty() || {
                    let haystack =
                        format!("{}\n{}", e.title.to_lowercase(), e.body.to_lowercase());
                    matches_all_words(&haystack, &words)
                }
            })
            .map(|e| NoteMeta {
                id: e.id,
                title: e.title.clone(),
            })
            .collect())
    })
}

/// The note body is revealed only when the user opens the note.
#[tauri::command]
pub fn get_note_body(state: State<'_, AppState>, id: Uuid) -> Result<String, String> {
    with_vault(&state, |vault| {
        vault
            .data
            .notes
            .iter()
            .find(|e| e.id == id)
            .map(|e| e.body.clone())
            .ok_or_else(|| "not_found".to_string())
    })
}

// --------------------------------------------------------------------- keys

#[derive(Serialize)]
pub struct KeyMeta {
    pub id: Uuid,
    pub title: String,
    pub notes: String,
}

#[derive(Deserialize)]
pub struct KeyInput {
    pub title: String,
    pub key: String,
    pub notes: String,
}

#[tauri::command]
pub fn list_keys(state: State<'_, AppState>) -> Result<Vec<KeyMeta>, String> {
    with_vault(&state, |vault| {
        Ok(vault
            .data
            .keys
            .iter()
            .map(|e| KeyMeta {
                id: e.id,
                title: e.title.clone(),
                notes: e.notes.clone(),
            })
            .collect())
    })
}

#[tauri::command]
pub fn add_key(state: State<'_, AppState>, input: KeyInput) -> Result<KeyMeta, String> {
    if input.title.trim().is_empty() {
        return Err("empty_title".into());
    }
    mutate(&state, |vault| {
        let entry = KeyEntry {
            id: Uuid::new_v4(),
            title: input.title.trim().to_string(),
            key: input.key,
            notes: input.notes,
        };
        let meta = KeyMeta {
            id: entry.id,
            title: entry.title.clone(),
            notes: entry.notes.clone(),
        };
        vault.data.keys.push(entry);
        Ok(meta)
    })
}

#[tauri::command]
pub fn update_key(state: State<'_, AppState>, id: Uuid, input: KeyInput) -> Result<(), String> {
    if input.title.trim().is_empty() {
        return Err("empty_title".into());
    }
    mutate(&state, |vault| {
        let entry = vault
            .data
            .keys
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or_else(|| "not_found".to_string())?;
        entry.title = input.title.trim().to_string();
        entry.key = input.key;
        entry.notes = input.notes;
        Ok(())
    })
}

#[tauri::command]
pub fn delete_key(state: State<'_, AppState>, id: Uuid) -> Result<(), String> {
    mutate(&state, |vault| {
        let before = vault.data.keys.len();
        vault.data.keys.retain(|e| e.id != id);
        if vault.data.keys.len() == before {
            return Err("not_found".to_string());
        }
        Ok(())
    })
}

#[tauri::command]
pub fn reveal_key(state: State<'_, AppState>, id: Uuid) -> Result<String, String> {
    with_vault(&state, |vault| {
        vault
            .data
            .keys
            .iter()
            .find(|e| e.id == id)
            .map(|e| e.key.clone())
            .ok_or_else(|| "not_found".to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, PartialEq)]
    struct Item(Uuid);

    fn ids(n: usize) -> Vec<Uuid> {
        (0..n).map(|_| Uuid::new_v4()).collect()
    }

    #[test]
    fn apply_order_reorders_to_given_sequence() {
        let id = ids(3);
        let mut items = vec![Item(id[0]), Item(id[1]), Item(id[2])];
        apply_order(&mut items, &[id[2], id[0], id[1]], |i| i.0);
        assert_eq!(
            items.iter().map(|i| i.0).collect::<Vec<_>>(),
            vec![id[2], id[0], id[1]]
        );
    }

    #[test]
    fn apply_order_ignores_unknown_ids_and_keeps_missing_at_end() {
        let id = ids(3);
        let stranger = Uuid::new_v4();
        let mut items = vec![Item(id[0]), Item(id[1]), Item(id[2])];
        // Order mentions a stranger and omits id[0] and id[1]: id[2] goes
        // first, the omitted keep their relative order at the end.
        apply_order(&mut items, &[stranger, id[2]], |i| i.0);
        assert_eq!(
            items.iter().map(|i| i.0).collect::<Vec<_>>(),
            vec![id[2], id[0], id[1]]
        );
    }

    #[test]
    fn matches_all_words_any_order_and_cyrillic() {
        let hay = "рецепт борща\nлук, томаты и Свёкла".to_lowercase();
        let words = |s: &str| -> Vec<String> {
            s.to_lowercase().split_whitespace().map(String::from).collect()
        };
        assert!(matches_all_words(&hay, &words("лук рецепт")));
        assert!(matches_all_words(&hay, &words("СВЁКЛА")));
        assert!(matches_all_words(&hay, &words("томаты лук борщ")));
        assert!(!matches_all_words(&hay, &words("лук картофель")));
        assert!(matches_all_words(&hay, &[]));
    }
}

// ------------------------------------------------------------------ reorder

/// Persist a drag&drop reorder. `kind` selects the list; `ordered_ids` is
/// the full id sequence in its new order.
#[tauri::command]
pub fn reorder_entries(
    state: State<'_, AppState>,
    kind: String,
    ordered_ids: Vec<Uuid>,
) -> Result<(), String> {
    mutate(&state, |vault| {
        match kind.as_str() {
            "passwords" => apply_order(&mut vault.data.passwords, &ordered_ids, |e| e.id),
            "cards" => apply_order(&mut vault.data.cards, &ordered_ids, |e| e.id),
            "notes" => apply_order(&mut vault.data.notes, &ordered_ids, |e| e.id),
            "keys" => apply_order(&mut vault.data.keys, &ordered_ids, |e| e.id),
            _ => return Err("unknown_kind".into()),
        }
        Ok(())
    })
}
