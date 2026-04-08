<template>
  <!-- 自动布局容器：子组件内部全权控制 -->
  <div class="image-grid-layout" :class="imageLayoutClass">
    <!-- 前8张 -->
    <div
      v-for="(item, idx) in displayMedia"
      :key="item.id || idx"
      class="grid-item"
      :style="gridItemStyle"
      @click="handleImageClick(idx)"
    >
      <div class="loading" v-if="item.status === 'loading'">
        <div class="spinner"></div>
      </div>
      <div class="error" v-if="item.status === 'error'">
        <span>{{ errorText }}</span>
      </div>
      <img
        class="img"
        :src="item.thumbnail_url"
        :alt="item.alt"
        v-if="item.status === 'success'"
      />
       <!-- 第9格：+N -->
    <div v-if="idx === 8 && isOverLimit" class="more-mask">+{{ exceedCount }}</div>
    </div>
  </div>

  <!-- 预览弹窗 -->
  <teleport to="body">
    <Transition
      name="preview-transition"
      @before-enter="onBeforeEnter"
      @after-enter="onAfterEnter"
      @before-leave="onBeforeLeave"
      @after-leave="onAfterLeave"
    >
      <div class="preview-modal" v-if="previewVisible" @wheel.prevent="handleWheelZoom">
        <div class="modal-mask" @click="handleClosePreview"></div>
        <div class="preview-controls">
          <div class="preview-page-index">
            {{ currentPreviewIndex + 1 }} / {{ media.length }}
          </div>
          <button class="preview-close-btn" @click.stop="handleClosePreview">
            <IconClose />
          </button>
          <button
            class="preview-nav-btn prev-btn"
            @click.stop="handlePrevImg"
            v-if="media.length > 1"
          >
            <IconArrow />
          </button>
          <button
            class="preview-nav-btn next-btn"
            @click.stop="handleNextImg"
            v-if="media.length > 1"
          >
            <IconArrow transform="rotate(180)" />
          </button>
          <div class="preview-toolbar">
            <button class="tool-btn" @click.stop="handleZoomIn">
              <IconZoomIn size="20" />
            </button>
            <button class="tool-btn" @click.stop="handleZoomOut">
              <IconZoomOut size="20" />
            </button>
            <button class="tool-btn" @click.stop="handleRotate">
              <IconRotate size="20" />
            </button>
            <button class="tool-btn" @click.stop="handleFlipHorizontal">
              <IconFlip size="20" />
            </button>
            <button class="tool-btn" @click.stop="handleDownload">
              <IconDownload size="20" />
            </button>
          </div>
        </div>
        <div class="preview-content" @click.stop>
          <div
            class="preview-loading"
            :class="{ hidden: !isPreviewLoading }"
            v-if="isPreviewLoading"
          >
            <div class="preview-spinner"></div>
          </div>
          <img
            class="preview-img"
            :src="currentPreviewItem?.preview_url"
            alt="预览"
            v-show="!isPreviewError"
            @load="handlePreviewImgLoad"
            @error="handlePreviewImgError"
            :style="{
              transform: `scale(${zoomScale}) rotate(${rotateDeg}deg) 
            ${flipHorizontal ? 'scaleX(-1)' : ''} 
            ${flipVertical ? 'scaleY(-1)' : ''}`,
              transition: 'transform 0.2s ease',
            }"
          />
          <div
            class="preview-img-error"
            v-if="isPreviewError"
            :style="{ borderRadius: `${radius}px` }"
            @click="reloadPreviewImg"
          >
            <div>{{ errorText }}</div>
            <div style="font-size: 12px; color: #888">加载失败</div>
          </div>
        </div>
      </div>
    </Transition>
  </teleport>
</template>

<script setup>
import { ref, watch, onMounted, computed } from "vue";

const props = defineProps({
  media: { type: Array, default: () => [] },
  width: { type: [Number, String], default: "" },
  height: { type: [Number, String], default: "" },
  radius: { type: [Number, String], default: "6px" },
  errorText: { type: String, default: "加载失败" },
  disableLazy: { type: Boolean, default: false },
});

const emits = defineEmits(["load", "error", "preview-open", "preview-close"]);

// 布局计算
const imageLayout = computed(() => {
  const len = props.media?.length || 0;
  if (len === 1) return "single";
  if (len === 2 || len === 4) return "grid2";
  if (len >= 3) return "grid3";
  return "";
});

