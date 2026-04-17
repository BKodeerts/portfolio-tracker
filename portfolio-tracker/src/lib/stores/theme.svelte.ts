type Theme = 'light' | 'dark' | 'system';

function createThemeStore() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null;
  let theme = $state<Theme>(
    stored === 'dark' || stored === 'system' ? (stored as Theme) : 'light',
  );
  let privacyMode = $state(
    typeof localStorage !== 'undefined' ? localStorage.getItem('privacy') === '1' : false,
  );

  const isDark = $derived(
    theme === 'dark' || (theme === 'system' && matchesSystemDark()),
  );

  function matchesSystemDark(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyTheme() {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  function setTheme(t: Theme) {
    theme = t;
    localStorage.setItem('theme', t);
    applyTheme();
  }

  function togglePrivacy() {
    privacyMode = !privacyMode;
    localStorage.setItem('privacy', privacyMode ? '1' : '0');
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('privacy', privacyMode);
    }
  }

  // React to system preference changes when theme === 'system'
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (theme === 'system') applyTheme();
    });
  }

  return {
    get theme() { return theme; },
    get isDark() { return isDark; },
    get privacyMode() { return privacyMode; },
    setTheme,
    togglePrivacy,
    applyTheme,
  };
}

export const themeStore = createThemeStore();
