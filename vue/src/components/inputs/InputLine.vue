<!-- components/InputLine.vue -->
<template>
  <div class="input-line-wrapper">
    <div v-if="searchTypes.length > 0" class="search-type-select">
      <el-dropdown trigger="click" @command="handleCommand">
        <span class="el-dropdown-link">
          <div >{{ currentLabel }}</div>
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
    <div class="input-field">
      <label
        v-if="props.label"
        :for="id"
        class="floating-label"
        :class="{ focused: isLabelFloating }"
      >
        {{ props.label }}
      </label>
      <input
        :id="id"
        :value="innerValue"
        @input="handleInput"
        @focus="handleFocus"
        @blur="handleBlur"
        :type="inputType"
        :disabled="disabled"
        class="input-line"
        ref="inputRef"
        autocomplete="off"
      />
    </div>
    <div class="right-button">
      <span
        v-if="showTogglePassword"
        class="password-toggle"
        @click="togglePasswordVisible"
      >
        <!-- 简易 SVG 眼睛图标（无需依赖 icon 库） -->
        <svg
          v-if="isPasswordVisible"
          width="16"
          height="16"
          viewBox="0 0 1024 1024"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill="currentColor"
            d="M512 160c320 0 512 352 512 352S832 864 512 864 0 512 0 512s192-352 512-352m0 64c-225.28 0-384.128 208.064-436.8 288 52.608 79.872 211.456 288 436.8 288 225.28 0 384.128-208.064 436.8-288-52.608-79.872-211.456-288-436.8-288m0 64a224 224 0 1 1 0 448 224 224 0 0 1 0-448m0 64a160.19 160.19 0 0 0-160 160c0 88.192 71.744 160 160 160s160-71.808 160-160-71.744-160-160-160"
          ></path>
        </svg>
        <svg
          v-else
          height="16"
          viewBox="0 0 1024 1024"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill="currentColor"
            d="M876.8 156.8c0-9.6-3.2-16-9.6-22.4s-12.8-9.6-22.4-9.6-16 3.2-22.4 9.6L736 220.8c-64-32-137.6-51.2-224-60.8-160 16-288 73.6-377.6 176S0 496 0 512s48 73.6 134.4 176c22.4 25.6 44.8 48 73.6 67.2l-86.4 89.6c-6.4 6.4-9.6 12.8-9.6 22.4s3.2 16 9.6 22.4 12.8 9.6 22.4 9.6 16-3.2 22.4-9.6l704-710.4c3.2-6.4 6.4-12.8 6.4-22.4m-646.4 528Q115.2 579.2 76.8 512q43.2-72 153.6-172.8C304 272 400 230.4 512 224c64 3.2 124.8 19.2 176 44.8l-54.4 54.4C598.4 300.8 560 288 512 288c-64 0-115.2 22.4-160 64s-64 96-64 160c0 48 12.8 89.6 35.2 124.8L256 707.2c-9.6-6.4-19.2-16-25.6-22.4m140.8-96Q352 555.2 352 512c0-44.8 16-83.2 48-112s67.2-48 112-48c28.8 0 54.4 6.4 73.6 19.2zM889.599 336c-12.8-16-28.8-28.8-41.6-41.6l-48 48c73.6 67.2 124.8 124.8 150.4 169.6q-43.2 72-153.6 172.8c-73.6 67.2-172.8 108.8-284.8 115.2-51.2-3.2-99.2-12.8-140.8-28.8l-48 48c57.6 22.4 118.4 38.4 188.8 44.8 160-16 288-73.6 377.6-176S1024 528 1024 512s-48.001-73.6-134.401-176"
          ></path>
          <path
            fill="currentColor"
            d="M511.998 672c-12.8 0-25.6-3.2-38.4-6.4l-51.2 51.2c28.8 12.8 57.6 19.2 89.6 19.2 64 0 115.2-22.4 160-64 41.6-41.6 64-96 64-160 0-32-6.4-64-19.2-89.6l-51.2 51.2c3.2 12.8 6.4 25.6 6.4 38.4 0 44.8-16 83.2-48 112s-67.2 48-112 48"
          ></path>
        </svg>
      </span>
      <button
        v-if="searchTypes.length > 0"
        class="search-btn"
        type="button"
        @click="handleSearch"
        aria-label="搜索"
      >
        <el-icon :size="16"><Search /></el-icon>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { Search } from "@element-plus/icons-vue";
const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: "",
  },
  placeholder: {
    type: String,
    default: "",
  },
  type: {
    type: String,
    default: "text",
    validator: (val) => ["text", "password", "email", "tel"].includes(val),
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
    default: "",
  },
  searchTypes: { type: Array, default: [] },
});

const emit = defineEmits([
  "update:modelValue",
  "blur",
  "focus",
  "search",
  "update:searchType",
]);

const innerValue = ref(props.modelValue);
const isPasswordVisible = ref(false); // 是否显示明文
const inputRef = ref(null);

const isFocused = ref(false);

const isLabelFloating = computed(() => {
  return isFocused.value || innerValue.value?.toString().trim() !== "";
});

