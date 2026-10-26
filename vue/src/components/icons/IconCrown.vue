<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 20 20"
    fill="none"
  >
    <!-- 王冠：三尖 + 底座，用来表示「会员」等级 -->
    <path
      d="M3 7.4 5.9 9.6 10 5.2l4.1 4.4L17 7.4l-1.3 6.1a1 1 0 0 1-1 .8H5.3a1 1 0 0 1-1-.8L3 7.4Z"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path d="M6.1 16.4h7.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 24 },
});
</script>
