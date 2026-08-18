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

use std::fs;
use std::path::Path;

use zeroize::Zeroizing;

use crate::crypto::{self, KdfParams, KEY_LEN, NONCE_LEN, SALT_LEN};
use crate::models::VaultData;

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
) -> Result<Zeroizing<[u8; KEY_LEN]>, VaultError> {
    let salt = crypto::generate_salt();
    let key = crypto::derive_key(password.as_bytes(), &salt, &kdf_params)?;
    save(path, data, &key, &salt, &kdf_params)?;
    Ok(key)
}

/// Encrypt `data` and atomically write it to `path`.
///
/// A fresh nonce is generated on every call. Write order:
/// 1. serialize + encrypt into a temp file next to the target,
/// 2. rename current file to `.npass.bak` (previous backup is replaced),
/// 3. rename temp file into place.
///
/// A crash at any point leaves either the old file or the old backup intact.
pub fn save(
    path: &Path,
    data: &VaultData,
    key: &[u8; KEY_LEN],
    salt: &[u8; SALT_LEN],
    kdf_params: &KdfParams,
) -> Result<(), VaultError> {
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

    atomic_write_with_backup(path, &file_bytes)
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
/// `<name>.bak`.
fn atomic_write_with_backup(path: &Path, bytes: &[u8]) -> Result<(), VaultError> {
    let tmp_path = with_extra_extension(path, "tmp");
    fs::write(&tmp_path, bytes)?;

    if path.exists() {
        let bak_path = with_extra_extension(path, "bak");
        // On Windows `rename` fails if the destination exists, so clear the
        // old backup first. Losing the *older* backup is fine — the current
        // file is about to become the new backup.
        if bak_path.exists() {
            fs::remove_file(&bak_path)?;
        }
        fs::rename(path, &bak_path)?;
    }
    fs::rename(&tmp_path, path)?;
    Ok(())
}

/// "Misha.npass" + "bak" -> "Misha.npass.bak"
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

        let key = create(&path, "master-password", &data, test_params()).unwrap();
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

    #[test]
    fn save_creates_backup_and_nonce_changes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Test.npass");
        let params = test_params();
        let mut data = sample_data();

        let key = create(&path, "pw", &data, params).unwrap();
        let first_bytes = fs::read(&path).unwrap();
        let (_, _, first_header) = load(&path, "pw").unwrap();
        let salt = first_header.salt;

        data.passwords[0].title = "Renamed".into();
        save(&path, &data, &key, &salt, &params).unwrap();

        // Backup holds the previous version.
        let bak_path = path.with_extension("npass.bak");
        assert!(bak_path.exists());
        assert_eq!(fs::read(&bak_path).unwrap(), first_bytes);

        // New save picked a fresh nonce.
        let (_, _, second_header) = load(&path, "pw").unwrap();
        assert_ne!(first_header.nonce, second_header.nonce);

        // And no temp file is left behind.
        assert!(!with_extra_extension(&path, "tmp").exists());

        let (loaded, _, _) = load(&path, "pw").unwrap();
        assert_eq!(loaded.passwords[0].title, "Renamed");
    }
}
