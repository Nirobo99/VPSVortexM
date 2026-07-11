export interface ThemeSettings {
  theme_mode: string;
  theme_primary: string | null;
  theme_accent: string | null;
}

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function applyTheme(settings: ThemeSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const mode = settings.theme_mode || "dark";

  root.classList.remove("light");
  if (mode === "light") {
    root.classList.add("light");
  }

  if (mode === "custom" && settings.theme_primary) {
    root.style.setProperty("--primary", hexToHsl(settings.theme_primary));
  } else {
    root.style.removeProperty("--primary");
  }

  if (mode === "custom" && settings.theme_accent) {
    root.style.setProperty("--accent", hexToHsl(settings.theme_accent));
  } else {
    root.style.removeProperty("--accent");
  }
}

export function loadStoredTheme(): ThemeSettings | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("vortexm_theme");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ThemeSettings;
  } catch {
    return null;
  }
}

export function storeTheme(settings: ThemeSettings) {
  localStorage.setItem("vortexm_theme", JSON.stringify(settings));
}
