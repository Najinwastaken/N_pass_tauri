// Unfinished entry forms survive switching sections: leaving a half-typed
// entry to look something up in another tab should not throw it away.
//
// Memory only. A draft holds a plaintext secret, so it is never written to
// disk (that is what the encrypted vault is for) and it is wiped together
// with the rest of the decrypted data when the vault locks.

const drafts = new Map<string, unknown>();

export function getDraft<T>(key: string): T | undefined {
  return drafts.get(key) as T | undefined;
}

export function setDraft(key: string, value: unknown): void {
  drafts.set(key, value);
}

export function clearDraft(key: string): void {
  drafts.delete(key);
}

/** Called when the vault locks — drafts must not outlive the session. */
export function clearDrafts(): void {
  drafts.clear();
}
