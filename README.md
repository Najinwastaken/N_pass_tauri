# N-Pass

Local, offline password manager built with **Rust + Tauri 2 + React**.
One encrypted file per profile, no accounts, no cloud, no telemetry.

## Security model

- **Storage**: each profile is a single self-contained `.npass` file.
  Copy it to another machine and open it with the same master password.
- **Format** (`NPV1`, versioned): magic + format version + Argon2 cost
  parameters + per-file random salt + per-save random nonce, followed by
  the ciphertext. The whole header is authenticated as AAD — tampering
  with any header field breaks decryption.
- **KDF**: Argon2id (64 MiB, t=3, p=2 by default; parameters are stored
  in the file so they can be strengthened later without breaking old
  vaults).
- **AEAD**: XChaCha20-Poly1305. The master password is verified only by
  successful decryption — no password hash is stored anywhere.
- **Memory**: the derived key and decrypted data live only in the Rust
  side, wrapped in `Zeroizing`, and are wiped on lock, auto-lock and exit.
- **WebView boundary**: entry lists never contain secrets; a secret
  crosses into the UI only on explicit action (reveal one field of one
  entry). "Copy password/number/CVV/key" goes vault → clipboard entirely
  inside Rust.
- **Clipboard**: auto-cleared after a configurable delay (default 30 s),
  only if it still holds what we put there.
- **Writes**: atomic (temp file + rename) with a `.npass.bak` backup of
  the previous version.
- **Randomness**: OS CSPRNG (`OsRng`) only — for salts, nonces and the
  password generator.

## Features

- Profiles (one vault file each), create / unlock / lock, auto-lock by
  inactivity and optionally on window minimize, master password change
  (re-encrypts with a fresh salt).
- Entry types: passwords, passkeys/API keys, credit cards (with payment
  network auto-detection), secure notes.
- Column lists with copyable read-only cells: click to place the cursor,
  smart **Ctrl+C** (no selection = whole field), hover copy button,
  search with **Ctrl+F**, drag&drop reordering with an insertion
  indicator (Esc cancels).
- Signature details: card expiry cell copies MM or YY depending on the
  cursor position; card number copies without separators; per-field
  reveal (echo mode); shake animation on invalid input; "Open URL" in
  the context menu.
- Password generator (OsRng, length + character classes, auto-regen).
- Dark / light theme, frameless translucent window with a custom
  titlebar and an animated neon border.

## Development

Prerequisites: Rust (stable), Node.js 20+, WebView2 runtime.

```bash
npm install
npm run tauri dev
```

Core crypto/storage tests:

```bash
cd src-tauri && cargo test
```

## Release build

```bash
npm run tauri build
```

Produces a ~3.5 MB portable exe and ~1.5 MB installers (NSIS + MSI) in
`src-tauri/target/release/bundle/`. Release profile is size-optimized
(LTO, `opt-level = "s"`, stripped, `panic = "abort"`).

## Non-goals (v1)

No cloud sync, no browser extensions, no autofill. This is a local vault
by design.
