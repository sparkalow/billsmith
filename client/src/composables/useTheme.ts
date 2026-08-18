import { computed, ref, watch } from 'vue';

/**
 * UI theme preference.
 *
 * Device-local, so it lives in localStorage rather than the settings table —
 * there is no server round-trip and nothing to migrate. Deliberately a plain
 * module-level ref rather than a Pinia store: the stores in this app are all
 * API-backed, and this is not.
 *
 * Light and dark are the only two states a user can pick. The OS preference is
 * only a *default*: until someone actually toggles, nothing is written to
 * storage, so the app keeps following the OS on every later visit.
 */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'billsmith:theme';

/** The cycle order, as a successor map so there is no unchecked index access. */
const NEXT: Record<Theme, Theme> = {
    light: 'dark',
    dark: 'light',
};

export const THEME_LABELS: Record<Theme, string> = {
    light: 'Light',
    dark: 'Dark',
};

/** The OS preference, used when the user has not pinned a theme themselves. */
function systemTheme(): Theme {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function read(): Theme {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        // Anything else — absent, or the legacy 'system' value — means unpinned.
        if (stored === 'light' || stored === 'dark') {return stored;}
    } catch {
        /* Private browsing or a blocked storage partition. Fall through. */
    }
    return systemTheme();
}

function apply(value: Theme): void {
    document.documentElement.dataset.theme = value;

    try {
        localStorage.setItem(STORAGE_KEY, value);
    } catch {
        /* Preference just won't survive a reload. Not worth failing over. */
    }
}

const theme = ref<Theme>(read());

// The inline script in index.html has already applied the resolved theme before
// first paint; this keeps the attribute in sync with every later change. It only
// fires on a real change, which is what keeps an untouched preference unwritten.
watch(theme, apply);

export function useTheme() {
    const next = computed(() => NEXT[theme.value]);

    function cycle(): void {
        theme.value = next.value;
    }

    return { theme, next, cycle };
}
