import { THEMES, useTheme } from '../theme';
import { cx } from './ui';

/** Two-way switch between the Noble and Dashdark themes. Native radios, so arrow keys and screen readers work. */
export function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <fieldset className="flex flex-col gap-1.5 px-1">
      <legend className="mb-1.5 text-xs font-medium text-muted">Theme</legend>
      <div className="grid grid-cols-2 gap-0.5 rounded-full border border-border bg-bg p-0.5 dashdark:rounded-lg">
        {THEMES.map((t) => (
          <label
            key={t.id}
            title={t.description}
            className={cx(
              'cursor-pointer rounded-full px-3 py-1 text-center text-xs font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent dashdark:rounded-md',
              theme === t.id ? 'bg-accent text-accent-fg dashdark:bg-surface-2 dashdark:text-fg dashdark:shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            <input
              type="radio"
              name="ui-theme"
              value={t.id}
              checked={theme === t.id}
              onChange={() => setTheme(t.id)}
              className="sr-only"
            />
            {t.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
