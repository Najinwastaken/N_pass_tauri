// Which category groups are folded, remembered across restarts.
//
// Category names are vault content, so they must not sit in the clear
// outside the encrypted file. Only a fingerprint of each name is stored:
// enough to recognise a category we already know, not enough to read the
// list back out. To be clear about what that buys — it stops the folder
// from showing at a glance how the vault is organised; it is not proof
// against someone who deliberately tests guessed names against the hashes.

const KEY = "collapsedCategories";

/** FNV-1a, 32 bit. Not a security hash — see the note above. */
export function categoryKey(name: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Per profile, because vaults carry different categories. */
type Store = Record<string, string[]>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

export function loadCollapsed(profile: string): string[] {
  const saved = read()[profile];
  return Array.isArray(saved) ? saved : [];
}

export function saveCollapsed(profile: string, folded: string[]): void {
  try {
    const all = read();
    if (folded.length) all[profile] = folded;
    else delete all[profile];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or disabled: remembering the view is not worth an error.
  }
}