// 同步外部 modelValue 更新（父组件修改 v-model 时）
watch(
  () => props.modelValue,
  (newVal) => {
    innerValue.value = newVal;
  }
);

const id = `input-line-${Math.random().toString(36).substring(2, 11)}`;

// 计算当前 input 的实际 type
const inputType = computed(() => {
  if (props.type === "password") {
    return isPasswordVisible.value ? "text" : "password";
  }
  return props.type;
});

// 是否显示眼睛图标？
const showTogglePassword = computed(() => {
  return (
    props.type === "password" &&
    !props.disabled &&
    innerValue.value?.toString().trim() !== ""
  );
});

const handleInput = (e) => {
  const val = e.target.value;
  innerValue.value = val;
  emit("update:modelValue", val);
};

const handleFocus = () => {
  isFocused.value = true;
  emit("focus");
};

const handleBlur = () => {
  isFocused.value = false;
  emit("blur");
};

const togglePasswordVisible = () => {
  isPasswordVisible.value = !isPasswordVisible.value;
  // 聚焦回输入框（体验更好）
  inputRef.value?.focus();
};

const innerSearchType = ref(props.searchTypes[0]?.value || "");
const currentLabel = computed(() => {
  return props.searchTypes.find((o) => o.value === innerSearchType.value)?.label;
});

function handleSearch() {
  const keyword = innerValue.value.trim();
  const type = innerSearchType.value || (props.searchTypes[0]?.value ?? "");
  emit("search", { keyword, type });
}

function handleCommand(type) {
  innerSearchType.value = type.value;
}

defineExpose({
  focus() {
    inputRef.value?.focus()
  }
})

</script>

<style scoped>
.input-line-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  transform: translateZ(0);
  user-select: none;
}

.input-field {
  position: relative;
  flex: 1;
  /*  padding: 2px; */
  display: flex;
  align-items: center;
  justify-content: center;
 /*  border-left: 1px solid var(--input-line-label); */
}

.right-button {
  position: relative;
  height: 32px;
  padding: 2px;
  margin-left: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.floating-label {
  position: absolute;
  top: -2px;
  left: 2px;
  font-size: 14px;
  color: var(--input-line-label);
  pointer-events: none;
  transition: all 0.3s ease;
  transform-origin: left;
}

.floating-label.focused {
  top: -20px;
  font-size: 12px;
  color: var(--input-line-label-focus);
  transform: scale(0.85);
}

.input-line {
  width: 100%;
  border: none;
  line-height: 20px;
  align-items: flex-end;
  /*   border-bottom: 2px solid var(--input-line-border-bottom); */
  outline: none;
  font-size: 14px;
  transition: border-color 0.3s ease-in-out;
  background: transparent;
  color: var(--input-line-content); /* 确保输入文字颜色正常 */
}

.input-line-wrapper::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: var(--input-line-border-bottom);
  background-image: linear-gradient(
    to right,
    var(--input-line-wrapper-after),
    var(--input-line-wrapper-after)
  );
  background-size: 0 100%;
  background-repeat: no-repeat;
  background-position: left center;
  transition: background-size 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.7s;
  pointer-events: none;
}

.input-line-wrapper:hover::after {
  background-size: 100% 100%;
}

.input-line-wrapper:focus-within::after {
  background-size: 100% 100%;
  box-shadow: 0 -2px 4px var(--input-line-password-toggle-hover);
}

.input-line::placeholder {
  color: var(--input-line-placeholder);
}

.search-type-select {
  margin-right: 2px;
  padding: 4px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;
}



.search-type-select .el-dropdown-link {
  cursor: pointer;
  color: var(--text-primary);
  display: flex;
  align-items: flex-end;
  width: 100%;
  white-space: nowrap;
}

.search-type-select .el-dropdown-link:hover{
  color: var(--primary-color);
}


/* 自定义箭头 */
.select-arrow {
  margin-left: 5px;
  padding-right: 5px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  opacity: 0.5;
  border-right: 1px solid var(--input-line-label);
}

.select-arrow svg {
  display: block;
}

.el-dropdown-menu {
  background-color: var(--bg-primary);
}

:deep(.el-dropdown-menu__item) {
  color: var(--text-secondary);
  background-color: var(--bg-primary);
}

:deep(.el-dropdown-menu__item:hover),
:deep(.el-dropdown-menu__item:focus) {
  color: var(--primary-color);
  background-color: var(--bg-secondary);
}

/* 密码切换按钮样式 */
.password-toggle {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  margin-right: 4px;
  color: var(--input-line-password-toggle);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
  z-index: 2;
}

.password-toggle:hover {
  color: var(--input-line-password-toggle-hover);
}

.search-btn {
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
  background-color: transparent;
  line-height: 32px;
  cursor: pointer;
  transition: background-color 0.3s;
  opacity: 0.5;
}

.search-btn:hover {
  /* color: var(--primary-color); */
  transform: scale(1.2);
}

/* 不显示浏览器默认 */
input.input-line::-ms-reveal,
input.input-line::-ms-clear {
  display: none !important;
}

input.input-line::-webkit-credentials-auto-fill-button,
input.input-line::-webkit-caps-lock-indicator {
  display: none !important;
  visibility: hidden !important;
}
</style>
