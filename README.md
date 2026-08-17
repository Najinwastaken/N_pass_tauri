# N-Pass

**English** | [Русский](README.ru.md)

N-Pass is a small, fast password manager that keeps all of your secrets
**on your own computer** — in one encrypted file. No account, no cloud,
no subscription, no telemetry. If you have never used a password manager
before, start with the next section.

![Rust](https://img.shields.io/badge/Rust-Tauri_2-orange) ![React](https://img.shields.io/badge/React-TypeScript-blue) ![Platform](https://img.shields.io/badge/Windows-x64-lightgrey)

---

## What is a password manager, in one minute

Instead of remembering dozens of passwords (or worse, reusing one), you
remember **a single master password**. Everything else — logins, bank
cards, notes, API keys — lives inside an encrypted vault that only your
master password can open. You copy what you need with one click, and the
app locks itself when you walk away.

Two things to understand before you start:

1. **Your master password is the only key.** It is never stored anywhere
   and can never be recovered. Forget it — and the data is gone. Write
   it down and keep it somewhere safe.
2. **Your data never leaves your computer** unless you set up a backup
   folder yourself. There are no servers involved.

## Installation

Grab the latest release from the [Releases](../../releases) page:

| File | What it is |
| --- | --- |
| `N-Pass_x.y.z_x64-setup.exe` | Installer — per-user, no admin rights needed |
| `n-pass.exe` | Portable (recommended) — just put it in a folder and run |

Requirements: Windows 10/11 x64 with WebView2 (already present on any
up-to-date system).

## First steps

1. Run N-Pass → click **New profile**.
2. Pick a name and a **master password** (the strength meter will tell
   you how good it is — aim for "Strong").
3. You are in. Add your first password with **Add**.
4. Click **Lock** (or press **Ctrl+L**) when you leave.

Each profile is one independent vault file — family members can each
have their own, protected by their own master password.

## Where is my data?

In the `vaults` folder **next to the executable**:

```
N-Pass/
├── n-pass.exe
└── vaults/
    ├── Misha.npass       ← your encrypted vault
    └── Misha.npass.bak   ← automatic copy of the previous version
```

A `.npass` file is fully self-contained: copy it to another machine,
open it with the same master password, and everything is there. This
also means **backing up = copying one file**.

## Everyday features

- **Search** everything with **Ctrl+F** — multiple words in any order;
  secure notes are searched by their full text as well.
- **Smart Ctrl+C**: click into any value in the list (login, URL…) and
  press Ctrl+C — the whole field is copied. Select a part — only the
  part is copied. Card expiry copies MM or YY depending on where the
  cursor stands; card numbers copy without separators.
- Every copy goes through the clipboard **auto-clear**: 30 seconds later
  (configurable) the clipboard is wiped — if it still holds what N-Pass
  put there.
- **Drag & drop** reordering with an insertion line; **Esc** cancels.
- **Auto-lock** after inactivity (default 10 min) and optionally on
  window minimize. Locking wipes the encryption key and the decrypted
  data from memory.
- **Backup to folder**: point it at a folder synced by Google Drive,
  Dropbox or OneDrive — the desktop sync client uploads your encrypted
  vault automatically after every change. The app itself never touches
  the network.
- Dark and light themes; English, Russian and Ukrainian interface.
- Built-in password **generator** (length, character classes) — plus a
  one-click ✨ button right in the entry form that fills the password
  field using your last generator settings.
- **Master password change** re-encrypts the vault with a fresh salt.

## Is it secure? (the technical part)

For readers who want the details:

- **File format** (`NPV1`, versioned): magic + format version + Argon2
  cost parameters + random salt + per-save random nonce, then the
  ciphertext. The whole header is authenticated (AAD) — any tampering
  breaks decryption.
- **Key derivation**: Argon2id, 64 MiB / t=3 / p=2 by default;
  parameters are stored per-file so future versions can strengthen them
  without breaking old vaults.
- **Encryption**: XChaCha20-Poly1305 (AEAD). The master password is
  verified only by successful decryption — no hash of it exists
  anywhere.
- **Memory hygiene**: the derived key and decrypted data live only in
  the Rust core, wrapped in `Zeroizing`, and are wiped on lock.
- **WebView boundary**: list views receive metadata only; a secret
  crosses into the UI exclusively on explicit action (reveal one field
  of one entry). "Copy password" moves vault → clipboard entirely
  inside Rust.
- **Writes are atomic** (temp file + rename) with a `.bak` of the
  previous version kept next to the vault.
- **Randomness**: OS CSPRNG (`OsRng`) only — salts, nonces, generated
  passwords.

## Building from source

Prerequisites: Rust (stable), Node.js 20+, WebView2 runtime.

```bash
npm install
npm run tauri dev      # development
npm run tauri build    # release bundles in src-tauri/target/release/bundle/
```

Tests for the crypto/storage core and command logic:

```bash
cd src-tauri && cargo test
```

The release profile is size-optimized (LTO, `opt-level = "s"`, stripped,
`panic = "abort"`): ~3.7 MB portable exe, ~1.4 MB installer.

## Non-goals

By design there is no cloud sync, no browser extension, no autofill and
no mobile app. N-Pass is a local vault: one small binary, one encrypted
file, zero network.
