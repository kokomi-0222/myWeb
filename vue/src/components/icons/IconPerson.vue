<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    fill="none"
    viewBox="0 0 20 20"
  >
    <path
      d="M2.494 16.607A9.976 9.976 0 0 1 10 13.214a9.976 9.976 0 0 1 7.507 3.393A9.976 9.976 0 0 1 10 20a9.976 9.976 0 0 1-7.506-3.393zM13.572 8.214a3.571 3.571 0 1 1-7.143 0 3.571 3.571 0 0 1 7.143 0z"
      fill="#fff"
    ></path>
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 24 },
});
</script>
