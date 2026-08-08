<script setup lang="ts">
/**
 * Three-state theme control: System -> Light -> Dark -> System.
 *
 * Lives inside .app-chrome, so it never reaches print output.
 */
import { computed } from 'vue';
import { THEME_LABELS, useTheme } from '@/composables/useTheme';

const { theme, next, cycle } = useTheme();

const label = computed(() => THEME_LABELS[theme.value]);
const hint = computed(() => `Theme: ${label.value}. Switch to ${THEME_LABELS[next.value]}.`);
</script>

<template>
  <button
    type="button"
    class="btn btn-secondary btn-sm theme-toggle"
    :title="hint"
    :aria-label="hint"
    @click="cycle"
  >
    <!-- Half-filled circle for "system", sun for light, moon for dark. -->
    <svg
      v-if="theme === 'system'"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
      />
      <path
        d="M12 3a9 9 0 0 0 0 18z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
    <svg
      v-else-if="theme === 'light'"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="4.5"
      />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </svg>
    <svg
      v-else
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M20.5 14.3A8.5 8.5 0 1 1 9.7 3.5a7 7 0 0 0 10.8 10.8z" />
    </svg>
    <span>{{ label }}</span>
  </button>
</template>
