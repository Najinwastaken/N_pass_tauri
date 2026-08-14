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

export interface GeneratorOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
}

export const api = {
  listProfiles: () => invoke<string[]>("list_profiles"),
  createProfile: (name: string, password: string) =>
    invoke<void>("create_profile", { name, password }),
  deleteProfile: (name: string) => invoke<void>("delete_profile", { name }),

  unlock: (name: string, password: string) =>
    invoke<void>("unlock", { name, password }),
  lock: () => invoke<void>("lock"),
  currentProfile: () => invoke<string | null>("current_profile"),

  listPasswords: () => invoke<PasswordMeta[]>("list_passwords"),
  addPassword: (input: PasswordInput) =>
    invoke<PasswordMeta>("add_password", { input }),
  updatePassword: (id: string, input: PasswordInput) =>
    invoke<void>("update_password", { id, input }),
  deletePassword: (id: string) => invoke<void>("delete_password", { id }),
  revealPassword: (id: string) => invoke<string>("reveal_password", { id }),

  generatePassword: (opts: GeneratorOptions) =>
    invoke<string>("generate_password", { ...opts }),
};

/** Copy text to the clipboard (auto-clear arrives in M3 via the Rust side). */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
