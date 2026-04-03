<template>
  <!-- 图片按钮 -->
  <div class="upload-btn" @click="triggerUpload">
    <IconPictrue size="16" />
    <input ref="fileInput" type="file" accept="image/*" hidden @change="handleSelect" />
  </div>
</template>

<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  disabled: Boolean,
  // 接收父组件的预览容器 DOM
  previewContainer: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["change"]);

const fileInput = ref(null);
const imageFile = ref(null);
const previewUrl = ref("");
let previewEl = null; // 预览 DOM 元素

// 点击选择图片
function triggerUpload() {
  console.log("点击选择图片");
  fileInput.value?.click();
}

// 选择图片
function handleSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  imageFile.value = file;
  previewUrl.value = URL.createObjectURL(file);
  emit("change", file);
  e.target.value = "";
}

// 清空图片
function clearPreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  imageFile.value = null;
  previewUrl.value = "";
  emit("change", null);
}

// 核心：把预览渲染到父组件的容器里
watch(
  () => [props.previewContainer, imageFile.value],
  () => {
    const container = props.previewContainer;
    if (!container) return;

    // 清空旧预览
    container.innerHTML = "";

    // 没有图片 → 不渲染
    if (!imageFile.value) return;

    // 创建预览 DOM
    const wrap = document.createElement("div");
    wrap.style.position = "relative";
    wrap.style.width = "72px";
    wrap.style.height = "72px";

    const img = document.createElement("img");
    img.src = previewUrl.value;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.borderRadius = "4px";

    const close = document.createElement("button");
    close.innerText = "×";
    close.style.position = "absolute";
    close.style.top = "2px";
    close.style.right = "2px";
    close.style.background = "rgba(0,0,0,0.5)";
    close.style.color = "#fff";
    close.style.border = "none";
    close.style.borderRadius = "50%";
    close.style.width = "20px";
    close.style.height = "20px";
    close.style.cursor = "pointer";
    close.onclick = clearPreview;

    wrap.appendChild(img);
    wrap.appendChild(close);
    container.appendChild(wrap);
    previewEl = wrap;
  },
  { immediate: true }
);
</script>

<style scoped>
.upload-btn {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: #f9f9f9;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: rgba(0, 0, 0, 0.5);
}

.upload-btn:hover {
  background: #f0f0f0;
}

.upload-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
