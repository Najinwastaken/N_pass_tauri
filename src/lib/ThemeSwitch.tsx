// Segmented light/dark switch — used in the sidebar and in Settings.

import { Theme } from "./theme";
import { IconMoon, IconSun } from "./icons";

interface Props {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

export function ThemeSwitch({ theme, onChange }: Props) {
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Theme">
      <button
        type="button"
        className={theme === "light" ? "active" : ""}
        onClick={() => onChange("light")}
      >
        <IconSun size={14} />
        Light
      </button>
      <button
        type="button"
        className={theme === "dark" ? "active" : ""}
        onClick={() => onChange("dark")}
      >
        <IconMoon size={14} />
        Dark
      </button>
    </div>
  );
}
