<template>
  <div class="pagination">
    <div class="pagination-controls">
      <!-- 上一页按钮 -->
      <button
        :disabled="currentPage === 1"
        @click="prevPage"
        :class="{ disabled: currentPage === 1 }"
        v-if="currentPage !== 1"
      >
        上一页
      </button>

      <!-- 显示页码 -->
      <ul class="page-numbers">
        <li v-for="page in displayedPages" :key="page">
          <span v-if="typeof page === 'string'" class="ellipsis">{{ page }}</span>
          <button
            v-else
            @click="goToPage(page)"
            :class="{ active: currentPage === page }"
          >
            {{ page }}
          </button>
        </li>
      </ul>

      <!-- 下一页按钮 -->
      <button
        :disabled="currentPage === totalPages"
        @click="nextPage"
        :class="{ disabled: currentPage === totalPages }"
        v-if="currentPage !== totalPages"
      >
        下一页
      </button>
    </div>

    <div class="pagination-info">
      共{{ totalPages }}页 / {{ totalItems }}个， 跳至<input
        type="number"
        v-model.number="jumpToPage"
        min="1"
        :max="totalPages"
        @keyup.enter="jumpToPageHandler"
        @input="clampValue"
      />页
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";

const props = defineProps({
  totalItems: {
    type: Number,
    required: true,
  },
  pageSize: {
    type: Number,
    default: 10,
  },
  modelValue: {
    type: Number,
    default: 1,
  },
});

// 计算总页数
const totalPages = computed(() => Math.ceil(props.totalItems / props.pageSize));

const currentPage = ref(props.modelValue);
const jumpToPage = ref();

// 计算需要展示的页码
const displayedPages = computed(() => {
  const pages = [];
  const maxDisplayedPages = 5; // 最多显示多少页码
  if (totalPages.value <= maxDisplayedPages) {
    for (let i = 1; i <= totalPages.value; i++) {
      pages.push(i);
    }
  } else {
    let start = currentPage.value - Math.floor(maxDisplayedPages / 2);
    let end = currentPage.value + Math.floor(maxDisplayedPages / 2);

    if (start < 1) {
      start = 1;
      end = maxDisplayedPages;
    }
    if (end > totalPages.value) {
      end = totalPages.value;
      start = totalPages.value - maxDisplayedPages + 1;
    }

    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push("...");
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < totalPages.value) {
      if (end < totalPages.value - 1) pages.push("...");
      pages.push(totalPages.value);
    }
  }
  return pages;
});

// 切换页面
const emit = defineEmits(["update:modelValue", "change"]);

function goToPage(page) {
  if (page !== currentPage.value && page > 0 && page <= totalPages.value) {
    currentPage.value = page;
    emit("update:modelValue", page);
    emit("change", page);
  }
}

function prevPage() {
  goToPage(currentPage.value - 1);
}

function nextPage() {
  goToPage(currentPage.value + 1);
}

function jumpToPageHandler() {
  if (jumpToPage.value >= 1 && jumpToPage.value <= totalPages.value) {
    goToPage(jumpToPage.value);
  }
}

watch(
  () => props.totalItems,
  () => {
    if (currentPage.value > totalPages.value) {
      goToPage(totalPages.value);
    }
  }
);

const clampValue = () => {
  if (jumpToPage.value < 0) jumpToPage.value = 1;
  if (jumpToPage.value > totalPages.value) jumpToPage.value = totalPages.value;
};
</script>

<style scoped>
.pagination {
  position: relative;
  align-items: center;
  display: flex;
  width: 100%;
  height: 38px;
}

.pagination-controls {
  display: flex;
}

.page-numbers {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0 10px;
}

.page-numbers li {
  margin: 0 5px;
}

.page-numbers .active {
  background-color: var(--button-bg1);
  color: var(--button-text1-hover);
}

.page-numbers .ellipsis {
  padding: 5px 10px;
  cursor: default;
}

button {
  padding: 5px 10px;

  border-radius: 4px;
  font-size: 14px;
  height: 38px;
  min-width: 34px;
  border: 1px solid var(--button-border);
  color: var(--button-text0);
  background-color: var(--button-bg0);
  cursor: pointer;
}

button:hover {
  color: var(--button-text1-hover);
  background-color: var(--button-bg1);
}

button.disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.pagination-info {
  position: relative;
  font-size: 12px;
  opacity: 0.5;
  margin-left: 20px;
  height: 38px;
  align-items: center;
  display: flex;
}

.pagination-info input {
  position: relative;
  width: 54px;
  height: 24px;
  line-height: 24px;
  margin: 0 12px;
  background-color: var(--input-bg);
  text-align: center;
  vertical-align: middle;
  padding: 0px 10px;
  border-radius: 4px;
  border: 1px solid var(--input-border);
  outline: none;
  transition: border 0.2s;
}

input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
}

input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
