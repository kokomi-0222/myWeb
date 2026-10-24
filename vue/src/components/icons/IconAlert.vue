<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 20 20"
    fill="none"
  >
    <path
      d="M10 2.2a1.4 1.4 0 0 1 1.2.7l6.6 11.6a1.4 1.4 0 0 1-1.2 2.1H3.4a1.4 1.4 0 0 1-1.2-2.1L8.8 2.9a1.4 1.4 0 0 1 1.2-.7z"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    />
    <path
      d="M10 7.2v3.9"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <circle cx="10" cy="13.9" r="0.95" fill="currentColor" />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 24 },
});
</script>
