<template>
  <div class="search-input-wrapper">
    <input
      ref="inputRef"
      v-model="innerValue"
      type="text"
      class="search-input"
      :placeholder="placeholder"
      @focus="isFocused = true"
      @blur="isFocused = false"
      @keyup.enter="handleSearch"
    />
    
    <!-- 清空按钮（仅在有内容且聚焦/悬停时显示） -->
    <button
      v-if="showClear"
      class="clear-btn"
      @click="clearInput"
      aria-label="清空输入框"
    >
      ✕
    </button>
    
    <!-- 搜索图标 -->
    <button
      class="search-btn"
      @click="handleSearch"
      aria-label="搜索"
    >
      🔍
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: '请输入关键词...'
  }
})

const emit = defineEmits(['update:modelValue', 'search'])

// 内部值（用于 v-model）
const innerValue = ref(props.modelValue)

// 同步外部 modelValue 变化
watch(() => props.modelValue, (newVal) => {
  innerValue.value = newVal
})

// 双向绑定
watch(innerValue, (newVal) => {
  emit('update:modelValue', newVal)
})

// 聚焦状态（用于控制 clear 按钮显示）
const isFocused = ref(false)
const inputRef = ref(null)

// 是否显示清空按钮：有内容 + （聚焦 或 鼠标悬停）
const showClear = computed(() => {
  return innerValue.value.trim() !== '' && isFocused.value
})

// 清空输入
function clearInput() {
  innerValue.value = ''
  inputRef.value?.focus()
}

// 触发搜索
function handleSearch() {
  if (innerValue.value.trim() !== '') {
    emit('search', innerValue.value.trim())
  } else {
    // 即使为空也触发，让父组件决定行为（比如“显示全部”）
    emit('search', '')
  }
}
</script>

<style scoped>
.search-input-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
  max-width: 400px;
}

.search-input {
  width: 100%;
  padding: 10px 40px 10px 16px; /* 右侧留出图标空间 */
  font-size: 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
  background-color: white;
}

.search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  background-color:#cbd5e1
}

/* 清空按钮 */
.clear-btn,
.search-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  color: #9ca3af;
  padding: 4px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s, background-color 0.2s;
}

.clear-btn {
  right: 40px; /* 在搜索图标左侧 */
}

.clear-btn:hover {
  color: #ef4444;
  background-color: #f9fafb;
}

.search-btn {
  right: 12px;
}

.search-btn:hover {
  color: #3b82f6;
  background-color: #f0f9ff;
}

/* 响应式：小屏适配 */
@media (max-width: 640px) {
  .search-input {
    font-size: 16px; /* 防止 iOS 缩放 */
  }
}
</style>
