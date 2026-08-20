//! Dev helper: creates a `Demo.npass` vault filled with sample entries of
//! every type, enough of them that every list scrolls, so the UI can be
//! tried at a realistic size without typing anything by hand. Not part of
//! the shipped app (Cargo excludes examples from the binary).
//!
//!     cd src-tauri && cargo run --example seed_demo
//!
//! Then unlock the "Demo" profile with the password `demo`.

use n_pass_lib::crypto::{self, KdfParams, PasswordOptions};
use n_pass_lib::models::{now_ts, CardEntry, KeyEntry, NoteEntry, PasswordEntry, VaultData};
use n_pass_lib::vault;
use uuid::Uuid;

const MASTER_PASSWORD: &str = "demo";

/// title, username, email, url, category
const SERVICES: &[(&str, &str, &str, &str, &str)] = &[
    ("GitHub", "Najin", "najin@example.com", "github.com", "Dev"),
    ("GitLab", "Najin", "najin@example.com", "gitlab.com", "Dev"),
    (
        "Gmail",
        "Najin",
        "najin@example.com",
        "mail.google.com",
        "Mail",
    ),
    (
        "Outlook",
        "Najin",
        "najin@example.org",
        "outlook.com",
        "Mail",
    ),
    (
        "Proton Mail",
        "Najin",
        "najin@example.org",
        "account.proton.me",
        "Mail",
    ),
    (
        "Steam",
        "Najin",
        "najin@example.com",
        "store.steampowered.com",
        "Games",
    ),
    (
        "Epic Games",
        "Najin",
        "najin@example.com",
        "store.epicgames.com",
        "Games",
    ),
    ("GOG", "Najin", "najin@example.com", "gog.com", "Games"),
    (
        "Battle.net",
        "Najin",
        "najin@example.org",
        "eu.shop.battle.net",
        "Games",
    ),
    (
        "Ubisoft Connect",
        "Najin",
        "najin@example.com",
        "ubisoft.com",
        "Games",
    ),
    (
        "PlayStation Network",
        "Najin",
        "najin@example.com",
        "playstation.com",
        "Games",
    ),
    (
        "Discord",
        "Najin",
        "najin@example.com",
        "www.discord.com/channels/@me",
        "Social",
    ),
    ("Telegram", "Najin", "", "web.telegram.org", "Social"),
    ("Slack", "Najin", "najin@example.com", "slack.com", "Work"),
    ("Zoom", "Najin", "najin@example.com", "zoom.us", "Work"),
    (
        "Netflix",
        "Najin",
        "family@example.org",
        "netflix.com",
        "Media",
    ),
    (
        "Spotify",
        "Najin",
        "najin@example.com",
        "open.spotify.com",
        "Media",
    ),
    (
        "YouTube",
        "Najin",
        "najin@example.com",
        "youtube.com",
        "Media",
    ),
    ("Twitch", "Najin", "najin@example.com", "twitch.tv", "Media"),
    (
        "Reddit",
        "Najin",
        "najin@example.com",
        "reddit.com",
        "Social",
    ),
    ("X", "Najin", "najin@example.com", "x.com", "Social"),
    (
        "LinkedIn",
        "Najin",
        "najin@example.org",
        "linkedin.com/in/najin",
        "Work",
    ),
    (
        "Amazon",
        "Najin",
        "najin@example.com",
        "amazon.com",
        "Shopping",
    ),
    ("eBay", "Najin", "najin@example.com", "ebay.com", "Shopping"),
    (
        "PayPal",
        "Najin",
        "najin@example.org",
        "paypal.com",
        "Shopping",
    ),
    (
        "Booking",
        "Najin",
        "najin@example.com",
        "booking.com",
        "Travel",
    ),
    (
        "Airbnb",
        "Najin",
        "najin@example.com",
        "airbnb.com",
        "Travel",
    ),
    (
        "Dropbox",
        "Najin",
        "najin@example.com",
        "dropbox.com",
        "Work",
    ),
    ("Notion", "Najin", "najin@example.com", "notion.so", "Work"),
    ("Figma", "Najin", "najin@example.org", "figma.com", "Dev"),
    (
        "Cloudflare",
        "Najin",
        "najin@example.com",
        "dash.cloudflare.com",
        "Dev",
    ),
    (
        "DigitalOcean",
        "Najin",
        "najin@example.org",
        "cloud.digitalocean.com",
        "Dev",
    ),
];

