import { computed, ref, watch } from 'vue';

/**
 * UI theme preference.
 *
 * Device-local, so it lives in localStorage rather than the settings table —
 * there is no server round-trip and nothing to migrate. Deliberately a plain
 * module-level ref rather than a Pinia store: the stores in this app are all
 * API-backed, and this is not.
 *
 * 'system' is represented by the *absence* of the data-theme attribute, which
 * lets :root's default `color-scheme: light dark` apply. See tokens.css.
 */
export type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'billsmith:theme';

/** The cycle order, as a successor map so there is no unchecked index access. */
const NEXT: Record<Theme, Theme> = {
    system: 'light',
    light: 'dark',
    dark: 'system',
};

export const THEME_LABELS: Record<Theme, string> = {
    system: 'System',
    light: 'Light',
    dark: 'Dark',
};

function read(): Theme {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {
        /* Private browsing or a blocked storage partition. Fall through. */
    }
    return 'system';
}

function apply(value: Theme): void {
    const root = document.documentElement;
    if (value === 'system') {
        delete root.dataset.theme;
    } else {
        root.dataset.theme = value;
    }

    try {
        localStorage.setItem(STORAGE_KEY, value);
    } catch {
        /* Preference just won't survive a reload. Not worth failing over. */
    }
}

const theme = ref<Theme>(read());

// The inline script in index.html has already applied the stored theme before
// first paint; this keeps the attribute in sync with every later change.
watch(theme, apply);

export function useTheme() {
    const next = computed(() => NEXT[theme.value]);

    function cycle(): void {
        theme.value = next.value;
    }

    return { theme, next, cycle };
}
