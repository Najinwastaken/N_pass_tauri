// Theme handling. The chosen theme is cached in localStorage so the
// lock/profile screens (where vault settings are still encrypted) use the
// last known theme. The theme name is not a secret — the "no secrets in
// localStorage" rule stays intact.

export type Theme = "dark" | "light";

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
}

export function cachedTheme(): Theme {
  return localStorage.getItem("theme") === "light" ? "light" : "dark";
}
