//! Cryptographic primitives: key derivation, AEAD encryption, password generation.
//!
//! Security invariants enforced here:
//! - The master password is verified *only* by attempting decryption
//!   (Poly1305 tag check). No password hash is ever stored.
//! - All key material lives in `Zeroizing<...>` wrappers so it is wiped
//!   from memory when dropped.
//! - Randomness (salt, nonce, generated passwords) comes exclusively
//!   from the OS CSPRNG (`OsRng`).

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use rand::{rngs::OsRng, seq::SliceRandom, Rng, RngCore};
use zeroize::Zeroizing;

use crate::vault::VaultError;

pub const KEY_LEN: usize = 32;
pub const SALT_LEN: usize = 16;
pub const NONCE_LEN: usize = 24;

/// Argon2id cost parameters. Stored in the vault header so files created
/// with weaker/stronger settings keep working after we change the defaults.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KdfParams {
    /// Memory cost in KiB (argon2 crate convention).
    pub m_cost: u32,
    /// Number of iterations.
    pub t_cost: u32,
    /// Parallelism (lanes).
    pub p_cost: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        // 64 MiB, 3 iterations, 2 lanes — interactive-use recommendation.
        Self {
            m_cost: 64 * 1024,
            t_cost: 3,
            p_cost: 2,
        }
    }
}

/// Derive a 32-byte encryption key from the master password.
///
/// `Zeroizing<[u8; 32]>` is a wrapper that overwrites the bytes with zeros
/// when the value goes out of scope, so the key does not linger in freed
/// memory.
pub fn derive_key(
    password: &[u8],
    salt: &[u8; SALT_LEN],
    params: &KdfParams,
) -> Result<Zeroizing<[u8; KEY_LEN]>, VaultError> {
    let argon_params = Params::new(params.m_cost, params.t_cost, params.p_cost, Some(KEY_LEN))
        .map_err(|e| VaultError::Kdf(e.to_string()))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);

    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    argon2
        .hash_password_into(password, salt, key.as_mut())
        .map_err(|e| VaultError::Kdf(e.to_string()))?;
    Ok(key)
}

/// Generate a fresh random salt for a new vault file.
pub fn generate_salt() -> [u8; SALT_LEN] {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    salt
}

/// Generate a fresh random nonce. Called on EVERY save — reusing a nonce
/// with the same key would break XChaCha20-Poly1305 confidentiality.
/// 24-byte (X-variant) nonces make random generation safe: collision
/// probability is negligible.
pub fn generate_nonce() -> [u8; NONCE_LEN] {
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);
    nonce
}

/// Encrypt `plaintext` with XChaCha20-Poly1305.
///
/// `aad` (additional authenticated data) is not encrypted but IS covered by
/// the authentication tag. We pass the whole file header here, so any
/// tampering with magic/version/KDF params/salt/nonce makes decryption fail.
pub fn encrypt(
    key: &[u8; KEY_LEN],
    nonce: &[u8; NONCE_LEN],
    plaintext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, VaultError> {
    let cipher = XChaCha20Poly1305::new(key.into());
    cipher
        .encrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| VaultError::Crypto)
}

/// Decrypt and authenticate. A wrong password, corrupted ciphertext or
/// tampered header all end up here as `VaultError::WrongPasswordOrCorrupted` —
/// AEAD cannot distinguish these cases, which is exactly what we want
/// (no oracle for attackers).
///
/// The plaintext (decrypted JSON with all secrets) is returned in a
/// `Zeroizing` buffer so it is wiped after use.
pub fn decrypt(
    key: &[u8; KEY_LEN],
    nonce: &[u8; NONCE_LEN],
    ciphertext: &[u8],
    aad: &[u8],
) -> Result<Zeroizing<Vec<u8>>, VaultError> {
    let cipher = XChaCha20Poly1305::new(key.into());
    cipher
        .decrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .map(Zeroizing::new)
        .map_err(|_| VaultError::WrongPasswordOrCorrupted)
}

/// Character classes for the password generator.
#[derive(Debug, Clone, Copy)]
pub struct PasswordOptions {
    pub length: usize,
    pub lowercase: bool,
    pub uppercase: bool,
    pub digits: bool,
    pub symbols: bool,
}

const LOWER: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
const UPPER: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS: &[u8] = b"0123456789";
const SYMBOLS: &[u8] = b"!@#$%^&*()-_=+[]{};:,.<>?/";