/// title, notes
const KEYS: &[(&str, &str)] = &[
    ("OpenAI API", "billing account, rotate every 90 days"),
    ("Anthropic API", "personal experiments"),
    ("Stripe (test)", "sandbox key, safe to share with staging"),
    ("Stripe (live)", "production, do not paste anywhere"),
    ("Cloudflare API token", "DNS edit only"),
    ("DigitalOcean token", "read/write, personal droplets"),
    ("AWS access key", "personal sandbox account"),
    ("GitHub token", "repo + workflow scopes"),
    ("Telegram bot token", "home automation bot"),
    ("Home Wi-Fi", "guest network is a separate entry"),
    ("Guest Wi-Fi", ""),
    ("Office Wi-Fi", "changes every quarter"),
    ("Router admin", "http://192.168.1.1"),
    ("NAS admin", "local only, no port forwarding"),
    ("Printer admin", "192.168.1.30"),
    ("SSH passphrase (laptop)", "id_ed25519"),
    ("SSH passphrase (server)", "deploy key"),
    ("SSH passphrase (backup)", "cold storage key"),
    ("GPG key passphrase", "signing commits"),
    ("Database password (staging)", "postgres, rotated monthly"),
    ("Database password (prod)", "postgres, rotation on request"),
    ("Windows license", "retail key, transferable"),
    ("Office license", "family subscription"),
    ("Game key (spare)", "gift copy, unused"),
    ("Backup recovery code", "printed copy in the folder"),
    ("2FA recovery codes (mail)", "one-time use, five left"),
];

/// title, provider, cardholder, expiry, cvv
const CARDS: &[(&str, &str, &str, &str, &str)] = &[
    ("Main debit", "Visa", "NAJIN MORGAN", "12/29", "123"),
    ("Salary card", "Mastercard", "NAJIN MORGAN", "03/28", "456"),
    ("Travel card", "Mastercard", "NAJIN MORGAN", "04/28", "789"),
    ("Online shopping", "Visa", "NAJIN MORGAN", "09/27", "321"),
    (
        "Work expenses",
        "American Express",
        "NAJIN MORGAN",
        "01/30",
        "1234",
    ),
    ("Savings", "Mastercard", "A MORGAN", "06/26", "654"),
    ("Family card", "Visa", "NAJIN MORGAN", "11/28", "987"),
    ("Subscriptions only", "Visa", "NAJIN MORGAN", "02/27", "246"),
    (
        "Crypto exchange",
        "Mastercard",
        "NAJIN MORGAN",
        "07/29",
        "135",
    ),
    ("Deposit card", "Мир", "NAJIN MORGAN", "05/30", "802"),
    ("Second bank", "Мир", "A MORGAN", "08/27", "911"),
    ("Backup card", "Visa", "NAJIN MORGAN", "10/26", "444"),
    (
        "Old card (closed)",
        "Maestro",
        "NAJIN MORGAN",
        "01/24",
        "555",
    ),
    ("Business account", "Visa", "MORGAN LTD", "12/28", "666"),
    (
        "Advertising budget",
        "Mastercard",
        "MORGAN LTD",
        "09/29",
        "777",
    ),
    ("Cashback card", "Visa", "NAJIN MORGAN", "04/30", "888"),
    ("Fuel card", "Mastercard", "NAJIN MORGAN", "03/27", "999"),
    ("Vacation fund", "Visa", "NAJIN MORGAN", "06/29", "112"),
    ("Kids account", "Мир", "SAM MORGAN", "07/28", "223"),
    ("Gift card (store)", "Visa", "GIFT", "12/26", "334"),
    ("Virtual card 1", "Visa", "NAJIN MORGAN", "02/28", "445"),
    (
        "Virtual card 2",
        "Mastercard",
        "NAJIN MORGAN",
        "05/28",
        "556",
    ),
];

