//! Application runtime state: which vault (if any) is currently unlocked.
//!
//! Rust concurrency note: Tauri commands can run on different threads, so
//! shared state must be thread-safe. `Mutex<T>` guarantees only one thread
//! touches the inner value at a time — `.lock()` blocks until the lock is
//! free and returns a guard; the lock is released when the guard is dropped.

use std::path::PathBuf;
use std::sync::Mutex;

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

#[derive(Default)]
pub struct AppState {
    /// `None` = locked / no vault open.
    pub vault: Mutex<Option<UnlockedVault>>,
    /// Directory containing `*.npass` files; resolved once at startup.
    pub vaults_dir: Mutex<PathBuf>,
}

impl AppState {
    pub fn vaults_dir(&self) -> PathBuf {
        self.vaults_dir.lock().expect("poisoned").clone()
    }
}
