// UI theme: Noble (light, default) or Dashdark (dark). The choice lives on <html data-theme> and in
// localStorage; index.html applies the stored one before first paint so the page never flashes.
import { useSyncExternalStore } from 'react';

export const THEMES = [
  { id: 'noble', label: 'Noble', description: 'Light, forest green and mint' },
  { id: 'dashdark', label: 'Dashdark', description: 'Dark, indigo and magenta' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

/** Must match the inline script in index.html. */
export const THEME_STORAGE_KEY = 'playground.theme';

/** Browser chrome per theme: address-bar colour (the page background) and favicon colours. */
const CHROME: Record<ThemeId, { themeColor: string; iconFill: string; iconStroke: string }> = {
  noble: { themeColor: '#f9f9f9', iconFill: '#2e4f21', iconStroke: '#cbf9de' },
  dashdark: { themeColor: '#0d0926', iconFill: '#b02ee8', iconStroke: '#ffffff' },
};

const favicon = ({ iconFill, iconStroke }: (typeof CHROME)[ThemeId]) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='${iconFill}'/>` +
      `<path d='M9 17l5 5 9-11' stroke='${iconStroke}' stroke-width='3.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>`,
  );

/** Points the address-bar colour and favicon at the current theme. */
export function syncThemeChrome(theme: ThemeId = currentTheme()) {
  const chrome = CHROME[theme];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', chrome.themeColor);
  document.querySelector('link[rel="icon"]')?.setAttribute('href', favicon(chrome));
}

const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

export function currentTheme(): ThemeId {
  const v = document.documentElement.dataset.theme;
  return isTheme(v) ? v : 'noble';
}

const listeners = new Set<() => void>();

export function setTheme(theme: ThemeId) {
  const root = document.documentElement;
  if (theme === 'noble') delete root.dataset.theme;
  else root.dataset.theme = theme;
  syncThemeChrome(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* the theme simply isn't remembered */
  }
  listeners.forEach((l) => l());
}

export function useTheme(): [ThemeId, (theme: ThemeId) => void] {
  const theme = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    currentTheme,
    () => 'noble' as const,
  );
  return [theme, setTheme];
}
