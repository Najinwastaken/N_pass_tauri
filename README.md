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

> **"Windows protected your PC" on first launch?** That blue window
> appears for every program without a paid code-signing certificate, and
> N-Pass does not have one. Click **More info → Run anyway**. If you would
> rather not take anyone's word for it, you can build the app yourself
> from this source code — see the last section.

## First steps

1. Run N-Pass → click **New profile**.
2. Pick a name and a **master password** (the strength meter will tell
   you how good it is — aim for "Strong").
3. You are in. Add your first password with **Add**.
4. Click **Lock** (or press **Ctrl+L**) when you leave.

Each profile is one independent vault file — family members can each
have their own, protected by their own master password.

## Choosing a master password

This is the one password you will actually have to remember, so it is
worth a minute of thought:

- **Longer beats weirder.** Four random words — `coffee-anchor-violet-lamp`
  — are both easier to remember and harder to crack than `P@ssw0rd!`.
- **Do not reuse it** from any website. If that site leaks, your vault
  should not be affected.
- **Write it down on paper** and put it where you keep documents. This is
  not paranoia: there is no "reset password" link anywhere, and nobody —
  including the author of this app — can open your vault without it.
- Do not store it in a text file on the same computer.

You can change it later at any time: **Settings → Master password →
Change**. The vault is then re-encrypted with the new one.

## What goes in each section

| Section | What to keep there |
| --- | --- |
| **Passwords** | Website and app logins: title, username, e-mail, password, link, notes |
| **Passkeys** | Any single secret string: API key, license key, Wi-Fi password, recovery code |
| **Credit Cards** | Card number, cardholder, expiry, CVV, payment network |
| **Secure Notes** | Free-form text: passport details, door codes, anything private |

> A note on the name: **Passkeys** here means "keys" in the plain sense —
> long secret strings you paste somewhere. It is not the WebAuthn
> passwordless login standard; N-Pass does not create those.

## Using a saved password day to day

