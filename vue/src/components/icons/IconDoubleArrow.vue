<template>
  <svg
    :width="size"
    :height="size*1.5"
    viewBox="0 0 12 16"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M6 3 L1 7 L11 7 Z" />
    <path d="M6 13 L1 9 L11 9 Z" />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 24 },
});
</script>