const imageLayoutClass = computed(() => `layout-${imageLayout.value}`);

const gridItemSize = computed(() => {
  if (props.width && props.height) {
    return { w: props.width, h: props.height };
  }
  const layout = imageLayout.value;
  if (layout === "single") return { w: "100%", h: "auto" };
  if (layout === "grid2") return { w: "120px", h: "120px" };
  if (layout === "grid3") return { w: "120px", h: "120px" };
  return { w: "100px", h: "100px" };
});

const gridItemStyle = computed(() => ({
  width: gridItemSize.value.w,
  height: gridItemSize.value.h,
  borderRadius: props.radius,
}));

// 媒体状态
const gridMediaList = ref([]);

const initMediaStatus = () => {
  gridMediaList.value = (props.media || []).map((item) => ({
    ...item,
    status: "loading",
  }));
};

const loadImage = (idx) => {
  const item = gridMediaList.value[idx];
  if (!item || !item.thumbnail_url) return;
  item.status = "loading";
  const img = new Image();
  img.src = item.thumbnail_url;
  img.onload = () => {
    item.status = "success";
    emits("load", idx);
  };
  img.onerror = () => {
    item.status = "error";
    emits("error", idx);
  };
};

// 最多显示 9 张，第9张位置用来放 +N
const displayMax = 9;

// 实际要渲染的列表
const displayMedia = computed(() => {
  const list = gridMediaList.value || [];
  return list.slice(0, displayMax);
});

// 是否显示 +N
const isOverLimit = computed(() => {
  return (gridMediaList.value?.length || 0) > displayMax;
});

// 超出数量
const exceedCount = computed(() => {
  return (gridMediaList.value?.length || 0) - displayMax;
});

// 预览
const previewVisible = ref(false);
const currentPreviewIndex = ref(0);
const isPreviewLoading = ref(false);
const isPreviewError = ref(false);

const zoomScale = ref(1);
const rotateDeg = ref(0);
const flipHorizontal = ref(false);
const flipVertical = ref(false);

const currentPreviewItem = computed(() => {
  return props.media?.[currentPreviewIndex.value] || {};
});

const handleImageClick = (idx) => {
  currentPreviewIndex.value = idx;
  previewVisible.value = true;
  isPreviewLoading.value = true;
  isPreviewError.value = false;
  zoomScale.value = 1;
  rotateDeg.value = 0;
  flipHorizontal.value = false;
  flipVertical.value = false;
  emits("preview-open", idx);
};

const handleClosePreview = () => {
  previewVisible.value = false;
  emits("preview-close");
};

const handlePrevImg = () => {
  currentPreviewIndex.value =
    (currentPreviewIndex.value - 1 + props.media.length) % props.media.length;
  isPreviewLoading.value = true;
  isPreviewError.value = false;
};

const handleNextImg = () => {
  currentPreviewIndex.value = (currentPreviewIndex.value + 1) % props.media.length;
  isPreviewLoading.value = true;
  isPreviewError.value = false;
};

const handlePreviewImgLoad = () => {
  isPreviewLoading.value = false;
  isPreviewError.value = false;
};

const handlePreviewImgError = () => {
  isPreviewLoading.value = false;
  isPreviewError.value = true;
};

const reloadPreviewImg = () => {
  isPreviewError.value = false;
  isPreviewLoading.value = true;
};

const handleWheelZoom = (e) => (e.deltaY < 0 ? handleZoomIn() : handleZoomOut());
const handleZoomIn = () => (zoomScale.value = Math.min(3, zoomScale.value + 0.2));
const handleZoomOut = () => (zoomScale.value = Math.max(0.3, zoomScale.value - 0.2));
const handleRotate = () => (rotateDeg.value += 90);
const handleFlipHorizontal = () => (flipHorizontal.value = !flipHorizontal.value);

