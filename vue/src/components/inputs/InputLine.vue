<!-- components/InputLine.vue -->
<template>
  <div class="input-line-wrapper">
    <input
      :id="id"
      :value="innerValue"
      @input="handleInput"
      :placeholder="placeholder"
      :type="inputType"
      :disabled="disabled"
      class="input-line"
      ref="inputRef"
      autocomplete="off"
    />
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
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref, computed, watch } from "vue";

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

const emit = defineEmits(["update:modelValue"]);

const innerValue = ref(props.modelValue);
const isPasswordVisible = ref(false); // 是否显示明文
const inputRef = ref(null);

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

const togglePasswordVisible = () => {
  isPasswordVisible.value = !isPasswordVisible.value;
  // 聚焦回输入框（体验更好）
  inputRef.value?.focus();
};
</script>

<style scoped>
.input-line-wrapper {
  position: relative;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  width: 100%;
}

.input-line {
  flex: 1;
  padding: 10px 0;
  border: none;
  border-bottom: 2px solid #ccc;
  outline: none;
  font-size: 16px;
  transition: border-color 0.3s ease-in-out;
  background: transparent;
}

.input-line-wrapper::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: #007bff;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.7s ease;
}

.input-line-wrapper:hover::after,
.input-line:focus::after {
  transform: scaleX(1);
}

.input-line::placeholder {
  color: #6d6a6a;
}

/* 密码切换按钮样式 */
.password-toggle {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: #888;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
  z-index: 2;
}

.password-toggle:hover {
  color: #007bff;
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
