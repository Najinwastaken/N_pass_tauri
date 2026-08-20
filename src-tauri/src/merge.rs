//! Folding two copies of the same vault into one.
//!
//! Two copies drift apart whenever the file is written from more than one
//! place: a folder synced between machines, a backup restored while the app
//! is open. Writing one over the other loses everything the other had, and
//! loses it silently — which is the worst way to lose anything.
//!
//! The rules here are the ones KeePass settled on. Every entry carries the
//! time it last changed, every deletion leaves a tombstone behind, and the
//! newer of the two versions wins. Nothing is asked of the user: by the time
//! two edits of the same entry meet, one of them was already going to be
//! overwritten, and taking the later one is the best guess available.
//!
//! Everything in here is a pure function over data — no disk, no crypto —
//! so the rules can be tested exhaustively.

use std::collections::HashMap;

use uuid::Uuid;
use zeroize::Zeroize;

use crate::models::{CardEntry, KeyEntry, NoteEntry, PasswordEntry, Tombstone, VaultData};

/// How long a deletion is remembered. A tombstone dropped too early lets a
/// copy that never saw the deletion hand the entry back, so this is far
/// longer than any plausible round trip between two machines.
const GRAVE_TTL_SECS: i64 = 365 * 24 * 60 * 60;

/// What a merge changed, so the UI can say something happened.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct MergeReport {
    pub added: usize,
    pub updated: usize,
    pub removed: usize,
}

impl MergeReport {
    pub fn touched_nothing(&self) -> bool {
        self.added == 0 && self.updated == 0 && self.removed == 0
    }

    pub fn total(&self) -> usize {
        self.added + self.updated + self.removed
    }
}

/// An entry that can be matched with its counterpart in the other copy.
pub trait Mergeable {
    fn id(&self) -> Uuid;
    fn updated_at(&self) -> i64;
}

macro_rules! impl_mergeable {
    ($($t:ty),+ $(,)?) => { $(
        impl Mergeable for $t {
            fn id(&self) -> Uuid {
                self.id
            }
            fn updated_at(&self) -> i64 {
                self.updated_at
            }
        }
    )+ };
}

impl_mergeable!(PasswordEntry, CardEntry, NoteEntry, KeyEntry);

/// Fold `theirs` into `ours`. `theirs` is left empty and wiped: it holds
/// decrypted secrets, and whatever is not adopted must not linger in memory.
pub fn merge(ours: &mut VaultData, theirs: &mut VaultData, now: i64) -> MergeReport {
    let mut report = MergeReport::default();
    let graves = merge_graves(&mut ours.deleted, std::mem::take(&mut theirs.deleted), now);

    merge_list(
        &mut ours.passwords,
        std::mem::take(&mut theirs.passwords),
        &graves,
        &mut report,
    );
    merge_list(
        &mut ours.cards,
        std::mem::take(&mut theirs.cards),
        &graves,
        &mut report,
    );
    merge_list(
        &mut ours.notes,
        std::mem::take(&mut theirs.notes),
        &graves,
        &mut report,
    );
    merge_list(
        &mut ours.keys,
        std::mem::take(&mut theirs.keys),
        &graves,
        &mut report,
    );

    // Settings keep no per-field history, so the whole block goes to
    // whichever side changed it last. Losing the older set of preferences is
    // a far smaller loss than losing an entry, which is why entries get the
    // careful treatment and this does not.
    if theirs.settings_updated_at > ours.settings_updated_at {
        ours.settings = theirs.settings.clone();
        ours.settings_updated_at = theirs.settings_updated_at;
    }

    theirs.zeroize();
    report
}