const handleDownload = () => {
  const url = currentPreviewItem.value?.row_url || currentPreviewItem.value?.preview_url;
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = currentPreviewItem.value?.id || `image`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

onMounted(() => {
  initMediaStatus();
  gridMediaList.value.forEach((_, idx) => loadImage(idx));
});

watch(
  () => props.media,
  () => {
    initMediaStatus();
    gridMediaList.value.forEach((_, idx) => loadImage(idx));
  },
  { deep: true }
);

const onBeforeEnter = (el) => {
  el.style.transform = "translateY(-30px)";
  el.style.opacity = "0";
  el.querySelector(".modal-mask").style.opacity = "0";
};
const onAfterEnter = (el) => {
  el.style.transform = "translateY(0)";
  el.style.opacity = "1";
  el.querySelector(".modal-mask").style.opacity = "1";
};
const onBeforeLeave = (el) => {
  el.style.transform = "translateY(-30px)";
  el.style.opacity = "0";
  el.querySelector(".modal-mask").style.opacity = "0";
};
const onAfterLeave = () => {};
</script>

<style scoped>
/* 布局容器 */
.image-grid-layout {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
}

/* 1张：自适应 */
.layout-single .grid-item {
  width: auto;
  height: auto;
  max-width: 380px;
  max-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.layout-single .grid-item img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  max-width: 380px;
  max-height: 280px;
}

/* 2/4张：120px 四宫格 */
.layout-grid2 {
  display: grid !important;
  grid-template-columns: repeat(2,  1fr);
}
.layout-grid2 .grid-item {
  width: 120px;
  height: 120px;
}

/* 3/≥5张：100px 三列 */
.layout-grid3 {
  display: grid !important;
  grid-template-columns: repeat(3,  1fr);
}
.layout-grid3 .grid-item {
  width: 100px;
  height: 100px;
}

/* 网格项 */
.grid-item {
  position: relative;
  overflow: hidden;
  background: #f5f5f5;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}
.grid-item:hover {
  transform: scale(1.02);
}
.grid-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 第九张遮罩 */
.more-mask {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 1rem;
  z-index: 1;
}
/* 加载 */
.loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}
.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e0e0e0;
  border-top: 2px solid #2a6de9;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 错误 */
.error {
  position: absolute;
  inset: 0;
  background-color: #e6e6e6;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  z-index: 2;
}

/* 预览弹窗 */
.preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease-out, opacity 0.15s ease-out;
  pointer-events: auto;
  touch-action: none;
}

.modal-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  z-index: 1;
  transition: opacity 0.25s ease-out;
}

.preview-controls {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 3;
  pointer-events: none;
}

.preview-page-index {
  position: absolute;
  top: 20px;
  left: 20px;
  color: #fff;
  font-size: 16px;
  padding: 8px 16px;
  border-radius: 4px;
  opacity: 0.8;
  pointer-events: auto;
}

.preview-close-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(50, 50, 50, 0.5);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  cursor: pointer;
  transition: all 0.2s;
  pointer-events: auto;
}
.preview-close-btn:hover {
  opacity: 1;
  background: rgba(50, 50, 50, 0.6);
  transform: scale(1.05);
}

.preview-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: rgba(50, 50, 50, 0.5);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  cursor: pointer;
  transition: all 0.2s;
  pointer-events: auto;
}
.preview-nav-btn:hover {
  opacity: 1;
  background: rgba(50, 50, 50, 0.6);
  transform: translateY(-50%) scale(1.05);
}
.prev-btn {
  left: 20px;
}
.next-btn {
  right: 20px;
}

.preview-content {
  position: relative;
  z-index: 2;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.preview-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  transform-origin: center;
}

.preview-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 50px;
  height: 50px;
  z-index: 10;
}
.preview-spinner {
  width: 50px;
  height: 50px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top: 3px solid #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
.preview-loading.hidden {
  opacity: 0;
  pointer-events: none;
}

.preview-img-error {
  width: 300px;
  height: 300px;
  background: #f5f5f5;
  color: #666;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
}
.preview-img-error:hover {
  background: #eee;
}

/* 底部工具栏 */
.preview-toolbar {
  position: absolute;
  left: 50%;
  bottom: 30px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(50, 50, 50, 0.5);
  padding: 12px 20px;
  border-radius: 22px;
  pointer-events: auto;
}
.tool-btn {
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
}

/* 移动端 */
@media (max-width: 768px) {
  .preview-close-btn {
    width: 36px;
    height: 36px;
  }
  .preview-nav-btn {
    width: 40px;
    height: 40px;
  }
  .preview-toolbar {
    gap: 12px;
    padding: 10px 16px;
  }
  .preview-img-error {
    width: 200px;
    height: 200px;
  }
}
</style>
