//! The `.npass` file format and disk I/O.
//!
//! Binary layout (all integers little-endian):
//!
//! ```text
//! [magic  "NPV1"                     4 bytes]
//! [format_version                    1 byte ]
//! [kdf m_cost | t_cost | p_cost   3x4 bytes ]
//! [salt                             16 bytes]
//! [nonce                            24 bytes]
//! [ciphertext = XChaCha20-Poly1305(JSON, key, nonce, aad = header above)]
//! ```
//!
//! The header is passed as AAD, so tampering with any header field breaks
//! authentication. The file is self-contained: copy it to another machine
//! and the same master password opens it.

use chrono::Local;
use std::fs;
use std::path::Path;

use zeroize::Zeroizing;

use crate::crypto::{self, KdfParams, KEY_LEN, NONCE_LEN, SALT_LEN};
use crate::models::VaultData;

/// How many previous versions to keep beside the vault. One is enough to
/// undo a bad write; a couple more cover the case the app cannot see at
/// all — an older file copied over a newer one while it was closed.
const KEPT_BACKUPS: usize = 2;

pub const MAGIC: &[u8; 4] = b"NPV1";
pub const FORMAT_VERSION: u8 = 1;
pub const HEADER_LEN: usize = 4 + 1 + 12 + SALT_LEN + NONCE_LEN; // 57

/// All the ways vault operations can fail.
///
/// `thiserror` generates the `std::error::Error` impl and `Display` from
/// the `#[error(...)]` attributes; `#[from]` lets `?` auto-convert
/// `std::io::Error` into `VaultError::Io`.
#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("not a valid .npass file")]
    InvalidFormat,
    #[error("unsupported vault format version {0}")]
    UnsupportedVersion(u8),
    #[error("key derivation failed: {0}")]
    Kdf(String),
    #[error("encryption failed")]
    Crypto,
    #[error("wrong master password or corrupted file")]
    WrongPasswordOrCorrupted,
    #[error("invalid vault content: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("at least one character class must be enabled")]
    InvalidPasswordOptions,
}

/// Parsed header of a `.npass` file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultHeader {
    pub format_version: u8,
    pub kdf_params: KdfParams,
    pub salt: [u8; SALT_LEN],
    pub nonce: [u8; NONCE_LEN],
}

impl VaultHeader {
    /// Serialize the header into its exact on-disk byte layout.
    pub fn to_bytes(&self) -> [u8; HEADER_LEN] {
        let mut buf = [0u8; HEADER_LEN];
        buf[0..4].copy_from_slice(MAGIC);
        buf[4] = self.format_version;
        buf[5..9].copy_from_slice(&self.kdf_params.m_cost.to_le_bytes());
        buf[9..13].copy_from_slice(&self.kdf_params.t_cost.to_le_bytes());
        buf[13..17].copy_from_slice(&self.kdf_params.p_cost.to_le_bytes());
        buf[17..17 + SALT_LEN].copy_from_slice(&self.salt);
        buf[17 + SALT_LEN..].copy_from_slice(&self.nonce);
        buf
    }

    /// Parse and validate a header from the start of file bytes.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, VaultError> {
        if bytes.len() < HEADER_LEN || &bytes[0..4] != MAGIC {
            return Err(VaultError::InvalidFormat);
        }
        let format_version = bytes[4];
        if format_version != FORMAT_VERSION {
            return Err(VaultError::UnsupportedVersion(format_version));
        }
        // try_into() converts a slice to a fixed-size array; the length is
        // checked above, so unwrap() can never fire here.
        let kdf_params = KdfParams {
            m_cost: u32::from_le_bytes(bytes[5..9].try_into().unwrap()),
            t_cost: u32::from_le_bytes(bytes[9..13].try_into().unwrap()),
            p_cost: u32::from_le_bytes(bytes[13..17].try_into().unwrap()),
        };
        let salt: [u8; SALT_LEN] = bytes[17..17 + SALT_LEN].try_into().unwrap();
        let nonce: [u8; NONCE_LEN] = bytes[17 + SALT_LEN..HEADER_LEN].try_into().unwrap();
        Ok(Self {
            format_version,
            kdf_params,
            salt,
            nonce,
        })
    }
}

