import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "./api";
import { applyTheme, cachedTheme } from "./lib/theme";
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
    </div>
  );
}
