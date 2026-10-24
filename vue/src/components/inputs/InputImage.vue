<template>
  <!-- 上传按钮 -->
  <div
    class="upload-btn"
    :class="{ 'is-compressing': compressing }"
    @click="triggerUpload"
    :disabled="disabled"
  >
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
import setting from "@/config/setting";
import { message } from "@/utils/message";
import { compressImages } from "@/utils/imageCompress";

const props = defineProps({
  disabled: Boolean,
  previewContainer: { type: Object, default: null }, // 目标容器 DOM
  maxCount: { type: Number, default: 20 },
  itemWidth: { type: [String, Number], default: "80px" },
  itemHeight: { type: [String, Number], default: "80px" },
  radius: { type: [String, Number], default: "4px" },
  gap: { type: [String, Number], default: "6px" },
});

const emit = defineEmits(["change", "change-total"]);
const fileInput = ref(null);
const imageList = ref([]);
// 压缩期间锁住按钮，避免大图还在编码时又点一次选图
const compressing = ref(false);

/**
 * 把「已经存在服务器上的图片」铺进预览区（编辑帖子时回填用）。
 * 这类项没有 file，只有 url；提交时不会再上传，直接把 url 交给后端。
 */
function setRemoteImages(list) {
  imageList.value.forEach((item) => {
    if (!item.remote) URL.revokeObjectURL(item.url);
  });
  imageList.value = (list || []).map((m) => ({
    id: "r" + Math.random().toString(36).slice(2),
    url: m.url,
    file: null,
    remote: true,
  }));
  emitTotal();
}

/**
 * 完整列表（含老图 + 新选的图），顺序就是用户在预览区看到的顺序。
 * 老的 `change` 只给新选的 File 数组，保持原有调用方不用改。
 */
function emitTotal() {
  emit(
    "change-total",
    imageList.value.map((item) => ({
      id: item.id,
      url: item.url,
      file: item.file || null,
      remote: !!item.remote,
    }))
  );
}

defineExpose({ setRemoteImages });

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

async function handleSelect(e) {
  const picked = Array.from(e.target.files || []);
  // 立刻清空，否则连续选同一个文件不会再触发 change
  e.target.value = "";
  if (!picked.length || compressing.value) return;

  // 先按数量上限截断，避免压缩根本用不上的图
  const room = props.maxCount === 1 ? 1 : props.maxCount - imageList.value.length;
  const candidates = picked.slice(0, Math.max(0, room));
  if (!candidates.length) return;

  // 服务器（Nginx）的请求体上限是 2MB，超了会在网络层直接返回 413，
  // 前端拿不到响应体，页面只会显示含糊的「网络异常」。
  // 所以在这里先压到上限以内；压不动的（动图、极致尺寸仍超限）再明确提示。
  compressing.value = true;
  let result;
  try {
    result = await compressImages(candidates, setting.imageSize);
  } finally {
    compressing.value = false;
  }

  const { files, compressedCount, failed, skippedAnimated } = result;

  if (failed.length) {
    message.warning(
      skippedAnimated.length
        ? `GIF 动图无法自动压缩，请换一张静态图（上限 ${setting.imageSizeText}）`
        : `图片压缩后仍超过 ${setting.imageSizeText}，请换一张`
    );
  }
  if (compressedCount) {
    message.success(`${compressedCount} 张图片已自动压缩到 ${setting.imageSizeText} 以内`);
  }
  if (!files.length) return;

  // 单图模式：替换已有图片
  if (props.maxCount === 1) {
    imageList.value.forEach((item) => {
      if (!item.remote) URL.revokeObjectURL(item.url);
    });
    const file = files[0];
    imageList.value = [{
      file,
      url: URL.createObjectURL(file),
      id: Math.random().toString(36).slice(2),
    }];
    emit("change", [file]);
    emitTotal();
    return;
  }

  files.forEach((file) => {
    imageList.value.push({
      file,
      url: URL.createObjectURL(file),
      id: Math.random().toString(36).slice(2),
    });
  });

  emit(
    "change",
    imageList.value.filter((item) => item.file).map((item) => item.file)
  );
  emitTotal();
}

// 删除
function deleteImage(id) {
  const index = imageList.value.findIndex((item) => item.id === id);
  if (index > -1) {
    if (!imageList.value[index].remote) {
      URL.revokeObjectURL(imageList.value[index].url);
    }
    imageList.value.splice(index, 1);
    emit(
      "change",
      imageList.value.filter((item) => item.file).map((item) => item.file)
    );
    emitTotal();
  }
}
</script>

<style scoped>
/* 按钮 */
.upload-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-secondary);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.upload-btn:hover {
  background: var(--bg-hover);
  color: var(--primary-color);
}
.upload-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
/* 压缩中：不可再点，给个明显的弱化反馈 */
.upload-btn.is-compressing {
  opacity: 0.45;
  pointer-events: none;
  cursor: progress;
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
