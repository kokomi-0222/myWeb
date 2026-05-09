<template>
  <div class="input-text-wrapper">
    <input
      :id="id"
      :value="innerValue"
      @input="handleInput"
      @focus="handleFocus"
      @blur="handleBlur"
      :type="inputType"
      :disabled="disabled"
      :placeholder="placeholder"
      class="input-text"
      ref="inputRef"
      autocomplete="off"
    />
    <div class="right-button">
      <span
        v-if="showTogglePassword"
        class="password-toggle"
        @click="togglePasswordVisible"
      >
        <IconEye :size="16" :open="isPasswordVisible" />
      </span>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, watch } from "vue";

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
});

const emit = defineEmits(["update:modelValue", "blur", "focus", "search"]);

const innerValue = ref(props.modelValue);
const isPasswordVisible = ref(false); // 是否显示明文
const inputRef = ref(null);
const isFocused = ref(false);

watch(
  () => props.modelValue,
  (newVal) => {
    innerValue.value = newVal;
  }
);
const id = `input-text-${Math.random().toString(36).substring(2, 11)}`;
const inputType = computed(() => {
  if (props.type === "password") {
    return isPasswordVisible.value ? "text" : "password";
  }
  return props.type;
});
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

defineExpose({
  focus() {
    inputRef.value?.focus();
  },
});
</script>

<style scoped>
.input-text-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  transform: translateZ(0);
  user-select: none;
  border: 1px solid #c3c6ca;
  border-radius: 4px;
  width: 100%;
}

.input-text-wrapper:focus-within {
  border-color: var(--primary-color) !important;
}

.input-text {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 2px 16px;
  border: none;
  font-size: 14px;
  outline: none;
}

.right-button {
  position: relative;
  height: 32px;
  padding: 2px;
  margin-left: 8px;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

input.input-text::-ms-reveal,
input.input-text::-ms-clear {
  display: none !important;
}

input.input-text::-webkit-credentials-auto-fill-button,
input.input-text::-webkit-caps-lock-indicator {
  display: none !important;
  visibility: hidden !important;
}
</style>
