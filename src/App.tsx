import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "./api";
import { applyTheme, cachedTheme } from "./lib/theme";
import { t } from "./lib/i18n";
import { IconX } from "./lib/icons";
import { Titlebar } from "./Titlebar";
import { ProfileSelect } from "./screens/ProfileSelect";
import { CreateProfile } from "./screens/CreateProfile";
import { Unlock } from "./screens/Unlock";
import { Main } from "./screens/Main";
import "./App.css";

// Apply the cached theme before first paint to avoid a flash.
applyTheme(cachedTheme());

type Screen =
  | { kind: "loading" }
  | { kind: "profiles" }
  | { kind: "create" }
  | { kind: "unlock"; profile: string }
  | { kind: "main"; profile: string };

/** Rounded corners only make sense for a floating window — track maximize. */
function useMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    const update = () => void win.isMaximized().then(setMaximized);
    update();
    const unlisten = win.onResized(update);
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  return maximized;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [profiles, setProfiles] = useState<string[]>([]);
  const maximized = useMaximized();
  const [toast, setToast] = useState<string | null>(null);

  // Language switches re-render the whole tree (t() reads a module var).
  const [, setLangTick] = useState(0);
  useEffect(() => {
    const bump = () => setLangTick((n) => n + 1);
    window.addEventListener("np-lang", bump);
    return () => window.removeEventListener("np-lang", bump);
  }, []);

  // Background backup failures arrive from Rust as an event → styled toast.
  useEffect(() => {
    const unlisten = listen<string>("backup-failed", (e) => {
      setToast(t("backupFailedToast", { err: e.payload }));
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function goToStart() {
    const list = await api.listProfiles();
    setProfiles(list);
    setScreen(list.length === 0 ? { kind: "create" } : { kind: "profiles" });
  }

  useEffect(() => {
    void (async () => {
      // Backend still unlocked (e.g. frontend hot-reload) → straight to main.
      const current = await api.currentProfile();
      if (current) setScreen({ kind: "main", profile: current });
      else await goToStart();
    })();

    // Auto-lock (timer or minimize) fires this event from Rust.
    const unlisten = listen("vault-locked", () => {
      void goToStart();
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  let content: React.ReactNode = null;
  switch (screen.kind) {
    case "loading":
      break;
    case "profiles":
      content = (
        <ProfileSelect
          profiles={profiles}
          onOpen={(profile) => setScreen({ kind: "unlock", profile })}
          onCreate={() => setScreen({ kind: "create" })}
          onChanged={() => void goToStart()}
        />
      );
      break;
    case "create":
      content = (
        <CreateProfile
          onCreated={(profile) => setScreen({ kind: "main", profile })}
          onBack={() => void goToStart()}
        />
      );
      break;
    case "unlock":
      content = (
        <Unlock
          profile={screen.profile}
          onUnlocked={() => setScreen({ kind: "main", profile: screen.profile })}
          onBack={() => void goToStart()}
        />
      );
      break;
    case "main":
      content = <Main profile={screen.profile} onLocked={() => void goToStart()} />;
      break;
  }

  return (
    <div className={`app-shell ${maximized ? "maximized" : ""}`}>
      <Titlebar
        onSettings={
          screen.kind === "main"
            ? () => window.dispatchEvent(new CustomEvent("np-open-settings"))
            : undefined
        }
      />
      <div className="app-content fade-in" key={screen.kind}>
        {content}
      </div>
      {toast && (
        <div className="toast fade-in" role="alert">
          <span className="toast-text">{toast}</span>
          <button className="icon" title={t("close")} onClick={() => setToast(null)}>
            <IconX size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
