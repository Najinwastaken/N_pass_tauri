import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

// The version comes from tauri.conf.json, which is the same number the
// installer and the release carry — so what the window shows can never
// drift from what was actually shipped. Fetched once and cached, so every
// place that displays it agrees and only one call is ever made.

let cached: string | null = null;

export function useAppVersion(): string {
  const [version, setVersion] = useState(cached ?? "");

  useEffect(() => {
    if (cached !== null) return;
    void getVersion().then((value) => {
      cached = value;
      setVersion(value);
    });
  }, []);

  return version;
}
