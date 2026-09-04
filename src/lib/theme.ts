export type Theme = "light" | "dark";

const STORAGE_KEY = "visor-theme";

export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode */
  }
  syncToggles(theme);
}

function syncToggles(theme: Theme): void {
  const next = theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach((btn) => {
    btn.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    btn.setAttribute("aria-label", next);
  });
}

export function bindThemeToggle(): void {
  syncToggles(currentTheme());
  document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme(currentTheme() === "light" ? "dark" : "light");
    });
  });
}
