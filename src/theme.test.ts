import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import type { Theme, ThemeChoice, ThemeController } from './theme';

const BOOT = readFileSync(new URL('../public/theme.js', import.meta.url), 'utf8');

interface Page {
  theme: ThemeController;
  attributes: Map<string, string>;
  stored: Map<string, string>;
  barColor: () => string | undefined;
  setSystemDark: (dark: boolean) => void;
  fireStorage: (key: string | null) => void;
  warn: ReturnType<typeof vi.fn>;
}

/** Runs public/theme.js, the file the pages load, against a stand-in browser. */
const boot = ({
  stored = {},
  systemDark = false,
  storageThrows = false,
  hasMatchMedia = true,
}: {
  stored?: Record<string, string>;
  systemDark?: boolean;
  storageThrows?: boolean;
  hasMatchMedia?: boolean;
} = {}): Page => {
  const attributes = new Map<string, string>();
  const storage = new Map(Object.entries(stored));
  const mediaListeners: (() => void)[] = [];
  const windowListeners: ((event: { key: string | null }) => void)[] = [];
  const media = {
    matches: systemDark,
    addEventListener: (_: string, listener: () => void) => mediaListeners.push(listener),
  };
  const meta = {
    content: '#e6e9ee',
    setAttribute: (_: string, value: string) => (meta.content = value),
  };
  const guard = <T>(run: () => T): T => {
    if (storageThrows) throw new Error('SecurityError');
    return run();
  };
  const warn = vi.fn();
  const window: Record<string, unknown> = {
    addEventListener: (_: string, listener: (event: { key: string | null }) => void) =>
      windowListeners.push(listener),
  };
  if (hasMatchMedia) window.matchMedia = () => media;
  runInNewContext(BOOT, {
    window,
    console: { warn },
    localStorage: {
      getItem: (key: string) => guard(() => storage.get(key) ?? null),
      setItem: (key: string, value: string) => guard(() => storage.set(key, value)),
      removeItem: (key: string) => guard(() => storage.delete(key)),
    },
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => attributes.set(name, value),
      },
      querySelector: () => meta,
      addEventListener: () => undefined,
    },
  });
  return {
    theme: window.subsolaTheme as ThemeController,
    attributes,
    stored: storage,
    barColor: () => meta.content,
    setSystemDark: (dark) => {
      media.matches = dark;
      mediaListeners.forEach((listener) => listener());
    },
    fireStorage: (key) => windowListeners.forEach((listener) => listener({ key })),
    warn,
  };
};

describe('public/theme.js', () => {
  it.each<[ThemeChoice | undefined, boolean, Theme]>([
    [undefined, false, 'light'],
    [undefined, true, 'dark'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
  ])('stored %s with a %s dark system resolves to %s', (choice, systemDark, theme) => {
    const page = boot({ stored: choice ? { 'subsola:theme': choice } : {}, systemDark });
    expect(page.attributes.get('data-theme')).toBe(theme);
    expect(page.attributes.get('data-theme-choice')).toBe(choice ?? 'system');
    expect(page.theme.theme).toBe(theme);
  });

  it('ignores a stored value it does not know', () => {
    const page = boot({ stored: { 'subsola:theme': 'sepia' }, systemDark: true });
    expect(page.theme.choice).toBe('system');
    expect(page.attributes.get('data-theme')).toBe('dark');
  });

  it('follows the system while the choice is system, and only then', () => {
    const page = boot();
    page.setSystemDark(true);
    expect(page.attributes.get('data-theme')).toBe('dark');
    page.theme.set('light');
    page.setSystemDark(false);
    page.setSystemDark(true);
    expect(page.attributes.get('data-theme')).toBe('light');
  });

  it('remembers a choice, and forgets it for system', () => {
    const page = boot();
    page.theme.set('dark');
    expect(page.stored.get('subsola:theme')).toBe('dark');
    expect(page.attributes.get('data-theme')).toBe('dark');
    expect(page.barColor()).toBe('#14181e');
    page.theme.set('system');
    expect(page.stored.has('subsola:theme')).toBe(false);
    expect(page.attributes.get('data-theme')).toBe('light');
    expect(page.barColor()).toBe('#e6e9ee');
  });

  it('tells subscribers, and stops when asked', () => {
    const page = boot();
    const heard: [Theme, ThemeChoice][] = [];
    const stop = page.theme.subscribe((theme, choice) => heard.push([theme, choice]));
    page.theme.set('dark');
    stop();
    page.theme.set('light');
    expect(heard).toEqual([['dark', 'dark']]);
  });

  it('picks up a choice made in another tab', () => {
    const page = boot();
    page.stored.set('subsola:theme', 'dark');
    page.fireStorage('subsola:theme');
    expect(page.attributes.get('data-theme')).toBe('dark');
    page.stored.clear();
    page.fireStorage(null);
    expect(page.attributes.get('data-theme')).toBe('light');
  });

  it('falls back to the system, with a warning, when storage is blocked', () => {
    const page = boot({ storageThrows: true, systemDark: true });
    expect(page.attributes.get('data-theme')).toBe('dark');
    page.theme.set('light');
    expect(page.attributes.get('data-theme')).toBe('light');
    expect(page.warn).toHaveBeenCalledTimes(2);
  });

  it('is light in a browser without matchMedia', () => {
    expect(boot({ hasMatchMedia: false }).attributes.get('data-theme')).toBe('light');
  });
});
