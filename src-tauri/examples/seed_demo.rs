//! Dev helper: creates a `Demo.npass` vault filled with sample entries so
//! the UI can be tried at a realistic size without typing everything by
//! hand. Not part of the shipped app (examples are excluded from builds).
//!
//!     cd src-tauri && cargo run --example seed_demo
//!
//! Then unlock the "Demo" profile with the password `demo`.

use n_pass_lib::crypto::{self, KdfParams, PasswordOptions};
use n_pass_lib::models::{PasswordEntry, VaultData};
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

    vault::create(&path, MASTER_PASSWORD, &data, KdfParams::default()).expect("create vault");

    println!("created {} with {} entries", path.display(), data.passwords.len());
    println!("profile: Demo   master password: {MASTER_PASSWORD}");
}
