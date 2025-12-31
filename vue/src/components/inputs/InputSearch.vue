<template>
  <div class="search-input-wrapper">
    <form class="search-form" @submit.prevent="handleSearch">
      <div v-if="searchTypes.length > 0" class="search-type-select">
        <el-dropdown trigger="click" @command="handleCommand">
          <span class="el-dropdown-link">
            <div style="">{{ currentLabel }}</div>
            <div class="select-arrow">
              <svg
                width="12"
                height="16"
                viewBox="0 0 12 16"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M6 3 L1 7 L11 7 Z" />
                <path d="M6 13 L1 9 L11 9 Z" />
              </svg>
            </div>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="type in searchTypes" :command="type">{{
                type.label
              }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div class="search-content" :class="{ 'is-focused': isFocused }">
        <input
          ref="inputRef"
          v-model="innerValue"
          type="text"
          :id="id"
          class="search-input"
          :placeholder="placeholder"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @keyup.enter="handleSearch"
        />
        <!-- 清空按钮（仅在有内容且聚焦/悬停时显示） -->
        <div v-if="showClear" class="clear-btn" @click="clearInput">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M8 14.75C11.7279 14.75 14.75 11.7279 14.75 8C14.75 4.27208 11.7279 1.25 8 1.25C4.27208 1.25 1.25 4.27208 1.25 8C1.25 11.7279 4.27208 14.75 8 14.75ZM9.64999 5.64303C9.84525 5.44777 10.1618 5.44777 10.3571 5.64303C10.5524 5.83829 10.5524 6.15487 10.3571 6.35014L8.70718 8.00005L10.3571 9.64997C10.5524 9.84523 10.5524 10.1618 10.3571 10.3571C10.1618 10.5523 9.84525 10.5523 9.64999 10.3571L8.00007 8.70716L6.35016 10.3571C6.15489 10.5523 5.83831 10.5523 5.64305 10.3571C5.44779 10.1618 5.44779 9.84523 5.64305 9.64997L7.29296 8.00005L5.64305 6.35014C5.44779 6.15487 5.44779 5.83829 5.64305 5.64303C5.83831 5.44777 6.15489 5.44777 6.35016 5.64303L8.00007 7.29294L9.64999 5.64303Z"
            ></path>
          </svg>
        </div>
      </div>
      <!-- 搜索图标 -->
      <button class="search-btn" type="button" @click="handleSearch" aria-label="搜索">
        <el-icon :size="20"><Search /></el-icon>
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted, onMounted, nextTick } from "vue";
import { Search } from "@element-plus/icons-vue";
const props = defineProps({
  modelValue: {
    type: String,
    default: "",
  },
  placeholder: {
    type: String,
    default: "请输入关键词...",
  },

  searchTypes: { type: Array, default: [] },
});

const emit = defineEmits(["update:modelValue", "search", "update:searchType"]);
const id = `input-search-${Math.random().toString(36).substring(2, 11)}`;
// 内部值（用于 v-model）
const innerValue = ref(props.modelValue);
const innerSearchType = ref(props.searchTypes[0]?.value || "");

const currentLabel = computed(() => {
  return props.searchTypes.find((o) => o.value === innerSearchType.value)?.label;
});

// 同步外部 modelValue 变化
watch(
  () => props.modelValue,
  (newVal) => {
    innerValue.value = newVal;
  }
);

// 双向绑定
watch(innerValue, (newVal) => {
  emit("update:modelValue", newVal);
});

// 聚焦状态（用于控制 clear 按钮显示）
const isFocused = ref(false);
const inputRef = ref(null);

// 是否显示清空按钮：有内容 + （聚焦 或 鼠标悬停）
const showClear = computed(() => {
  return innerValue.value.trim();
});

// 清空输入
function clearInput() {
  innerValue.value = "";
  inputRef.value?.focus();
}

// 触发搜索
function handleSearch() {
  const keyword = innerValue.value.trim();
  const type = innerSearchType.value || (props.searchTypes[0]?.value ?? "");
  emit("search", { keyword, type });
}

function handleCommand(type) {
  innerSearchType.value = type.value;
}
</script>

<style scoped>
.search-input-wrapper {
  flex: 1 auto;
  height: 38px;
  width: 100%;
  max-width: 400px;
}

.search-form {
  display: flex;
  align-items: center;
  padding: 2px 48px 2px 2px;
  position: relative;
  line-height: 38px;
  border: 1px solid var(--input-search-border);
  height: 40px;
  background-color: var(--input-search-bg);
  opacity: 0.9;
  transition: background-color 0.3s;
  border-radius: 8px;
}

.search-form:hover {
  background-color: var(--input-search-bg-hover);
}

.search-type-select {
  margin-right: 8px;
  padding: 4px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background-color: var(--input-search-bg);
}

.search-type-select:hover {
  background-color: var(--input-search-btn-hover);
}

/* 自定义箭头 */
.select-arrow {
  margin-left: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
}

.select-arrow svg {
  display: block;
}

.search-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  padding: 0 8px;
  width: 100%;
  height: 32px;
  border: 2px solid transparent;
  border-radius: 6px;
}

.search-content.is-focused {
  background-color: var(--input-search-content-focus);
}

.search-input {
  flex: 1;
  overflow: hidden;
  padding-right: 8px;
  border: none;
  background-color: transparent;
  box-shadow: none;
  color: var(--input-search);
  font-size: 14px;
  line-height: 20px;
}

.search-input:focus {
  outline: none;
  color: var(--input-search-focus);
}

.clear-btn {
  border: none;
  cursor: pointer;
  height: 20px;
  width: 20px;

  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-btn svg path {
  fill: var(--input-search-clear-btn);
  transition: fill 0.2s;
}

.clear-btn:hover svg path {
  fill: var(--input-search-clear-btn-hover);
}

.search-btn {
  position: absolute;
  top: 3px;
  right: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  color: var(--input-search-btn);
  line-height: 32px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.search-btn:hover {
  background-color: var(--input-search-btn-hover);
}

.search-type-select .el-dropdown-link {
  cursor: pointer;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  width: 100%;
  white-space: nowrap; 
}

.el-dropdown-menu {
  background-color: var(--bg-primary);
}

:deep(.el-dropdown-menu__item) {
  color: var(--text-secondary);
  background-color: var(--bg-primary);
}

:deep(.el-dropdown-menu__item:hover),:deep(.el-dropdown-menu__item:focus) {
  color: var(--text-primary);
  background-color: var(--bg-secondary);
}
</style>
