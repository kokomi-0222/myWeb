<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <path
      d="M18 16.08a2.9 2.9 0 0 0-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.9 2.9 0 0 0 18 7.92a2.96 2.96 0 1 0-2.96-2.96c0 .24.04.47.09.7L8.04 9.81A2.94 2.94 0 0 0 6 9a2.96 2.96 0 0 0 0 5.92c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65A2.92 2.92 0 1 0 18 16.08Z"
      fill="currentColor"
    />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 24 },
});
</script>
