<!-- BottomNav.vue -->


<template>
  <nav v-if="showBottomNav" class="bottom-nav">
    <a href="/home">首页</a>
    <a href="/search">发布</a>
    <a href="/profile">我的</a>
  </nav>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { isMobileDevice } from '@/utils/device'

const showBottomNav = ref(false)

onMounted(() => {
  // 只有真手机才显示底部菜单
  showBottomNav.value = true;//isMobileDevice()
})
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  background: var(--bg-primary);
  border-top: 1px solid var(--border-color);
  padding: 10px 0;
  z-index: 99;
}
</style>
