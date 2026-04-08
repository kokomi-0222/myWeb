<template>
  <!-- 上传按钮 -->
  <div class="upload-btn" @click="triggerUpload" :disabled="disabled">
    <IconPictrue size="16" />
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      hidden
      multiple
      @change="handleSelect"
    />
  </div>

  <!-- 预览区域：写在模板里，用 Teleport 传送到外部 DOM -->
  <Teleport :to="previewContainer" v-if="previewContainer">
    <div class="preview-wrap" :class="imageLayoutClass">
      <div v-for="item in imageList" :key="item.id" class="preview-item">
        <img :src="item.url" class="preview-img" />
        <button class="preview-delete" @click="deleteImage(item.id)">×</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  disabled: Boolean,
  previewContainer: { type: Object, default: null }, // 目标容器 DOM
  maxCount: { type: Number, default: 20 },
  itemWidth: { type: [String, Number], default: "80px" },
  itemHeight: { type: [String, Number], default: "80px" },
  radius: { type: [String, Number], default: "4px" },
  gap: { type: [String, Number], default: "6px" },
});

const emit = defineEmits(["change"]);
const fileInput = ref(null);
const imageList = ref([]);

// 布局类名
const imageLayoutClass = computed(() => {
  const len = imageList.value.length;
  if (len === 1) return "layout-single";
  if (len === 2 || len === 4) return "layout-grid2";
  if (len >= 3) return "layout-grid3";
  return "";
});

// 选择图片
function triggerUpload() {
  fileInput.value?.click();
}

function handleSelect(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const available = props.maxCount - imageList.value.length;
  const newFiles = files.slice(0, available);

  newFiles.forEach((file) => {
    imageList.value.push({
      file,
      url: URL.createObjectURL(file),
      id: Math.random().toString(36).slice(2),
    });
  });

  emit(
    "change",
    imageList.value.map((item) => item.file)
  );
  e.target.value = "";
}

// 删除
function deleteImage(id) {
  const index = imageList.value.findIndex((item) => item.id === id);
  if (index > -1) {
    URL.revokeObjectURL(imageList.value[index].url);
    imageList.value.splice(index, 1);
    emit(
      "change",
      imageList.value.map((item) => item.file)
    );
  }
}
</script>

<style scoped>
/* 按钮 */
.upload-btn {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: #f9f9f9;
  cursor: pointer;
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
  opacity: 0.6;
  cursor: not-allowed;
}

/* 预览布局 */
.preview-wrap {
  display: grid;
  flex-wrap: wrap;
  margin-top: 8px;
  width: fit-content;
  box-sizing: border-box;
  gap: v-bind(gap);
}

/* 布局规则 */
.preview-wrap.layout-single {
  grid-template-columns: 1fr;
}
.preview-wrap.layout-grid2 {
  grid-template-columns: repeat(2, 1fr);
}
.preview-wrap.layout-grid3 {
  grid-template-columns: repeat(3, 1fr);
}

/* 预览项：固定宽高 */
.preview-item {
  position: relative;
  overflow: hidden;
  background: #f5f5f5;
  width: v-bind(itemWidth);
  height: v-bind(itemHeight);
  border-radius: v-bind(radius);
}

/* 图片 */
.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 删除按钮 */
.preview-delete {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
</style>