/// Generate a random password using the OS CSPRNG only.
///
/// Guarantees at least one character from every enabled class (when length
/// allows), then fills the rest uniformly from the combined alphabet and
/// shuffles, so the guaranteed characters are not at predictable positions.
pub fn generate_password(opts: &PasswordOptions) -> Result<Zeroizing<String>, VaultError> {
    let mut classes: Vec<&[u8]> = Vec::new();
    if opts.lowercase {
        classes.push(LOWER);
    }
    if opts.uppercase {
        classes.push(UPPER);
    }
    if opts.digits {
        classes.push(DIGITS);
    }
    if opts.symbols {
        classes.push(SYMBOLS);
    }
    if classes.is_empty() || opts.length == 0 {
        return Err(VaultError::InvalidPasswordOptions);
    }

    let alphabet: Vec<u8> = classes.concat();
    let mut rng = OsRng;
    let mut bytes: Vec<u8> = Vec::with_capacity(opts.length);

    // One guaranteed char per class (as far as length allows).
    for class in classes.iter().take(opts.length) {
        bytes.push(class[rng.gen_range(0..class.len())]);
    }
    while bytes.len() < opts.length {
        bytes.push(alphabet[rng.gen_range(0..alphabet.len())]);
    }
    bytes.shuffle(&mut rng);

    // All source alphabets are ASCII, so this cannot fail.
    Ok(Zeroizing::new(String::from_utf8(bytes).expect("ASCII only")))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Tiny Argon2 params so tests stay fast; production defaults are
    /// exercised implicitly through `KdfParams::default()` in real use.
    pub(crate) fn test_kdf_params() -> KdfParams {
        KdfParams {
            m_cost: 8 * 1024, // 8 MiB
            t_cost: 1,
            p_cost: 1,
        }
    }

    #[test]
    fn derive_key_is_deterministic_and_salt_sensitive() {
        let params = test_kdf_params();
        let salt_a = [7u8; SALT_LEN];
        let salt_b = [8u8; SALT_LEN];

        let k1 = derive_key(b"password", &salt_a, &params).unwrap();
        let k2 = derive_key(b"password", &salt_a, &params).unwrap();
        let k3 = derive_key(b"password", &salt_b, &params).unwrap();
        let k4 = derive_key(b"different", &salt_a, &params).unwrap();

        assert_eq!(*k1, *k2, "same password+salt must give same key");
        assert_ne!(*k1, *k3, "different salt must give different key");
        assert_ne!(*k1, *k4, "different password must give different key");
    }

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = [42u8; KEY_LEN];
        let nonce = generate_nonce();
        let aad = b"header bytes";
        let ct = encrypt(&key, &nonce, b"secret data", aad).unwrap();
        assert_ne!(&ct[..], b"secret data");
        let pt = decrypt(&key, &nonce, &ct, aad).unwrap();
        assert_eq!(&pt[..], b"secret data");
    }

    #[test]
    fn decrypt_fails_on_wrong_key_ciphertext_or_aad() {
        let key = [42u8; KEY_LEN];
        let wrong_key = [43u8; KEY_LEN];
        let nonce = generate_nonce();
        let ct = encrypt(&key, &nonce, b"secret", b"aad").unwrap();

        assert!(decrypt(&wrong_key, &nonce, &ct, b"aad").is_err());
        assert!(decrypt(&key, &nonce, &ct, b"tampered aad").is_err());

        let mut bad_ct = ct.clone();
        bad_ct[0] ^= 1;
        assert!(decrypt(&key, &nonce, &bad_ct, b"aad").is_err());
    }

    #[test]
    fn generated_password_respects_options() {
        let opts = PasswordOptions {
            length: 30,
            lowercase: true,
            uppercase: true,
            digits: true,
            symbols: true,
        };
        let pw = generate_password(&opts).unwrap();
        assert_eq!(pw.len(), 30);
        assert!(pw.bytes().any(|b| LOWER.contains(&b)));
        assert!(pw.bytes().any(|b| UPPER.contains(&b)));
        assert!(pw.bytes().any(|b| DIGITS.contains(&b)));
        assert!(pw.bytes().any(|b| SYMBOLS.contains(&b)));

        let digits_only = PasswordOptions {
            length: 8,
            lowercase: false,
            uppercase: false,
            digits: true,
            symbols: false,
        };
        let pin = generate_password(&digits_only).unwrap();
        assert!(pin.bytes().all(|b| DIGITS.contains(&b)));

        let none = PasswordOptions {
            length: 8,
            lowercase: false,
            uppercase: false,
            digits: false,
            symbols: false,
        };
        assert!(generate_password(&none).is_err());
    }
}
