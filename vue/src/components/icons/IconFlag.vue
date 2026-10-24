<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <path d="M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z" fill="currentColor" />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 24 },
});
</script>
