//! Dev helper: creates a `Demo.npass` vault filled with sample entries of
//! every type (passwords, keys, cards, notes) so
//! the UI can be tried at a realistic size without typing everything by
//! hand. Not part of the shipped app (examples are excluded from builds).
//!
//!     cd src-tauri && cargo run --example seed_demo
//!
//! Then unlock the "Demo" profile with the password `demo`.

use n_pass_lib::crypto::{self, KdfParams, PasswordOptions};
use n_pass_lib::models::{CardEntry, KeyEntry, NoteEntry, PasswordEntry, VaultData};
use n_pass_lib::vault;
use uuid::Uuid;

const MASTER_PASSWORD: &str = "demo";

/// title, username, email, url
const SERVICES: &[(&str, &str, &str, &str)] = &[
    ("GitHub", "alex.morgan", "alex@example.com", "github.com"),
    ("GitLab", "alex.morgan", "alex@example.com", "gitlab.com"),
    ("Gmail", "alex.morgan", "alex@example.com", "mail.google.com"),
    ("Outlook", "a.morgan", "alex@example.org", "outlook.com"),
    ("Steam", "alexm_92", "alex@example.com", "store.steampowered.com"),
    ("Epic Games", "alexm", "alex@example.com", "store.epicgames.com"),
    ("GOG", "alexm92", "alex@example.com", "gog.com"),
    ("Battle.net", "alexm#2184", "alex@example.org", "eu.shop.battle.net"),
    ("Ubisoft Connect", "alex.morgan", "alex@example.com", "ubisoft.com"),
    ("Discord", "alexm", "alex@example.com", "www.discord.com/channels/@me"),
    ("Telegram", "+10000000000", "", "web.telegram.org"),
    ("Slack", "alex.morgan", "alex@example.com", "slack.com"),
    ("Netflix", "family", "family@example.org", "netflix.com"),
    ("Spotify", "alexm92", "alex@example.com", "open.spotify.com"),
    ("YouTube", "alex.morgan", "alex@example.com", "youtube.com"),
    ("Reddit", "not_alex", "alex@example.com", "reddit.com"),
    ("Twitch", "alexm_live", "alex@example.com", "twitch.tv"),
    ("Amazon", "alex.morgan", "alex@example.com", "amazon.com"),
    ("PayPal", "alex.morgan", "alex@example.org", "paypal.com"),
    ("Cloudflare", "alex.morgan", "alex@example.com", "dash.cloudflare.com"),
];

/// title, notes
const KEYS: &[(&str, &str)] = &[
    ("OpenAI API", "billing account, rotate every 90 days"),
    ("Stripe (test)", "sandbox key, safe to share with staging"),
    ("Cloudflare API token", "DNS edit only"),
    ("AWS access key", "personal sandbox account"),
    ("Home Wi-Fi", "guest network is a separate entry"),
    ("Guest Wi-Fi", ""),
    ("Router admin", "http://192.168.1.1"),
    ("NAS admin", "local only, no port forwarding"),
    ("SSH passphrase (laptop)", "id_ed25519"),
    ("SSH passphrase (server)", "deploy key"),
    ("Windows license", "retail key, transferable"),
    ("Backup recovery code", "printed copy in the folder"),
];

/// title, provider, cardholder, number, expiry, cvv
const CARDS: &[(&str, &str, &str, &str, &str, &str)] = &[
    ("Main debit", "Visa", "ALEX MORGAN", "4111111111111111", "12/29", "123"),
    ("Travel card", "Mastercard", "ALEX MORGAN", "5555555555554444", "04/28", "456"),
    ("Online shopping", "Visa", "ALEX MORGAN", "4012888888881881", "09/27", "789"),
    ("Work expenses", "American Express", "ALEX MORGAN", "378282246310005", "01/30", "1234"),
    ("Savings", "Mastercard", "A MORGAN", "5105105105105100", "06/26", "321"),
];

/// title, body
const NOTES: &[(&str, &str)] = &[
    ("Passport details", "Number: X0000000
Issued: 01.01.2020
Expires: 01.01.2030"),
    ("Door codes", "Building: 1234
Garage: 5678
Mailbox: 90"),
    ("Insurance policy", "Policy AB-123456, hotline +1 000 000 00 00"),
    ("Server notes", "Reverse proxy config lives in /etc/caddy
Certs renew automatically"),
    ("Borscht recipe", "Beetroot, cabbage, potatoes, onion, tomatoes, garlic.
Simmer for 40 minutes, add garlic at the very end."),
    ("Gift ideas", "Coffee grinder, mechanical keyboard, hiking socks"),
    ("Car details", "VIN, insurance dates, service every 15000 km"),
    ("Bank support", "Card blocking hotline and the reference number for the last claim"),
];

fn main() {
    // Examples land in target/<profile>/examples, while the app looks for
    // vaults next to its own binary one level up.
    let mut exe_dir = std::env::current_exe()
        .expect("current exe")
        .parent()
        .expect("exe dir")
        .to_path_buf();
    if exe_dir.file_name().is_some_and(|n| n == "examples") {
        exe_dir.pop();
    }
    let dir = exe_dir.join("vaults");
    std::fs::create_dir_all(&dir).expect("create vaults dir");
    let path = dir.join("Demo.npass");

    let opts = PasswordOptions {
        length: 18,
        lowercase: true,
        uppercase: true,
        digits: true,
        symbols: true,
    };

    let mut data = VaultData::default();
    for (title, username, email, url) in SERVICES {
        data.passwords.push(PasswordEntry {
            id: Uuid::new_v4(),
            title: (*title).to_string(),
            username: (*username).to_string(),
            password: crypto::generate_password(&opts).expect("generate").to_string(),
            email: (*email).to_string(),
            url: (*url).to_string(),
            notes: String::new(),
        });
    }

    for (title, notes) in KEYS {
        data.keys.push(KeyEntry {
            id: Uuid::new_v4(),
            title: (*title).to_string(),
            key: crypto::generate_password(&opts).expect("generate").to_string(),
            notes: (*notes).to_string(),
        });
    }

    for (title, provider, cardholder, number, expiry, cvv) in CARDS {
        data.cards.push(CardEntry {
            id: Uuid::new_v4(),
            title: (*title).to_string(),
            provider: (*provider).to_string(),
            cardholder: (*cardholder).to_string(),
            number: (*number).to_string(),
            expiry: (*expiry).to_string(),
            cvv: (*cvv).to_string(),
            notes: String::new(),
        });
    }

    for (title, body) in NOTES {
        data.notes.push(NoteEntry {
            id: Uuid::new_v4(),
            title: (*title).to_string(),
            body: (*body).to_string(),
        });
    }

    vault::create(&path, MASTER_PASSWORD, &data, KdfParams::default()).expect("create vault");

    println!(
        "created {}: {} passwords, {} keys, {} cards, {} notes",
        path.display(),
        data.passwords.len(),
        data.keys.len(),
        data.cards.len(),
        data.notes.len(),
    );
    println!("profile: Demo   master password: {MASTER_PASSWORD}");
}