N-Pass does not type passwords into websites for you (no browser
extension, no autofill — see [Non-goals](#non-goals)). The everyday loop
is copy-and-paste, and it takes about three seconds:

1. Find the entry — start typing in the search box or press **Ctrl+F**.
2. Click the **copy** icon (⧉) on the right side of the row. Nothing is
   shown on screen; the password goes straight to the clipboard.
3. Switch to the website and paste with **Ctrl+V**.
4. Forget about it — the clipboard clears itself 30 seconds later, so the
   password does not linger there for the rest of the day.

Need to *see* a password instead of copying it (to type it on a phone,
for example)? Click the **eye** icon — the value appears in the row and
hides again on the second click.

To copy something other than the password — a login, an e-mail, a link —
hover over that value and use the small copy button that appears next to
it, or click into the value and press **Ctrl+C**.

## Where is my data?

In the `vaults` folder **next to the executable**:

```
N-Pass/
├── n-pass.exe
├── window-state.json     ← remembered window size/position (safe to delete)
└── vaults/
    ├── Najin.npass       ← your encrypted vault
    └── Najin.npass.bak   ← automatic copy of the previous version
```

A `.npass` file is fully self-contained: copy it to another machine,
open it with the same master password, and everything is there. This
also means **backing up = copying one file**.

## Backups and recovery

There are three layers of safety, and it is worth knowing what each one
does — they are not interchangeable.

**1. The `.bak` file — protection against a broken write.** Every time
something is saved, N-Pass writes the new version to a temporary file
first, turns the current vault into `.bak`, and only then puts the new
file in place. So even if the power goes out mid-save, a complete,
readable vault always exists on disk. To go back to it: close N-Pass,
rename `Najin.npass` to something else, rename `Najin.npass.bak` to
`Najin.npass`, start the app.

⚠️ **The `.bak` file is not an undo.** It holds the state from exactly
one save ago, and *every* change saves — adding an entry, editing,
reordering, even flipping a setting. If you delete an entry by accident
and then do anything else, that deletion is already in the `.bak` too.
For that, use layer 2 or 3.

**2. Backup folder (Settings → Backup folder) — protection against
losing the computer.** Choose a folder synced by Google Drive, Dropbox or
OneDrive, and N-Pass drops a copy of the encrypted vault there after
every change; the sync client uploads it. As a bonus, those services keep
their own file history, so their web interface can restore *yesterday's*
version — that is what actually saves you from an accidental deletion.

**3. Copying the file yourself — the simplest one.** Any copy of
`Najin.npass` on a flash drive or another disk is a full backup. It opens
with the master password that was in use when the copy was made.

⚠️ One thing people forget: if you changed your master password, older
copies (including `.bak`) still open with the **old** one — they were
encrypted with it. A file that looks "broken" is often just waiting for
the previous password.

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
- **Open URL**: the ↗ button (or a right-click on the link) opens the
  site in your browser. Write the address however you like — `discord.com`,
  `www.discord.com` or the full `https://…`; N-Pass sorts it out.
- **Drag & drop** reordering with an insertion line; **Esc** cancels.
- **Auto-lock** after inactivity (default 10 min) and optionally on
  window minimize. Locking wipes the encryption key and the decrypted
  data from memory.
- **Backup to folder**: point it at a folder synced by Google Drive,
  Dropbox or OneDrive — the desktop sync client uploads your encrypted
  vault automatically after every change. The app itself never touches
  the network.
- Dark and light themes; English, Russian and Ukrainian interface.
- The window opens sized for your monitor on the first run, then
  remembers the size and position you give it (Settings → Reset window
  brings the default back).
- **Secrets stay masked.** A value is shown only when you click the eye,
  and every existing entry opens masked again — revealing is always your
  explicit choice. The one exception is the password field of a *new*
  entry: it remembers whether you last left it visible. The reason is the
  cost of a slip — an exposed password is one click from being
  regenerated, while an issued key or a card CVV is not, so those always
  start hidden. The generator page has its own eye, also remembered.
- Built-in password **generator** (length, character classes) — plus a
  one-click ✨ button right in the entry form that fills the password
  field using your last generator settings.
- **Master password change** re-encrypts the vault with a fresh salt.

## Keyboard shortcuts

| Shortcut | What it does |
| --- | --- |
| **Ctrl+F** | Jump to the search box |
| **Ctrl+C** | Copy the field the cursor is in (or just the selected part) |
| **Ctrl+L** | Lock the vault immediately |
| **Esc** | Clear the search / cancel a drag / close a menu |

## Questions people ask

**I forgot my master password. What now?**
Nothing can be done — that is the whole point of the design. The password
is not stored anywhere, not even as a hash, so there is nothing to reset
or recover. The data in the vault is lost. This is why the app nags you
to write the password down.

**Is it safe to keep my vault in Google Drive / Dropbox?**
Yes, that is exactly what the backup folder is for. The file leaves your
computer already encrypted, and the cloud provider only ever sees
meaningless bytes. Just make sure the master password itself is strong —
a copy in the cloud is a copy someone could, in theory, try to crack
offline.

**How do I move everything to a new computer?**
Copy the whole N-Pass folder (or just the `.npass` file into the `vaults`
folder on the new machine) and open it with the same master password.
Nothing needs to be exported or imported.

**Does it fill passwords into websites automatically?**
No, and it will not — no browser extension, no autofill. Copy and paste
is the intended workflow.

**Someone got my `.npass` file. Should I panic?**
Without your master password the file is useless: it is a blob of
authenticated ciphertext, and there is no shortcut around the key
derivation. Still, if you suspect a copy leaked, change the master
password (**Settings → Master password**) — the vault is re-encrypted
with a new key, so the leaked copy stays frozen at its old contents and
old password.

**My antivirus is suspicious of the file.**
Unsigned executables from small projects trigger heuristics fairly often.
The code is fully open — you can read it and build the app yourself.

**Can I use one profile on two computers at once?**
You can keep a copy on both, but there is no sync or merge: whichever
copy is saved last wins. Treat it as one file you carry around, not as a
shared database.

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