/// Union of both sides' deletions, newest time per id, minus the ancient
/// ones. Returns the lookup used while merging the lists.
fn merge_graves(ours: &mut Vec<Tombstone>, theirs: Vec<Tombstone>, now: i64) -> HashMap<Uuid, i64> {
    let mut newest: HashMap<Uuid, i64> = ours.iter().map(|t| (t.id, t.at)).collect();
    for grave in theirs {
        newest
            .entry(grave.id)
            .and_modify(|at| *at = (*at).max(grave.at))
            .or_insert(grave.at);
    }

    *ours = newest
        .iter()
        .filter(|(_, &at)| now - at < GRAVE_TTL_SECS)
        .map(|(&id, &at)| Tombstone { id, at })
        .collect();
    // Stable order so the file does not churn between saves.
    ours.sort_by_key(|t| (t.at, t.id));

    newest
}

/// Merge one list in place. Order follows ours; entries only they have are
/// appended, which is the least surprising place for them to show up.
fn merge_list<T: Mergeable + Zeroize>(
    ours: &mut Vec<T>,
    theirs: Vec<T>,
    graves: &HashMap<Uuid, i64>,
    report: &mut MergeReport,
) {
    let buried = |id: Uuid, stamp: i64| graves.get(&id).is_some_and(|at| *at >= stamp);

    let mut index: HashMap<Uuid, usize> = ours
        .iter()
        .enumerate()
        .map(|(position, entry)| (entry.id(), position))
        .collect();

    for mut entry in theirs {
        let id = entry.id();

        // Deleted on one side after the other last touched it. An edit that
        // came *after* the deletion outlives it: someone reached for the
        // entry more recently than someone else threw it away.
        if buried(id, entry.updated_at()) {
            entry.zeroize();
            continue;
        }

        match index.get(&id) {
            Some(&position) => {
                if entry.updated_at() > ours[position].updated_at() {
                    let mut replaced = std::mem::replace(&mut ours[position], entry);
                    replaced.zeroize();
                    report.updated += 1;
                } else {
                    entry.zeroize();
                }
            }
            None => {
                index.insert(id, ours.len());
                ours.push(entry);
                report.added += 1;
            }
        }
    }

    // Their deletions now apply to what we still hold. Done by hand rather
    // than with `retain` so the removed entries can be wiped, not just
    // dropped.
    let mut position = 0;
    while position < ours.len() {
        if buried(ours[position].id(), ours[position].updated_at()) {
            let mut removed = ours.remove(position);
            removed.zeroize();
            report.removed += 1;
        } else {
            position += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Settings;

    fn password(id: Uuid, title: &str, updated_at: i64) -> PasswordEntry {
        PasswordEntry {
            id,
            title: title.to_string(),
            username: String::new(),
            password: "secret".into(),
            email: String::new(),
            category: String::new(),
            url: String::new(),
            notes: String::new(),
            updated_at,
        }
    }

    fn vault(passwords: Vec<PasswordEntry>) -> VaultData {
        VaultData {
            passwords,
            ..Default::default()
        }
    }

    fn titles(data: &VaultData) -> Vec<&str> {
        data.passwords.iter().map(|e| e.title.as_str()).collect()
    }

    #[test]
    fn an_entry_only_they_have_is_adopted() {
        let mut ours = vault(vec![password(Uuid::new_v4(), "ours", 100)]);
        let mut theirs = vault(vec![password(Uuid::new_v4(), "theirs", 100)]);

        let report = merge(&mut ours, &mut theirs, 1_000);

        assert_eq!(titles(&ours), vec!["ours", "theirs"]);
        assert_eq!(report.added, 1);
    }

    #[test]
    fn the_newer_edit_of_the_same_entry_wins() {
        let id = Uuid::new_v4();
        let mut ours = vault(vec![password(id, "old", 100)]);
        let mut theirs = vault(vec![password(id, "new", 200)]);

        let report = merge(&mut ours, &mut theirs, 1_000);

        assert_eq!(titles(&ours), vec!["new"]);
        assert_eq!(report.updated, 1);
        assert_eq!(report.added, 0);
    }

    #[test]
    fn an_older_edit_of_the_same_entry_is_ignored() {
        let id = Uuid::new_v4();
        let mut ours = vault(vec![password(id, "new", 200)]);
        let mut theirs = vault(vec![password(id, "old", 100)]);

        let report = merge(&mut ours, &mut theirs, 1_000);

        assert_eq!(titles(&ours), vec!["new"]);
        assert!(report.touched_nothing());
    }

    #[test]
    fn their_deletion_removes_our_copy() {
        let id = Uuid::new_v4();
        let mut ours = vault(vec![password(id, "doomed", 100)]);
        let mut theirs = VaultData {
            deleted: vec![Tombstone { id, at: 200 }],
            ..Default::default()
        };

        let report = merge(&mut ours, &mut theirs, 1_000);

        assert!(ours.passwords.is_empty());
        assert_eq!(report.removed, 1);
        assert_eq!(ours.deleted.len(), 1, "the deletion is remembered");
    }

    #[test]
    fn an_edit_after_a_deletion_brings_the_entry_back() {
        let id = Uuid::new_v4();
        // We kept editing it at t=300; they threw it away at t=200.
        let mut ours = vault(vec![password(id, "still wanted", 300)]);
        let mut theirs = VaultData {
            deleted: vec![Tombstone { id, at: 200 }],
            ..Default::default()
        };

        let report = merge(&mut ours, &mut theirs, 1_000);

        assert_eq!(titles(&ours), vec!["still wanted"]);
        assert!(report.touched_nothing());
    }

    #[test]
    fn our_deletion_is_not_undone_by_their_stale_copy() {
        let id = Uuid::new_v4();
        let mut ours = VaultData {
            deleted: vec![Tombstone { id, at: 200 }],
            ..Default::default()
        };
        let mut theirs = vault(vec![password(id, "deleted here", 100)]);

        let report = merge(&mut ours, &mut theirs, 1_000);

        assert!(ours.passwords.is_empty(), "it must stay deleted");
        assert!(report.touched_nothing());
    }

    #[test]
    fn settings_come_from_whichever_side_changed_them_last() {
        let mut ours = VaultData {
            settings: Settings {
                language: "en".into(),
                ..Default::default()
            },
            settings_updated_at: 100,
            ..Default::default()
        };
        let mut theirs = VaultData {
            settings: Settings {
                language: "uk".into(),
                ..Default::default()
            },
            settings_updated_at: 200,
            ..Default::default()
        };

        merge(&mut ours, &mut theirs, 1_000);

        assert_eq!(ours.settings.language, "uk");
        assert_eq!(ours.settings_updated_at, 200);
    }

    #[test]
    fn older_settings_do_not_win() {
        let mut ours = VaultData {
            settings: Settings {
                language: "en".into(),
                ..Default::default()
            },
            settings_updated_at: 300,
            ..Default::default()
        };
        let mut theirs = VaultData {
            settings: Settings {
                language: "uk".into(),
                ..Default::default()
            },
            settings_updated_at: 200,
            ..Default::default()
        };

        merge(&mut ours, &mut theirs, 1_000);

        assert_eq!(ours.settings.language, "en");
    }

    #[test]
    fn tombstones_are_pooled_and_the_ancient_ones_let_go() {
        let recent = Uuid::new_v4();
        let ancient = Uuid::new_v4();
        let mut ours = VaultData {
            deleted: vec![Tombstone { id: ancient, at: 0 }],
            ..Default::default()
        };
        let mut theirs = VaultData {
            deleted: vec![Tombstone {
                id: recent,
                at: GRAVE_TTL_SECS,
            }],
            ..Default::default()
        };

        merge(&mut ours, &mut theirs, GRAVE_TTL_SECS + 1);

        let kept: Vec<Uuid> = ours.deleted.iter().map(|t| t.id).collect();
        assert_eq!(kept, vec![recent], "a year-old deletion is forgotten");
    }

    #[test]
    fn the_other_copy_is_left_empty() {
        let mut ours = vault(vec![]);
        let mut theirs = vault(vec![password(Uuid::new_v4(), "theirs", 100)]);

        merge(&mut ours, &mut theirs, 1_000);

        assert!(
            theirs.passwords.is_empty(),
            "secrets must not be left behind"
        );
    }
}
