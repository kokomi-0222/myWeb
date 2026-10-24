<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    fill="none"
    viewBox="0 0 20 20"
  >
    <rect x="2.5" y="2.5" width="6.2" height="6.2" rx="1.8" fill="currentColor"></rect>
    <rect x="11.3" y="2.5" width="6.2" height="6.2" rx="1.8" fill="currentColor"></rect>
    <rect x="2.5" y="11.3" width="6.2" height="6.2" rx="1.8" fill="currentColor"></rect>
    <rect x="11.3" y="11.3" width="6.2" height="6.2" rx="1.8" fill="currentColor"></rect>
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 24 },
});
</script>
