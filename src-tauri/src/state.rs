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

use zeroize::{Zeroize, Zeroizing};

use crate::crypto::{KdfParams, KEY_LEN, SALT_LEN};
use crate::models::VaultData;
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
}

impl UnlockedVault {
    /// Persist current `data` to disk (fresh nonce, atomic write, backup).
    pub fn save(&self) -> Result<(), VaultError> {
        vault::save(&self.path, &self.data, &self.key, &self.salt, &self.kdf_params)
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
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            vault: Mutex::new(None),
            vaults_dir: Mutex::new(PathBuf::new()),
            last_activity: Mutex::new(Instant::now()),
            clipboard_gen: AtomicU64::new(0),
        }
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
        self.last_activity.lock().expect("poisoned").elapsed().as_secs()
    }

    /// Bump the clipboard generation and return the new value.
    pub fn next_clipboard_gen(&self) -> u64 {
        self.clipboard_gen.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn current_clipboard_gen(&self) -> u64 {
        self.clipboard_gen.load(Ordering::SeqCst)
    }
}
