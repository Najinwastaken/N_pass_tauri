//! Application runtime state: which vault (if any) is currently unlocked.
//!
//! Rust concurrency note: Tauri commands can run on different threads, so
//! shared state must be thread-safe. `Mutex<T>` guarantees only one thread
//! touches the inner value at a time — `.lock()` blocks until the lock is
//! free and returns a guard; the lock is released when the guard is dropped.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use tauri::{AppHandle, Emitter};
use zeroize::{Zeroize, Zeroizing};

use crate::crypto::{KdfParams, KEY_LEN, NONCE_LEN, SALT_LEN};
use crate::merge::{self, MergeReport};
use crate::models::{now_ts, VaultData};
use crate::vault::{self, VaultError};

/// Everything needed to work with an unlocked vault without re-running
/// the KDF: the derived key stays in memory (zeroized on lock), the salt
/// and KDF params are needed to save the file again.
pub struct UnlockedVault {
    pub profile: String,
    pub path: PathBuf,
    pub key: Zeroizing<[u8; KEY_LEN]>,
    pub salt: [u8; SALT_LEN],
    pub kdf_params: KdfParams,
    pub data: VaultData,
    /// The nonce of the version currently on disk. It is random and freshly
    /// drawn on every write, which makes it a perfect marker of "who wrote
    /// last": if the file's nonce is no longer this one, something else has
    /// written to the vault since we read it.
    pub disk_nonce: [u8; NONCE_LEN],
    /// Left behind by a save that had to merge. The command layer picks it
    /// up, tells the window and clears it.
    pub pending_merge: Option<MergeReport>,
}

impl UnlockedVault {
    /// Persist current `data` to disk (fresh nonce, atomic write, backup).
    /// If configured, best-effort copy the encrypted file into the user's
    /// backup folder afterwards — a backup failure must not fail the save,
    /// so it is RETURNED (Ok(Some(message))) for the caller to surface.
    pub fn save(&mut self) -> Result<Option<String>, VaultError> {
        if let Some(report) = self.absorb_disk_changes()? {
            self.pending_merge = Some(report);
        }
        self.disk_nonce = vault::save(
            &self.path,
            &self.data,
            &self.key,
            &self.salt,
            &self.kdf_params,
        )?;
        if self.data.settings.backup_on_save {
            let dir = self.data.settings.backup_dir.trim();
            if !dir.is_empty() {
                return Ok(self.backup_to(dir).err().map(|e| e.to_string()));
            }
        }
        Ok(None)
    }

    /// Copy the (encrypted, self-contained) vault file into `dir`.
    /// If the file changed since we last read or wrote it, fold that version
    /// into ours before overwriting, so the other writer's work survives.
    ///
    /// Returns what the merge did, or `None` when the file is untouched —
    /// which is every save but the rare one.
    pub fn absorb_disk_changes(&mut self) -> Result<Option<MergeReport>, VaultError> {
        // No file at all (removed, drive unplugged): nothing to preserve,
        // and the save about to happen will simply recreate it.
        let Ok(header) = vault::load_header(&self.path) else {
            return Ok(None);
        };
        if header.nonce == self.disk_nonce {
            return Ok(None);
        }

        // A failure here is deliberately fatal to the save: it means the file
        // is unreadable to us — most likely re-encrypted under a different
        // master password — and overwriting it would destroy it.
        let mut theirs = vault::load_with_key(&self.path, &self.key)?;
        let report = merge::merge(&mut self.data, &mut theirs, now_ts());
        // That version is now part of ours, so it is no longer news.
        self.disk_nonce = header.nonce;
        Ok(Some(report))
    }

    pub fn backup_to(&self, dir: &str) -> std::io::Result<()> {
        let dir = std::path::Path::new(dir);
        std::fs::create_dir_all(dir)?;
        let name = self
            .path
            .file_name()
            .ok_or_else(|| std::io::Error::other("vault path has no file name"))?;
        std::fs::copy(&self.path, dir.join(name))?;
        Ok(())
    }
}

impl Drop for UnlockedVault {
    /// Wipe decrypted entries when the vault is dropped (lock / app exit).
    /// The key wipes itself — it is already inside `Zeroizing`.
    fn drop(&mut self) {
        self.data.zeroize();
    }
}