/// Create a brand-new vault file: fresh salt, key derived from `password`,
/// then a normal save. Returns the derived key so the caller can keep the
/// vault unlocked without re-running the KDF.
pub fn create(
    path: &Path,
    password: &str,
    data: &VaultData,
    kdf_params: KdfParams,
) -> Result<(Zeroizing<[u8; KEY_LEN]>, [u8; NONCE_LEN]), VaultError> {
    let salt = crypto::generate_salt();
    let key = crypto::derive_key(password.as_bytes(), &salt, &kdf_params)?;
    let nonce = save(path, data, &key, &salt, &kdf_params)?;
    Ok((key, nonce))
}

/// Encrypt `data` and atomically write it to `path`.
///
/// A fresh nonce is generated on every call. Write order:
/// 1. serialize + encrypt into a temp file next to the target,
/// 2. rename current file to `<name>.<timestamp>.bak`, keeping the newest
///    few and deleting the rest,
/// 3. rename temp file into place.
///
/// A crash at any point leaves either the old file or the old backup intact.
pub fn save(
    path: &Path,
    data: &VaultData,
    key: &[u8; KEY_LEN],
    salt: &[u8; SALT_LEN],
    kdf_params: &KdfParams,
) -> Result<[u8; NONCE_LEN], VaultError> {
    let header = VaultHeader {
        format_version: FORMAT_VERSION,
        kdf_params: *kdf_params,
        salt: *salt,
        nonce: crypto::generate_nonce(),
    };
    let header_bytes = header.to_bytes();

    // Zeroizing: the serialized JSON contains every secret in the vault.
    let plaintext = Zeroizing::new(serde_json::to_vec(data)?);
    let ciphertext = crypto::encrypt(key, &header.nonce, &plaintext, &header_bytes)?;

    let mut file_bytes = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    file_bytes.extend_from_slice(&header_bytes);
    file_bytes.extend_from_slice(&ciphertext);

    atomic_write_with_backup(path, &file_bytes)?;
    Ok(header.nonce)
}

/// Decrypt a vault with a key we already hold, skipping the KDF.
///
/// Used to read the version another writer left on disk so it can be merged
/// in. If that version was re-encrypted under a different master password
/// the key will not fit and this fails — which is the right answer: there is
/// nothing to merge, and overwriting it blindly would be worse.
pub fn load_with_key(path: &Path, key: &[u8; KEY_LEN]) -> Result<VaultData, VaultError> {
    let bytes = fs::read(path)?;
    let header = VaultHeader::from_bytes(&bytes)?;
    let plaintext = crypto::decrypt(key, &header.nonce, &bytes[HEADER_LEN..], &header.to_bytes())?;
    Ok(serde_json::from_slice(&plaintext)?)
}

/// Read and parse only the header of a vault file (no password needed).
pub fn load_header(path: &Path) -> Result<VaultHeader, VaultError> {
    let bytes = fs::read(path)?;
    VaultHeader::from_bytes(&bytes)
}

/// Load a vault: parse header, re-derive the key with the stored KDF params
/// and salt, decrypt, deserialize. Returns the data and the key.
pub fn load(
    path: &Path,
    password: &str,
) -> Result<(VaultData, Zeroizing<[u8; KEY_LEN]>, VaultHeader), VaultError> {
    let bytes = fs::read(path)?;
    let header = VaultHeader::from_bytes(&bytes)?;
    let key = crypto::derive_key(password.as_bytes(), &header.salt, &header.kdf_params)?;

    let header_bytes = header.to_bytes();
    let ciphertext = &bytes[HEADER_LEN..];
    let plaintext = crypto::decrypt(&key, &header.nonce, ciphertext, &header_bytes)?;
    let data: VaultData = serde_json::from_slice(&plaintext)?;
    Ok((data, key, header))
}

/// Write `bytes` to `path` atomically, keeping the previous version as
/// `<name>.<timestamp>.bak`.
fn atomic_write_with_backup(path: &Path, bytes: &[u8]) -> Result<(), VaultError> {
    let tmp_path = with_extra_extension(path, "tmp");
    fs::write(&tmp_path, bytes)?;

    if path.exists() {
        // Each previous version keeps its own name, so several can coexist.
        // Local time, not UTC: these names are read by a person deciding
        // which copy to restore.
        let stamp = Local::now().format("%Y-%m-%d_%H%M%S");
        let bak_path = with_extra_extension(path, &format!("{stamp}.bak"));
        // Two saves inside one second: the later content wins, and the one
        // it replaces is a second old.
        if bak_path.exists() {
            fs::remove_file(&bak_path)?;
        }
        fs::rename(path, &bak_path)?;
    }
    fs::rename(&tmp_path, path)?;
    // Pruning must never fail a save that already succeeded on disk.
    prune_backups(path);
    Ok(())
}

