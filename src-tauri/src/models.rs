//! Data model for everything stored inside a vault.
//!
//! These structs are serialized to JSON, and that JSON is what gets
//! encrypted into the `.npass` file. Nothing here touches disk or crypto.

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use zeroize::Zeroize;

/// A single login/password record.
///
/// `Zeroize` lets us wipe entry contents from memory on lock. `Uuid` has no
/// Zeroize impl (and is not secret), so it is skipped.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Zeroize)]
pub struct PasswordEntry {
    #[zeroize(skip)]
    pub id: Uuid,
    pub title: String,
    pub username: String,
    pub password: String,
    /// `default` keeps vaults saved before this field existed loadable.
    #[serde(default)]
    pub email: String,
    /// Free-form group ("Mail", "Games"…). Empty = not categorised.
    /// Categories exist only as the values entries carry — there is no
    /// separate list to manage.
    #[serde(default)]
    pub category: String,
    pub url: String,
    pub notes: String,
    /// When this entry last changed, in unix seconds UTC. Two copies of the
    /// same vault are merged by comparing these, so the clock has to mean
    /// the same thing on every machine — hence UTC, not local time.
    /// A missing value reads as 0, which is older than anything: entries
    /// written before this field existed lose to any later edit.
    #[serde(default)]
    pub updated_at: i64,
}

/// A bank card record.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Zeroize)]
pub struct CardEntry {
    #[zeroize(skip)]
    pub id: Uuid,
    pub title: String,
    /// Payment network ("Visa", "Mastercard", ...). `default` keeps vaults
    /// saved before this field existed loadable.
    #[serde(default)]
    pub provider: String,
    pub cardholder: String,
    /// Stored without separators; formatting is a UI concern.
    pub number: String,
    /// "MM/YY"
    pub expiry: String,
    pub cvv: String,
    pub notes: String,
    /// When this entry last changed, in unix seconds UTC. Two copies of the
    /// same vault are merged by comparing these, so the clock has to mean
    /// the same thing on every machine — hence UTC, not local time.
    /// A missing value reads as 0, which is older than anything: entries
    /// written before this field existed lose to any later edit.
    #[serde(default)]
    pub updated_at: i64,
}

/// A free-form secure note.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Zeroize)]
pub struct NoteEntry {
    #[zeroize(skip)]
    pub id: Uuid,
    pub title: String,
    pub body: String,
    /// When this entry last changed, in unix seconds UTC. Two copies of the
    /// same vault are merged by comparing these, so the clock has to mean
    /// the same thing on every machine — hence UTC, not local time.
    /// A missing value reads as 0, which is older than anything: entries
    /// written before this field existed lose to any later edit.
    #[serde(default)]
    pub updated_at: i64,
}

/// A key/token record (API keys, SSH passphrases, license keys...).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Zeroize)]
pub struct KeyEntry {
    #[zeroize(skip)]
    pub id: Uuid,
    pub title: String,
    pub key: String,
    pub notes: String,
    /// When this entry last changed, in unix seconds UTC. Two copies of the
    /// same vault are merged by comparing these, so the clock has to mean
    /// the same thing on every machine — hence UTC, not local time.
    /// A missing value reads as 0, which is older than anything: entries
    /// written before this field existed lose to any later edit.
    #[serde(default)]
    pub updated_at: i64,
}

/// A record that an entry once existed and was deleted.
///
/// Without these, merging two copies could not tell "deleted here" from
/// "added there": the side that still has the entry would keep handing it
/// back, and a deletion would never stick.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Tombstone {
    pub id: Uuid,
    /// Unix seconds UTC, as with `updated_at`.
    pub at: i64,
}

/// Now, in unix seconds UTC.
pub fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

/// Per-vault user settings, stored encrypted along with the entries.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Zeroize)]
pub struct Settings {
    /// Auto-lock after this many minutes of inactivity.
    #[serde(default = "default_auto_lock_minutes")]
    pub auto_lock_minutes: u32,
    /// Lock the vault when the window is minimized.
    #[serde(default)]
    pub lock_on_minimize: bool,
    /// Clear the clipboard this many seconds after we copied to it
    /// (only if it still holds our value). 0 = never clear.
    #[serde(default = "default_clipboard_clear_seconds")]
    pub clipboard_clear_seconds: u32,
    /// Extra folder the encrypted vault is copied into (e.g. a
    /// Google Drive / Dropbox synced folder). Empty = no backup.
    #[serde(default)]
    pub backup_dir: String,
    /// Copy the vault into `backup_dir` after every save.
    #[serde(default)]
    pub backup_on_save: bool,
    /// "dark" | "light"
    #[serde(default = "default_theme")]
    pub theme: String,
    /// UI language: "en" | "ru" | "uk"
    #[serde(default = "default_language")]
    pub language: String,
    /// Category names in the order the user arranged them. Categories not
    /// listed here follow alphabetically, so only what was deliberately
    /// placed needs storing. Lives in the vault rather than in the webview
    /// so it travels with a portable copy.
    #[serde(default)]
    pub category_order: Vec<String>,
}

fn default_language() -> String {
    "en".to_string()
}

fn default_auto_lock_minutes() -> u32 {
    10
}

fn default_clipboard_clear_seconds() -> u32 {
    30
}

fn default_theme() -> String {
    "dark".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_lock_minutes: default_auto_lock_minutes(),
            lock_on_minimize: false,
            clipboard_clear_seconds: default_clipboard_clear_seconds(),
            backup_dir: String::new(),
            backup_on_save: false,
            theme: default_theme(),
            language: default_language(),
            category_order: Vec::new(),
        }
    }
}

/// The whole decrypted content of a vault file.
///
/// `#[serde(default)]` on every collection means a vault saved by an older
/// version (missing a newer field) still deserializes — forward compatibility
/// for the JSON payload, mirroring what `format_version` does for the binary
/// header.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Zeroize)]
pub struct VaultData {
    #[serde(default)]
    pub passwords: Vec<PasswordEntry>,
    #[serde(default)]
    pub cards: Vec<CardEntry>,
    #[serde(default)]
    pub notes: Vec<NoteEntry>,
    #[serde(default)]
    pub keys: Vec<KeyEntry>,
    #[serde(default)]
    pub settings: Settings,
    /// Deletions, kept so they survive a merge. Not secret — only ids and
    /// times — so there is nothing here to wipe on lock.
    #[serde(default)]
    #[zeroize(skip)]
    pub deleted: Vec<Tombstone>,
    /// When `settings` last changed, unix seconds UTC. Settings have no
    /// per-field history, so a merge takes whichever side is newer.
    #[serde(default)]
    pub settings_updated_at: i64,
}
