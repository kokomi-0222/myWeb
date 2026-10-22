<template>
  <div class="empty-state">
    <div class="empty-state__icon"><IconMessage :size="40" /></div>
    <p class="empty-state__title">消息中心即将上线</p>
    <p class="empty-state__desc">以后点赞、评论和回复的通知都会出现在这里</p>
  </div>
</template>

<script setup>
import IconMessage from "@/components/icons/IconMessage.vue";
</script>

<style scoped>
.empty-state {
  text-align: center;
  padding: 70px 20px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.empty-state__icon {
  color: var(--text-secondary);
  margin-bottom: 12px;
  display: flex;
  justify-content: center;
}

.empty-state__title {
  margin: 0 0 6px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-state__desc {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
</style>
