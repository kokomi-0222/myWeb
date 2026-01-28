<template>
  <div class="search-input-wrapper">
    <form class="search-form" @submit.prevent="handleSearch">
      <div v-if="searchTypes.length > 0" class="search-type-select">
        <Dropdown
          v-model:visible="dropdownVisible"
          trigger="click"
          menuClass="dropdown-menu--inputSearch"
          :offsetY="10"
          :showArrow="true"
          placement="bottom"
          :disableAnimation="false"
        >
          <template #trigger>
            <div class="dropdown-trigger">
              <span style="margin-bottom: 2px; font-size: 0.9rem; white-space: nowrap"
                >{{ currentLabel }}
              </span>
              <div class="select-arrow">
                <IconDoubleArrow size="12" />
              </div>
            </div>
          </template>
          <template #menu="{ close }">
            <div
              class="dropdown-item"
              v-for="type in searchTypes"
              @click="
                () => {
                  handleCommand(type);
                  close();
                }
              "
            >
              {{ type.label }}
            </div>
          </template>
        </Dropdown>
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
          <IconClearButton size="16" />
        </div>
      </div>
      <!-- 搜索图标 -->
      <button class="search-btn" type="button" @click="handleSearch" aria-label="搜索">
        <IconSearch :size="20" />
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted, onMounted, nextTick } from "vue";
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
  padding: 2px 48px 2px 4px;
  position: relative;
  line-height: 38px;
  /*   border: 1px solid var(--input-search-border); */
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
  font-size: 0.9rem;
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
  color: var(--input-search-clear-btn);
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-btn:hover {
  color: var(--input-search-clear-btn-hover);
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

.dropdown-trigger {
  display: inline-flex;
  cursor: pointer;
  /*   width: 50px; */
}

.select-arrow {
  margin-left: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 500;
  height: 32px;
  cursor: pointer;
  color: var(--text-secondary);
  background-color: var(--bg-primary);
}

.dropdown-item:hover {
  color: var(--primary-color);
  background-color: var(--bg-secondary);
}
</style>
<style>
.dropdown-menu--inputSearch {
  width: 64px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px var(--box-shadow);
  padding: 8px 0px;
  background-color: var(--bg-primary);
}
</style>
