import { beforeEach, describe, expect, it } from 'vitest';
import { currentTheme, setTheme, THEME_STORAGE_KEY } from './theme';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('defaults to Noble', () => {
    expect(currentTheme()).toBe('noble');
  });

  it('switches to Dashdark and back, remembering the choice', () => {
    setTheme('dashdark');
    expect(document.documentElement.dataset.theme).toBe('dashdark');
    expect(currentTheme()).toBe('dashdark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dashdark');

    setTheme('noble');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('noble');
  });

  it('treats an unknown data-theme as Noble', () => {
    document.documentElement.dataset.theme = 'neon';
    expect(currentTheme()).toBe('noble');
  });
});