/// Keep the newest `KEPT_BACKUPS` previous versions next to the vault and
/// drop the rest — including the single `<name>.bak` that older builds
/// wrote, which sorts as the oldest and leaves on its own.
///
/// Sorting is by modification time rather than by the name, so a copy whose
/// stamp says one thing and whose content is another still lands in the
/// right order.
fn prune_backups(path: &Path) {
    let (Some(dir), Some(stem)) = (path.parent(), path.file_name().and_then(|n| n.to_str())) else {
        return;
    };
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    let mut backups: Vec<(std::time::SystemTime, std::path::PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let candidate = entry.path();
            let name = candidate.file_name()?.to_str()?;
            // `<stem>.bak` or `<stem>.<something>.bak`, and nothing else —
            // a plain prefix test would also match a different vault whose
            // name merely starts the same way.
            let rest = name.strip_prefix(stem)?;
            if rest != ".bak" && !(rest.starts_with('.') && rest.ends_with(".bak")) {
                return None;
            }
            Some((entry.metadata().ok()?.modified().ok()?, candidate))
        })
        .collect();

    backups.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, stale) in backups.into_iter().skip(KEPT_BACKUPS) {
        let _ = fs::remove_file(stale);
    }
}

/// "Misha.npass" + "bak" -> "Misha.npass.bak"
///
/// Also used with a stamped extension, giving "Misha.npass.2026-08-20_071530.bak".
fn with_extra_extension(path: &Path, ext: &str) -> std::path::PathBuf {
    let mut os_string = path.as_os_str().to_owned();
    os_string.push(".");
    os_string.push(ext);
    os_string.into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{PasswordEntry, VaultData};
    use uuid::Uuid;

    fn test_params() -> KdfParams {
        KdfParams {
            m_cost: 8 * 1024,
            t_cost: 1,
            p_cost: 1,
        }
    }

    fn sample_data() -> VaultData {
        let mut data = VaultData::default();
        data.passwords.push(PasswordEntry {
            id: Uuid::new_v4(),
            title: "Test service".into(),
            username: "misha".into(),
            password: "s3cr3t-p@ss".into(),
            email: "misha@example.com".into(),
            category: "Mail".into(),
            url: "https://example.com".into(),
            notes: "".into(),
            updated_at: 0,
        });
        data
    }

    #[test]
    fn header_roundtrip() {
        let header = VaultHeader {
            format_version: FORMAT_VERSION,
            kdf_params: test_params(),
            salt: crypto::generate_salt(),
            nonce: crypto::generate_nonce(),
        };
        let bytes = header.to_bytes();
        assert_eq!(bytes.len(), HEADER_LEN);
        assert_eq!(VaultHeader::from_bytes(&bytes).unwrap(), header);
    }

    #[test]
    fn create_save_load_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Test.npass");
        let data = sample_data();

        let (key, _) = create(&path, "master-password", &data, test_params()).unwrap();
        let (loaded, loaded_key, _header) = load(&path, "master-password").unwrap();

        assert_eq!(loaded, data);
        assert_eq!(*key, *loaded_key, "load must re-derive the same key");
    }

    #[test]
    fn wrong_password_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Test.npass");
        create(&path, "correct", &sample_data(), test_params()).unwrap();

        let err = load(&path, "incorrect").unwrap_err();
        assert!(matches!(err, VaultError::WrongPasswordOrCorrupted));
    }

    #[test]
    fn corrupted_file_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Test.npass");
        create(&path, "pw", &sample_data(), test_params()).unwrap();
        let original = fs::read(&path).unwrap();

        // Not a vault at all.
        fs::write(&path, b"garbage").unwrap();
        assert!(matches!(
            load(&path, "pw").unwrap_err(),
            VaultError::InvalidFormat
        ));

        // Unsupported future version.
        let mut bad_version = original.clone();
        bad_version[4] = 99;
        fs::write(&path, &bad_version).unwrap();
        assert!(matches!(
            load(&path, "pw").unwrap_err(),
            VaultError::UnsupportedVersion(99)
        ));

        // Tampered header field (salt byte) — AEAD must catch it.
        let mut bad_salt = original.clone();
        bad_salt[20] ^= 1;
        fs::write(&path, &bad_salt).unwrap();
        assert!(load(&path, "pw").is_err());

        // Tampered ciphertext.
        let mut bad_ct = original.clone();
        let last = bad_ct.len() - 1;
        bad_ct[last] ^= 1;
        fs::write(&path, &bad_ct).unwrap();
        assert!(matches!(
            load(&path, "pw").unwrap_err(),
            VaultError::WrongPasswordOrCorrupted
        ));

        // Truncated file.
        fs::write(&path, &original[..30]).unwrap();
        assert!(matches!(
            load(&path, "pw").unwrap_err(),
            VaultError::InvalidFormat
        ));
    }

    /// Every kept previous version of `path`, newest first.
    fn backups_of(path: &std::path::Path) -> Vec<std::path::PathBuf> {
        let stem = path.file_name().unwrap().to_str().unwrap();
        let mut found: Vec<(std::time::SystemTime, std::path::PathBuf)> =
            fs::read_dir(path.parent().unwrap())
                .unwrap()
                .flatten()
                .filter(|e| {
                    let name = e.file_name();
                    let name = name.to_str().unwrap_or_default().to_string();
                    name.starts_with(stem) && name.ends_with(".bak")
                })
                .map(|e| (e.metadata().unwrap().modified().unwrap(), e.path()))
                .collect();
        found.sort_by(|a, b| b.0.cmp(&a.0));
        found.into_iter().map(|(_, p)| p).collect()
    }

    #[test]
    fn only_the_newest_backups_survive_pruning() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Test.npass");
        fs::write(&path, b"current").unwrap();

        // Older builds wrote one unstamped backup; it has to age out too.
        fs::write(dir.path().join("Test.npass.bak"), b"legacy").unwrap();
        let stamps = [
            "2026-01-01_000000",
            "2026-01-02_000000",
            "2026-01-03_000000",
        ];
        for stamp in stamps {
            // Distinct modification times: pruning sorts by them, not by name.
            std::thread::sleep(std::time::Duration::from_millis(20));
            fs::write(dir.path().join(format!("Test.npass.{stamp}.bak")), stamp).unwrap();
        }
        // Belongs to another vault whose name merely starts the same way.
        fs::write(dir.path().join("Test.npass2.bak"), b"not ours").unwrap();

        prune_backups(&path);

        let gone = |name: &str| !dir.path().join(name).exists();
        let kept = |name: &str| dir.path().join(name).exists();

        assert!(kept("Test.npass"), "the vault itself is never touched");
        assert!(kept("Test.npass.2026-01-03_000000.bak"), "newest kept");
        assert!(
            kept("Test.npass.2026-01-02_000000.bak"),
            "second newest kept"
        );
        assert!(
            gone("Test.npass.2026-01-01_000000.bak"),
            "third oldest pruned"
        );
        assert!(gone("Test.npass.bak"), "legacy backup pruned as the oldest");
        assert!(kept("Test.npass2.bak"), "another vault is left alone");
    }

    #[test]
    fn save_creates_backup_and_nonce_changes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Test.npass");
        let params = test_params();
        let mut data = sample_data();

        let (key, _) = create(&path, "pw", &data, params).unwrap();
        let first_bytes = fs::read(&path).unwrap();
        let (_, _, first_header) = load(&path, "pw").unwrap();
        let salt = first_header.salt;

        data.passwords[0].title = "Renamed".into();
        save(&path, &data, &key, &salt, &params).unwrap();

        // The previous version is kept under a stamped name.
        let backups = backups_of(&path);
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read(&backups[0]).unwrap(), first_bytes);

        // New save picked a fresh nonce.
        let (_, _, second_header) = load(&path, "pw").unwrap();
        assert_ne!(first_header.nonce, second_header.nonce);

        // And no temp file is left behind.
        assert!(!with_extra_extension(&path, "tmp").exists());

        let (loaded, _, _) = load(&path, "pw").unwrap();
        assert_eq!(loaded.passwords[0].title, "Renamed");
    }
}
