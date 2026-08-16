// Typed wrappers around Tauri commands — the only place `invoke` is called.

import { invoke } from "@tauri-apps/api/core";

export interface PasswordMeta {
  id: string;
  title: string;
  username: string;
  url: string;
  notes: string;
}

export interface PasswordInput {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

export interface CardMeta {
  id: string;
  title: string;
  provider: string;
  cardholder: string;
  last4: string;
  expiry: string;
  notes: string;
}

export interface CardInput {
  title: string;
  provider: string;
  cardholder: string;
  number: string; // digits only
  expiry: string; // MM/YY
  cvv: string;
  notes: string;
}

export interface NoteMeta {
  id: string;
  title: string;
}

export interface NoteInput {
  title: string;
  body: string;
}

export interface KeyMeta {
  id: string;
  title: string;
  notes: string;
}

export interface KeyInput {
  title: string;
  key: string;
  notes: string;
}

export interface GeneratorOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
}

export interface Settings {
  auto_lock_minutes: number;
  lock_on_minimize: boolean;
  clipboard_clear_seconds: number;
  theme: string;
}

export type EntryKind = "passwords" | "cards" | "notes" | "keys";
export type SecretKind = "password" | "card_number" | "card_cvv" | "key";

export const api = {
  listProfiles: () => invoke<string[]>("list_profiles"),
  createProfile: (name: string, password: string) =>
    invoke<void>("create_profile", { name, password }),
  deleteProfile: (name: string) => invoke<void>("delete_profile", { name }),

  unlock: (name: string, password: string) =>
    invoke<void>("unlock", { name, password }),
  lock: () => invoke<void>("lock"),
  changeMasterPassword: (current: string, newPassword: string) =>
    invoke<void>("change_master_password", { current, newPassword }),
  currentProfile: () => invoke<string | null>("current_profile"),

  listPasswords: () => invoke<PasswordMeta[]>("list_passwords"),
  addPassword: (input: PasswordInput) =>
    invoke<PasswordMeta>("add_password", { input }),
  updatePassword: (id: string, input: PasswordInput) =>
    invoke<void>("update_password", { id, input }),
  deletePassword: (id: string) => invoke<void>("delete_password", { id }),
  revealPassword: (id: string) => invoke<string>("reveal_password", { id }),

  listCards: () => invoke<CardMeta[]>("list_cards"),
  addCard: (input: CardInput) => invoke<CardMeta>("add_card", { input }),
  updateCard: (id: string, input: CardInput) =>
    invoke<void>("update_card", { id, input }),
  deleteCard: (id: string) => invoke<void>("delete_card", { id }),
  revealCardField: (id: string, field: "number" | "cvv") =>
    invoke<string>("reveal_card_field", { id, field }),

  listNotes: () => invoke<NoteMeta[]>("list_notes"),
  addNote: (input: NoteInput) => invoke<NoteMeta>("add_note", { input }),
  updateNote: (id: string, input: NoteInput) =>
    invoke<void>("update_note", { id, input }),
  deleteNote: (id: string) => invoke<void>("delete_note", { id }),
  getNoteBody: (id: string) => invoke<string>("get_note_body", { id }),
  searchNotes: (query: string) => invoke<NoteMeta[]>("search_notes", { query }),

  listKeys: () => invoke<KeyMeta[]>("list_keys"),
  addKey: (input: KeyInput) => invoke<KeyMeta>("add_key", { input }),
  updateKey: (id: string, input: KeyInput) =>
    invoke<void>("update_key", { id, input }),
  deleteKey: (id: string) => invoke<void>("delete_key", { id }),
  revealKey: (id: string) => invoke<string>("reveal_key", { id }),

  reorderEntries: (kind: EntryKind, orderedIds: string[]) =>
    invoke<void>("reorder_entries", { kind, orderedIds }),

  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (settings: Settings) =>
    invoke<void>("update_settings", { settings }),

  generatePassword: (opts: GeneratorOptions) =>
    invoke<string>("generate_password", { ...opts }),

  /** Copy through Rust: 30 s later the clipboard is cleared if unchanged. */
  copyText: (text: string) => invoke<void>("copy_text", { text }),
  /** Copy a secret vault→clipboard directly; it never enters the WebView. */
  copySecret: (kind: SecretKind, id: string) =>
    invoke<void>("copy_secret", { kind, id }),

  openUrl: (url: string) => invoke<void>("open_url", { url }),
  touchActivity: () => invoke<void>("touch_activity"),
};
