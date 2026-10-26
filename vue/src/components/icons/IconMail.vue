<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 20 20"
    fill="none"
  >
    <rect
      x="2.4"
      y="4.2"
      width="15.2"
      height="11.6"
      rx="2"
      stroke="currentColor"
      stroke-width="1.5"
    />
    <path
      d="M3.4 5.6 9.1 10a1.5 1.5 0 0 0 1.8 0l5.7-4.4"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 24 },
});
</script>
