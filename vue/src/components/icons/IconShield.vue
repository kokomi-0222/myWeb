<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <!-- 盾牌：角色与权限 -->
    <path
      d="M12 2.6 4.6 5.8v5.5c0 4.4 3.1 8.4 7.4 9.6 4.3-1.2 7.4-5.2 7.4-9.6V5.8z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
    <path
      d="m8.8 11.9 2.2 2.2 4.2-4.3"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
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