/// Standard test card numbers — they belong to no one.
const TEST_NUMBERS: &[&str] = &[
    "4111111111111111",
    "5555555555554444",
    "4012888888881881",
    "378282246310005",
    "5105105105105100",
];

/// title, body
const NOTES: &[(&str, &str)] = &[
    ("Passport details", "Number: X0000000\nIssued: 01.01.2020\nExpires: 01.01.2030"),
    ("Driving licence", "Number 00-AA-000000, category B, valid until 2032"),
    ("Door codes", "Building: 1234\nGarage: 5678\nMailbox: 90"),
    ("Alarm code", "Disarm 4321, duress code 8765"),
    ("Insurance policy", "Policy AB-123456, hotline +1 000 000 00 00"),
    ("Health insurance", "Card number, clinic address, list of covered services"),
    ("Car details", "VIN, insurance dates, service every 15000 km"),
    ("Winter tyres", "Stored at the service, receipt number 4472"),
    ("Server notes", "Reverse proxy config lives in /etc/caddy\nCerts renew automatically"),
    ("Home network", "Static leases for the NAS and the printer\nGuest VLAN is isolated"),
    ("Backup plan", "Vault copy to the cloud folder, photos to the external disk monthly"),
    (
        "Borscht recipe",
        "Beetroot, cabbage, potatoes, onion, tomatoes, garlic.\nSimmer for 40 minutes, add garlic at the very end.",
    ),
    ("Pizza dough", "500 g flour, 325 ml water, 10 g salt, 3 g yeast. Cold rise 24 h."),
    ("Coffee ratios", "V60: 15 g coffee, 250 ml water, 94 C, 2:30 total"),
    ("Gift ideas", "Coffee grinder, mechanical keyboard, hiking socks"),
    ("Books to read", "Designing Data-Intensive Applications\nThe Rust Programming Language"),
    ("Films to watch", "Arrival, Whiplash, The Handmaiden, Perfect Days"),
    ("Trip checklist", "Documents, chargers, adapters, medicine, offline maps"),
    ("Packing list (hiking)", "Tent, sleeping bag, gas, first aid kit, water filter"),
    ("Bank support", "Card blocking hotline and the reference number for the last claim"),
    ("Warranty receipts", "Laptop until 2027, monitor until 2026, phone until 2025"),
    ("Subscriptions", "Music, storage, domain renewals with their dates"),
    ("Domain renewals", "example.com renews in March, example.org in September"),
    ("Emergency contacts", "Neighbour, plumber, electrician, vet"),
    ("Measurements", "Window sizes for blinds, shelf depth, doorway width"),
    ("Wine notes", "Liked: Sicilian red, dry riesling. Avoid: heavy oaked chardonnay."),
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
    let secret = || {
        crypto::generate_password(&opts)
            .expect("generate")
            .to_string()
    };

    let mut data = VaultData::default();

    for (title, username, email, url, category) in SERVICES {
        data.passwords.push(PasswordEntry {
            id: Uuid::new_v4(),
            title: (*title).to_string(),
            username: (*username).to_string(),
            password: secret(),
            email: (*email).to_string(),
            category: (*category).to_string(),
            url: (*url).to_string(),
            notes: String::new(),
            updated_at: now_ts(),
        });
    }

    for (title, notes) in KEYS {
        data.keys.push(KeyEntry {
            id: Uuid::new_v4(),
            title: (*title).to_string(),
            key: secret(),
            notes: (*notes).to_string(),
            updated_at: now_ts(),
        });
    }

    for (i, (title, provider, cardholder, expiry, cvv)) in CARDS.iter().enumerate() {
        data.cards.push(CardEntry {
            id: Uuid::new_v4(),
            title: (*title).to_string(),
            provider: (*provider).to_string(),
            cardholder: (*cardholder).to_string(),
            number: TEST_NUMBERS[i % TEST_NUMBERS.len()].to_string(),
            expiry: (*expiry).to_string(),
            cvv: (*cvv).to_string(),
            notes: String::new(),
            updated_at: now_ts(),
        });
    }

    for (title, body) in NOTES {
        data.notes.push(NoteEntry {
            id: Uuid::new_v4(),
            title: (*title).to_string(),
            body: (*body).to_string(),
            updated_at: now_ts(),
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
