<template>
  <div class="search-input-wrapper">
    <form
      class="search-form"
      :class="{ 'is-focused': isFocused }"
      @submit.prevent="handleSearch"
      @click="handleFormClick"
    >
      <!-- 搜索范围下拉 -->
      <Dropdown
        v-if="searchTypes.length > 0"
        v-model:visible="scopeVisible"
        trigger="click"
        placement="bottom-start"
        menu-class="search-scope-menu"
        :offset-y="8"
        :show-arrow="false"
      >
        <template #trigger>
          <button type="button" class="scope-trigger" :title="`搜索范围：${currentLabel}`">
            <span class="scope-trigger__label">{{ currentLabel }}</span>
            <svg
              class="scope-trigger__chevron"
              :class="{ 'is-open': scopeVisible }"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </template>
        <template #menu="{ close }">
          <button
            v-for="t in searchTypes"
            :key="t.value"
            type="button"
            class="scope-item"
            :class="{ 'is-active': t.value === innerSearchType }"
            @click="
              () => {
                handleCommand(t);
                close();
              }
            "
          >
            <span>{{ t.label }}</span>
            <svg
              v-if="t.value === innerSearchType"
              class="scope-item__check"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
        </template>
      </Dropdown>

      <span v-if="searchTypes.length > 0" class="scope-divider" />

      <!-- 输入区 -->
      <div class="search-content">
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
        <!-- 清空按钮（仅在有内容时显示） -->
        <button
          v-if="showClear"
          type="button"
          class="clear-btn"
          aria-label="清空"
          @click="clearInput"
        >
          <IconClearButton size="16" />
        </button>
      </div>

      <!-- 搜索图标 -->
      <button class="search-btn" type="button" aria-label="搜索" @click="handleSearch">
        <IconSearch :size="18" />
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import Dropdown from "@/components/modules/Dropdown.vue";

const props = defineProps({
  modelValue: {
    type: String,
    default: "",
  },
  placeholder: {
    type: String,
    default: "请输入关键词...",
  },
  searchTypes: { type: Array, default: () => [] },
});

const emit = defineEmits(["update:modelValue", "search", "update:searchType"]);
const id = `input-search-${Math.random().toString(36).substring(2, 11)}`;
// 内部值（用于 v-model）
const innerValue = ref(props.modelValue);
const innerSearchType = ref(props.searchTypes[0]?.value || "");
const scopeVisible = ref(false);

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

// 聚焦状态（用于整体高亮搜索框）
const isFocused = ref(false);
const inputRef = ref(null);

// 是否显示清空按钮：有内容
const showClear = computed(() => {
  return innerValue.value.trim();
});

// 清空输入
function clearInput() {
  innerValue.value = "";
  inputRef.value?.focus();
}

// 点击搜索框任意空白处都聚焦输入框（含左右内边距、图标间隙），
// 点在按钮上时不干预，避免抢掉按钮自身的点击行为
function handleFormClick(e) {
  if (e.target instanceof Element && e.target.closest("button")) return;
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
  emit("update:searchType", type.value);
}

defineExpose({
  focus() {
    inputRef.value?.focus();
  },
});
</script>

<style scoped>
.search-input-wrapper {
  flex: 1 auto;
  width: 100%;
  max-width: 400px;
}

.search-form {
  display: flex;
  align-items: center;
  position: relative;
  width: 100%;
  height: 38px;
  padding: 0 5px 0 5px;
  background-color: var(--input-search-glass);
  border: 1px solid transparent;
  border-radius: 10px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    box-shadow 0.25s ease;
}

.search-form:hover {
  background-color: var(--input-search-bg-hover);
}

.search-form.is-focused {
  background-color: var(--bg-primary);
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-color-soft);
}

/* ===== 范围下拉触发器 ===== */
.scope-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--input-search);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.scope-trigger:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.scope-trigger__chevron {
  opacity: 0.55;
  transition: transform 0.25s ease;
}

.scope-trigger__chevron.is-open {
  transform: rotate(180deg);
}

.scope-divider {
  flex-shrink: 0;
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background: var(--border-color);
}

/* ===== 输入区 ===== */
.search-content {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 6px;
  cursor: text;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  border: none;
  background-color: transparent;
  box-shadow: none;
  color: var(--input-search-focus);
  font-size: 0.9rem;
  line-height: 20px;
  cursor: text;
}

.search-input::placeholder {
  color: var(--input-search);
  opacity: 0.8;
}

.search-input:focus {
  outline: none;
}

.clear-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  min-width: 0;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: var(--input-search-clear-btn);
  transition: color 0.2s ease;
}

.clear-btn:hover {
  color: var(--input-search-clear-btn-hover);
}

/* ===== 搜索按钮 ===== */
.search-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--input-search-btn);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.search-btn:hover {
  background-color: var(--primary-color-soft);
  color: var(--primary-color);
}

.search-btn:active {
  transform: scale(0.92);
}
</style>

<style>
/* ===== 滚动后白底导航栏上的搜索框：实底 + 描边，保证可见性 ===== */
.header-bar.is-scrolled .search-form {
  background-color: var(--input-search-bg);
  border-color: var(--border-color);
}

.header-bar.is-scrolled .search-form.is-focused {
  background-color: var(--bg-primary);
  border-color: var(--primary-color);
}

/* ===== 搜索范围菜单（Teleport 到 body，需用全局样式） ===== */
.search-scope-menu {
  min-width: 136px;
  padding: 6px;
  box-sizing: border-box;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.06);
}

:root.dark .search-scope-menu {
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.35);
}

.scope-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.scope-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.scope-item.is-active {
  color: var(--primary-color);
  font-weight: 600;
}
</style>
