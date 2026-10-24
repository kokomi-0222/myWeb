<template>
  <div class="not-found">
    <div class="not-found__card">
      <div class="not-found__code">404</div>
      <p class="not-found__title">这里什么都没有</p>
      <p class="not-found__desc">
        页面可能已经被删除，或者链接输错了。
      </p>
      <div class="not-found__actions">
        <Button type="bilibili" @click="goHome">回到首页</Button>
        <Button v-if="canGoBack" type="default" @click="goBack">返回上一页</Button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

// 直接输网址进来时没有站内来源，不显示「返回上一页」
const canGoBack = computed(() => window.history.length > 1 && route.path !== '/')

function goHome() {
  router.push('/')
}

function goBack() {
  router.back()
}
</script>

<style scoped>
.not-found {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  background: var(--bg-nomarl);
}

.not-found__card {
  text-align: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 56px 48px;
  max-width: 420px;
  width: 100%;
}

.not-found__code {
  font-size: 4.5rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -2px;
  color: var(--primary-color);
  opacity: 0.85;
  margin-bottom: 16px;
}

.not-found__title {
  margin: 0 0 8px;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.not-found__desc {
  margin: 0 0 28px;
  font-size: 0.875rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

.not-found__actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

@media (max-width: 480px) {
  .not-found__card {
    padding: 40px 24px;
  }
  .not-found__code {
    font-size: 3.5rem;
  }
}
</style>
