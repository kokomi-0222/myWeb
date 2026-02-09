<template>
  <div 
    class="avatar-wrapper"
    :style="{ width: size + 'px', height: size + 'px' }"
  >
    <!-- 圆形头像 -->
    <img
      v-show="!loading"
      :src="resolvedSrc"
      :alt="alt"
      class="avatar-img"
      @load="onLoad"
      @error="onError"
    />
    
    <!-- 加载占位 -->
    <div v-if="loading" class="avatar-placeholder">
      <IconUser />
    </div>

    <!-- 角标（完整显示，不被裁） -->
    <div v-if="badge" class="avatar-badge" :class="`avatar-badge--${badge}`"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'


const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '头像' },
  size: { type: [Number, String], default: 48 },
  badge: { type: String, default: null }
})

const defaultAvatar = new URL('@/assets/images/user.jpg', import.meta.url).href

const loading = ref(true)
const error = ref(false)

const resolvedSrc = computed(() => {
  if (error.value || !props.src) return defaultAvatar
  return props.src
})

const onLoad = () => { loading.value = false }
const onError = () => { error.value = true; loading.value = false }

onMounted(() => {
  if (!props.src) loading.value = false
})
</script>

<style scoped>

.avatar-wrapper {
  position: relative;
  display: inline-block;
}


.avatar-img,
.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border-radius: 50%; 
  background-color: var(--bg-hover); 
}

.avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
}

.avatar-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 38%;     /* 约 18px when size=48 */
  height: 38%;
  min-width: 16px;
  min-height: 16px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 2px rgba(0,0,0,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  font-weight: bold;
  color: white;
}

.avatar-badge--vip {
  background-color: #ff6b00;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='%23fff' d='M6 0L0 3v6l6 3 6-3V3L6 0zm0 2l4 2v4l-4 2L2 8V4l4-2z'/%3E%3C/svg%3E");
  background-size: 60%;
  background-repeat: no-repeat;
  background-position: center;
}

.avatar-badge--live {
  background-color: #ff3366;
}
</style>
