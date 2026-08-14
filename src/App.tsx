import { useEffect, useState } from "react";
import { api } from "./api";
import { ProfileSelect } from "./screens/ProfileSelect";
import { CreateProfile } from "./screens/CreateProfile";
import { Unlock } from "./screens/Unlock";
import { Main } from "./screens/Main";
import "./App.css";

type Screen =
  | { kind: "loading" }
  | { kind: "profiles" }
  | { kind: "create" }
  | { kind: "unlock"; profile: string }
  | { kind: "main"; profile: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [profiles, setProfiles] = useState<string[]>([]);

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
  }, []);

  switch (screen.kind) {
    case "loading":
      return null;
    case "profiles":
      return (
        <ProfileSelect
          profiles={profiles}
          onOpen={(profile) => setScreen({ kind: "unlock", profile })}
          onCreate={() => setScreen({ kind: "create" })}
          onChanged={() => void goToStart()}
        />
      );
    case "create":
      return (
        <CreateProfile
          onCreated={(profile) => setScreen({ kind: "main", profile })}
          onBack={() => void goToStart()}
        />
      );
    case "unlock":
      return (
        <Unlock
          profile={screen.profile}
          onUnlocked={() => setScreen({ kind: "main", profile: screen.profile })}
          onBack={() => void goToStart()}
        />
      );
    case "main":
      return <Main profile={screen.profile} onLocked={() => void goToStart()} />;
  }
}
