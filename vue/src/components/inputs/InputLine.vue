<!-- components/InputLine.vue -->
<template>
  <div class="input-line-wrapper">
    <div v-if="searchTypes.length > 0" class="search-type-select">
      <Dropdown
        v-model:visible="dropdownVisible"
        trigger="click"
        menuClass="dropdown-menu--inputLine"
        :offsetY="5"
        :showArrow="true"
        placement="bottom"
        :disableAnimation="true"
      >
        <template #trigger>
          <div class="dropdown-trigger">
            <span style="margin-bottom: 2px; font-size: 0.9rem">{{ currentLabel }} </span>
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
        <IconEye :size="16" :open="isPasswordVisible" />
      </span>
      <button
        v-if="searchTypes.length > 0"
        class="search-btn"
        type="button"
        @click="handleSearch"
        aria-label="搜索"
      >
        <IconSearch :size="18" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import Dropdown from "../modules/Dropdown.vue";

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

const emit = defineEmits(["update:modelValue", "blur", "focus", "search"]);

const innerValue = ref(props.modelValue);
const isPasswordVisible = ref(false); // 是否显示明文
const inputRef = ref(null);
const dropdownVisible = ref(false);
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
    inputRef.value?.focus();
  },
});
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
  font-size: 0.9rem;
  color: var(--input-line-label);
  pointer-events: none;
  transition: all 0.3s ease;
  transform-origin: left;
}

.floating-label.focused {
  top: -20px;
  font-size: 0.8rem;
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
  font-size: 0.9rem;
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

.dropdown-trigger {
  display: inline-flex;
  cursor: pointer;
}

/* 自定义箭头 */
.select-arrow {
  margin-left: 5px;
  padding-right: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  border-right: 1px solid var(--input-line-label);
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

<style>
.dropdown-menu--inputLine {
  width: 64px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 8px 0px;
  background-color: var(--bg-primary);
}
</style>