pub struct AppState {
    /// `None` = locked / no vault open.
    pub vault: Mutex<Option<UnlockedVault>>,
    /// Directory containing `*.npass` files; resolved once at startup.
    pub vaults_dir: Mutex<PathBuf>,
    /// Last user activity — the auto-lock thread compares against this.
    pub last_activity: Mutex<Instant>,
    /// Incremented on every copy we perform. The delayed clear only fires
    /// if the generation is unchanged (i.e. nothing was copied after it).
    ///
    /// `AtomicU64` allows lock-free reads/writes from multiple threads —
    /// enough for a counter, no Mutex needed.
    pub clipboard_gen: AtomicU64,
    /// Handle for emitting events to the UI (set once at startup).
    pub app: Mutex<Option<AppHandle>>,
    /// Last backup error we already told the UI about — dedupes toasts.
    pub last_backup_error: Mutex<Option<String>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            vault: Mutex::new(None),
            vaults_dir: Mutex::new(PathBuf::new()),
            last_activity: Mutex::new(Instant::now()),
            clipboard_gen: AtomicU64::new(0),
            app: Mutex::new(None),
            last_backup_error: Mutex::new(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::KdfParams;

    fn test_params() -> KdfParams {
        KdfParams {
            m_cost: 8 * 1024,
            t_cost: 1,
            p_cost: 1,
        }
    }

    fn entry(title: &str) -> crate::models::PasswordEntry {
        crate::models::PasswordEntry {
            id: uuid::Uuid::new_v4(),
            title: title.into(),
            username: String::new(),
            password: "secret".into(),
            email: String::new(),
            category: String::new(),
            url: String::new(),
            notes: String::new(),
            updated_at: now_ts(),
        }
    }

    fn titles(path: &std::path::Path) -> Vec<String> {
        let (data, _, _) = crate::vault::load(path, "pw").unwrap();
        data.passwords.into_iter().map(|e| e.title).collect()
    }

    /// Two sessions open the same file, both save. The second must not wipe
    /// what the first wrote — this is the whole point of the merge.
    #[test]
    fn a_save_keeps_what_another_writer_left_behind() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("T.npass");
        crate::vault::create(&path, "pw", &VaultData::default(), test_params()).unwrap();

        let open = || {
            let (data, key, header) = crate::vault::load(&path, "pw").unwrap();
            UnlockedVault {
                profile: "T".into(),
                path: path.clone(),
                key,
                salt: header.salt,
                kdf_params: header.kdf_params,
                data,
                disk_nonce: header.nonce,
                pending_merge: None,
            }
        };

        // Both start from the same version of the file.
        let mut first = open();
        let mut second = open();

        first.data.passwords.push(entry("from first"));
        first.save().unwrap();
        assert!(first.pending_merge.is_none(), "nobody else had written yet");

        second.data.passwords.push(entry("from second"));
        second.save().unwrap();

        let found = titles(&path);
        assert!(found.contains(&"from first".to_string()), "first survived");
        assert!(
            found.contains(&"from second".to_string()),
            "second is there"
        );
        assert!(second.pending_merge.is_some(), "the merge is reported");
    }

    /// A deletion by one session is not undone by the other's stale copy.
    #[test]
    fn a_deletion_by_another_writer_sticks() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("T.npass");
        let mut start = VaultData::default();
        start.passwords.push(entry("doomed"));
        let doomed = start.passwords[0].id;
        crate::vault::create(&path, "pw", &start, test_params()).unwrap();

        let open = || {
            let (data, key, header) = crate::vault::load(&path, "pw").unwrap();
            UnlockedVault {
                profile: "T".into(),
                path: path.clone(),
                key,
                salt: header.salt,
                kdf_params: header.kdf_params,
                data,
                disk_nonce: header.nonce,
                pending_merge: None,
            }
        };

        let mut deleter = open();
        let mut other = open();

        deleter.data.passwords.retain(|e| e.id != doomed);
        deleter.data.deleted.push(crate::models::Tombstone {
            id: doomed,
            at: now_ts(),
        });
        deleter.save().unwrap();

        // The other session still holds it and saves something unrelated.
        other.data.passwords.push(entry("unrelated"));
        other.save().unwrap();

        let found = titles(&path);
        assert!(!found.contains(&"doomed".to_string()), "it stays deleted");
        assert!(found.contains(&"unrelated".to_string()));
    }

    #[test]
    fn backup_copies_identical_encrypted_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("T.npass");
        let params = KdfParams {
            m_cost: 8 * 1024,
            t_cost: 1,
            p_cost: 1,
        };
        crate::vault::create(&path, "pw", &VaultData::default(), params).unwrap();
        let (data, key, header) = crate::vault::load(&path, "pw").unwrap();
        let unlocked = UnlockedVault {
            profile: "T".into(),
            path: path.clone(),
            key,
            salt: header.salt,
            kdf_params: header.kdf_params,
            data,
            disk_nonce: header.nonce,
            pending_merge: None,
        };

        // Target dir does not exist yet — backup_to must create it.
        let backup_dir = dir.path().join("bak");
        unlocked.backup_to(backup_dir.to_str().unwrap()).unwrap();

        assert_eq!(
            std::fs::read(&path).unwrap(),
            std::fs::read(backup_dir.join("T.npass")).unwrap(),
            "backup must be a byte-identical copy of the encrypted vault"
        );
    }
}

impl AppState {
    pub fn vaults_dir(&self) -> PathBuf {
        self.vaults_dir.lock().expect("poisoned").clone()
    }

    /// Record user activity (called by commands and the frontend).
    pub fn touch(&self) {
        *self.last_activity.lock().expect("poisoned") = Instant::now();
    }

    pub fn idle_seconds(&self) -> u64 {
        self.last_activity
            .lock()
            .expect("poisoned")
            .elapsed()
            .as_secs()
    }

    /// Bump the clipboard generation and return the new value.
    pub fn next_clipboard_gen(&self) -> u64 {
        self.clipboard_gen.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn current_clipboard_gen(&self) -> u64 {
        self.clipboard_gen.load(Ordering::SeqCst)
    }

    /// Surface a background backup outcome to the UI. Each distinct error
    /// is emitted once ("backup-failed" event -> styled toast); a success
    /// resets the dedupe so the next failure is reported again.
    /// Tell the window that a save had to fold in changes written by
    /// someone else. Silence would be worse than a line of text: entries
    /// would appear out of nowhere.
    pub fn report_merge(&self, report: Option<MergeReport>) {
        let Some(report) = report.filter(|r| !r.touched_nothing()) else {
            return;
        };
        if let Some(app) = self.app.lock().expect("poisoned").as_ref() {
            let _ = app.emit("vault-merged", report.total());
        }
    }

    pub fn report_backup_result(&self, error: Option<String>) {
        let mut last = self.last_backup_error.lock().expect("poisoned");
        match error {
            None => *last = None,
            Some(message) => {
                if last.as_deref() != Some(message.as_str()) {
                    *last = Some(message.clone());
                    if let Some(app) = self.app.lock().expect("poisoned").as_ref() {
                        let _ = app.emit("backup-failed", message);
                    }
                }
            }
        }
    }
}
