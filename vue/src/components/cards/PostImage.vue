<!-- CustomImage.vue 修复翻页箭头关闭问题+优化预览样式 -->
<template>
  <div
    ref="imgContainerRef"
    class="custom-image"
    :style="{ width: `${width}px`, height: `${height}px`, borderRadius: `${radius}px` }"
    :data-img-index="index"
    @click="handleImageClick"
  >
    <div class="loading" v-if="status === 'loading'">
      <div class="spinner"></div>
    </div>
    <div class="error" v-if="status === 'error'">
      <span>{{ errorText }}</span>
    </div>
    <img
      class="img"
      :src="props.src"
      alt=""
      style="object-fit: cover; display: block"
      v-if="status === 'success'"
    />
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
      <!-- 外层仅遮罩触发关闭 -->
      <div class="preview-modal" v-if="previewVisible" @wheel.prevent>
        <!-- 遮罩层单独绑定关闭事件，点击遮罩才关闭 -->
        <div class="modal-mask" @click="handleClosePreview"></div>
        <div class="preview-controls">
          <div class="preview-page-index">
            {{ currentPreviewIndex + 1 }} / {{ previewList.length }}
          </div>
          <!-- 关闭按钮加@click.stop 阻断冒泡 -->
          <button class="preview-close-btn" @click.stop="handleClosePreview">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 20 20"
            >
              <path
                d="M4.106275 4.108583333333334C4.350341666666667 3.8645000000000005 4.746083333333333 3.8645000000000005 4.9901583333333335 4.108583333333334L9.998666666666667 9.117125L15.008583333333334 4.107216666666667C15.252625 3.8631333333333338 15.648375000000001 3.8631333333333338 15.892458333333334 4.107216666666667C16.136541666666666 4.351291666666667 16.136541666666666 4.747025000000001 15.892458333333334 4.9911L10.882541666666667 10.001000000000001L15.891375 15.009791666666667C16.135458333333332 15.253874999999999 16.135458333333332 15.649625 15.891375 15.893708333333334C15.647291666666668 16.13775 15.251541666666668 16.13775 15.0075 15.893708333333334L9.998666666666667 10.884875000000001L4.991233333333334 15.892333333333333C4.747158333333333 16.13641666666667 4.351425 16.13641666666667 4.10735 15.892333333333333C3.8632750000000002 15.648249999999999 3.8632750000000002 15.252541666666666 4.10735 15.008458333333333L9.114791666666667 10.001000000000001L4.106275 4.992466666666667C3.8621916666666665 4.7483916666666675 3.8621916666666665 4.352658333333333 4.106275 4.108583333333334z"
                fill="currentColor"
              ></path>
            </svg>
          </button>
          <!-- 上一页按钮加@click.stop 阻断冒泡 -->
          <button
            class="preview-nav-btn prev-btn"
            @click.stop="handlePrevImg"
            v-if="previewList.length > 1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              xmlns:xlink="http://www.w3.org/1999/xlink"
              width="20"
              height="20"
              viewBox="0 0 20 20"
            >
              <path
                d="M12.733583333333334 2.6830583333333333C12.977666666666668 2.927141666666667 12.977666666666668 3.3228666666666666 12.733583333333334 3.566941666666667L6.595175 9.705375C6.432458333333334 9.868125 6.432458333333334 10.131875 6.595175 10.294625L12.733583333333334 16.433041666666668C12.977666666666668 16.677125 12.977666666666668 17.072875 12.733583333333334 17.316958333333332C12.489541666666668 17.561 12.093791666666666 17.561 11.849708333333334 17.316958333333332L5.711291666666667 11.1785C5.060416666666667 10.527625 5.060416666666667 9.472375 5.711291666666667 8.8215L11.849708333333334 2.6830583333333333C12.093791666666666 2.4389833333333333 12.489541666666668 2.4389833333333333 12.733583333333334 2.6830583333333333z"
                fill="currentColor"
              ></path>
            </svg>
          </button>
          <!-- 下一页按钮加@click.stop 阻断冒泡 -->
          <button
            class="preview-nav-btn next-btn"
            @click.stop="handleNextImg"
            v-if="previewList.length > 1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              xmlns:xlink="http://www.w3.org/1999/xlink"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              transform="rotate(180)"
            >
              <path
                d="M12.733583333333334 2.6830583333333333C12.977666666666668 2.927141666666667 12.977666666666668 3.3228666666666666 12.733583333333334 3.566941666666667L6.595175 9.705375C6.432458333333334 9.868125 6.432458333333334 10.131875 6.595175 10.294625L12.733583333333334 16.433041666666668C12.977666666666668 16.677125 12.977666666666668 17.072875 12.733583333333334 17.316958333333332C12.489541666666668 17.561 12.093791666666666 17.561 11.849708333333334 17.316958333333332L5.711291666666667 11.1785C5.060416666666667 10.527625 5.060416666666667 9.472375 5.711291666666667 8.8215L11.849708333333334 2.6830583333333333C12.093791666666666 2.4389833333333333 12.489541666666668 2.4389833333333333 12.733583333333334 2.6830583333333333z"
                fill="currentColor"
              ></path>
            </svg>
          </button>
          <!-- 底部工具栏 -->
          <div class="preview-toolbar">
            <button class="tool-btn" @click.stop="handleZoomIn">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 1024 1024"
              >
                <path
                  fill="currentColor"
                  d="m795.904 750.72 124.992 124.928a32 32 0 0 1-45.248 45.248L750.656 795.904a416 416 0 1 1 45.248-45.248zM480 832a352 352 0 1 0 0-704 352 352 0 0 0 0 704m-32-384v-96a32 32 0 0 1 64 0v96h96a32 32 0 0 1 0 64h-96v96a32 32 0 0 1-64 0v-96h-96a32 32 0 0 1 0-64z"
                ></path>
              </svg>
            </button>
            <button class="tool-btn" @click.stop="handleZoomOut">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 1024 1024"
              >
                <path
                  fill="currentColor"
                  d="m795.904 750.72 124.992 124.928a32 32 0 0 1-45.248 45.248L750.656 795.904a416 416 0 1 1 45.248-45.248zM480 832a352 352 0 1 0 0-704 352 352 0 0 0 0 704M352 448h256a32 32 0 0 1 0 64H352a32 32 0 0 1 0-64"
                ></path>
              </svg>
            </button>
            <button class="tool-btn" @click.stop="handleRotate">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 1024 1024"
              >
                <path
                  fill="currentColor"
                  d="M784.512 230.272v-50.56a32 32 0 1 1 64 0v149.056a32 32 0 0 1-32 32H667.52a32 32 0 1 1 0-64h92.992A320 320 0 1 0 524.8 833.152a320 320 0 0 0 320-320h64a384 384 0 0 1-384 384 384 384 0 0 1-384-384 384 384 0 0 1 643.712-282.88"
                ></path>
              </svg>
            </button>
            <button class="tool-btn" @click.stop="handleFlipHorizontal">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 1024 1024"
              >
                <path
                  fill="currentColor"
                  d="M771.776 794.88A384 384 0 0 1 128 512h64a320 320 0 0 0 555.712 216.448H654.72a32 32 0 1 1 0-64h149.056a32 32 0 0 1 32 32v148.928a32 32 0 1 1-64 0v-50.56zM276.288 295.616h92.992a32 32 0 0 1 0 64H220.16a32 32 0 0 1-32-32V178.56a32 32 0 0 1 64 0v50.56A384 384 0 0 1 896.128 512h-64a320 320 0 0 0-555.776-216.384z"
                ></path>
              </svg>
            </button>
            <button class="tool-btn" @click.stop="handleDownload">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 1024 1024"
              >
                <path
                  fill="currentColor"
                  d="M160 832h704a32 32 0 1 1 0 64H160a32 32 0 1 1 0-64m384-253.696 236.288-236.352 45.248 45.248L508.8 704 192 387.2l45.248-45.248L480 584.704V128h64z"
                ></path>
              </svg>
            </button>
          </div>
        </div>
        <!-- 图片容器保留@click.stop 防止点击图片触发关闭 -->
        <div class="preview-content" @click.stop>
          <img
            class="preview-img"
            :src="previewList[currentPreviewIndex]"
            alt="预览图片"
            v-if="!isPreviewError"
            @error="isPreviewError = true"
            :style="{
              transform: `scale(${zoomScale}) rotate(${rotateDeg}deg) 
            ${flipHorizontal ? 'scaleX(-1)' : ''} 
            ${flipVertical ? 'scaleY(-1)' : ''}`,
              transition: 'transform 0.2s ease', // 可选：添加过渡动画，更流畅
            }"
          />
          <div class="preview-img-error" v-else :style="{ borderRadius: `${radius}px` }">
            {{ errorText }}
          </div>
        </div>
      </div>
    </Transition>
  </teleport>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, defineEmits } from "vue";

const props = defineProps({
  src: { type: String, required: true },
  previewList: { type: Array, required: true, default: () => [] },
  index: { type: Number, required: true },
  width: { type: [Number, String], default: 100 },
  height: { type: [Number, String], default: 100 },
  radius: { type: [Number, String], default: 8 },
  errorText: { type: String, default: "图片加载失败" },
  disableLazy: { type: Boolean, default: false },
});

const emits = defineEmits([
  "load",
  "error",
  "preview-open",
  "preview-close",
  "preview-error",
]);

const status = ref("loading");
const imgContainerRef = ref(null);
const observer = ref(null);
const previewVisible = ref(false);
const currentPreviewIndex = ref(props.index);
const isPreviewError = ref(false);
const zoomScale = ref(1); // 缩放比例
const rotateDeg = ref(0); // 旋转角度
const flipHorizontal = ref(false); // 水平翻转
const flipVertical = ref(false); // 垂直翻转

const preloadImage = (imgUrl) => {
  if (!imgUrl) {
    status.value = "error";
    emits("error", props.index);
    return;
  }
  status.value = "loading";
  const img = new Image();
  img.src = imgUrl;
  img.onload = () => {
    status.value = "success";
    emits("load", props.index);
  };
  img.onerror = () => {
    status.value = "error";
    emits("error", props.index);
  };
};

const initLazyLoad = () => {
  if (
    props.disableLazy ||
    !imgContainerRef.value ||
    !props.src ||
    !window.IntersectionObserver
  ) {
    preloadImage(props.src);
    return;
  }

  observer.value = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          preloadImage(props.src);
          observer.value.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "200px", threshold: 0 }
  );

  observer.value.observe(imgContainerRef.value);
};

const handleImageClick = () => {
  if (props.previewList.length === 0) return;
  currentPreviewIndex.value = Math.min(props.index, props.previewList.length - 1);
  previewVisible.value = true;
  emits("preview-open", currentPreviewIndex.value);
};
// 移除原handleModalClick，直接用handleClosePreview
const handleClosePreview = () => {
  previewVisible.value = false;
  isPreviewError.value = false;
  emits("preview-close");
};
const handlePrevImg = () => {
  currentPreviewIndex.value =
    (currentPreviewIndex.value - 1 + props.previewList.length) % props.previewList.length;
  isPreviewError.value = false;
};
const handleNextImg = () => {
  currentPreviewIndex.value = (currentPreviewIndex.value + 1) % props.previewList.length;
  isPreviewError.value = false;
};

// 放大
const handleZoomIn = () => {
  if (zoomScale.value >= 3) return; // 最大缩放3倍
  zoomScale.value += 0.2; // 每次递增0.1，可调整步长
};
// 缩小
const handleZoomOut = () => {
  if (zoomScale.value <= 0.3) return; // 最小缩放0.3倍
  zoomScale.value -= 0.2;
};

const handleRotate = () => {
  rotateDeg.value = rotateDeg.value + 90;
};

// 水平翻转（示例：单个按钮切换）
const handleFlipHorizontal = () => {
  flipHorizontal.value = !flipHorizontal.value;
};
// 垂直翻转（可选，如需单独按钮）
const handleFlipVertical = () => {
  flipVertical.value = !flipVertical.value;
};

const handleDownload = () => {
  const imgSrc = props.previewList[currentPreviewIndex.value];
  if (!imgSrc) return; // 无图片地址不执行

  // 创建隐藏的a标签
  const a = document.createElement("a");
  a.href = imgSrc;
  // 设置下载文件名（可自定义，如截取图片url中的文件名，或固定前缀）
  a.download = `image-${currentPreviewIndex.value + 1}`;
  // 触发点击下载
  document.body.appendChild(a);
  a.click();
  // 移除a标签
  document.body.removeChild(a);
};

onMounted(() => {
  initLazyLoad();
});

onUnmounted(() => {
  if (observer.value) {
    observer.value.disconnect();
    observer.value = null;
  }
});

watch(
  () => props.src,
  (newSrc) => {
    if (!newSrc || !imgContainerRef.value) return;
    setTimeout(() => {
      initLazyLoad();
    }, 0);
  },
  { immediate: true, deep: true }
);

// 动画钩子函数
const onBeforeEnter = (el) => {
  // 进入前：图片向上偏移50px + 透明
  el.style.transform = "translateY(-50px)";
  el.style.opacity = "0";
  el.querySelector(".modal-mask").style.opacity = "0";
};

const onAfterEnter = (el) => {
  // 进入后：过渡到正常位置 + 完全显示
  el.style.transform = "translateY(0)";
  el.style.opacity = "1";
  el.querySelector(".modal-mask").style.opacity = "1";
};

const onBeforeLeave = (el) => {
  // 离开前：图片向上偏移50px + 透明（收缩效果）
  el.style.transform = "translateY(-50px)";
  el.style.opacity = "0";
  el.querySelector(".modal-mask").style.opacity = "0";
};

const onAfterLeave = () => {
  // 离开后：重置状态
  previewVisible.value = false;
  isPreviewError.value = false;
  emits("preview-close");
};
</script>

<style scoped>
.custom-image {
  position: relative;
  cursor: pointer;
  overflow: hidden;
  background-color: #f5f5f5;
  transition: transform 0.2s ease;
}
.custom-image:hover {
  transform: scale(1.02);
}

.loading {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
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

.error {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #979797;
  color: #3b3b3b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  z-index: 2;
}

.img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
  margin: 0;
  padding: 0;
  z-index: 1;
}

/* 预览弹窗样式：仅微调层级，其余不变 */
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
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1;
  transition: opacity 0.25s ease-out;
  /* 新增 */
  pointer-events: auto;
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
  color: #ffffff;
  font-size: 16px;
  padding: 8px 16px;
  border-radius: 4px;
  opacity: 0.8;
  transition: opacity 0.2s ease;
  pointer-events: auto;
}
.preview-page-index:hover {
  opacity: 1;
}

.preview-close-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background-color: rgba(50, 50, 50, 0.5);
  color: #ffffff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  transition: all 0.2s ease;
  pointer-events: auto;
}
.preview-close-btn:hover {
  opacity: 1;
  background-color: rgba(50, 50, 50, 0.6);
  transform: scale(1.05);
}
.preview-close-btn svg {
  fill: #ffffff;
}

.preview-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background-color: rgba(50, 50, 50, 0.5);
  color: #ffffff;
  border: none;
  cursor: pointer;
  font-size: 24px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  transition: all 0.2s ease;
  pointer-events: auto;
}

.preview-nav-btn:hover {
  opacity: 1;
  background-color: rgba(50, 50, 50, 0.6);
  transform: translateY(-50%) scale(1.05);
}
.preview-nav-btn.prev-btn {
  left: 20px;
}
.preview-nav-btn.next-btn {
  right: 20px;
}

.preview-content {
  position: relative;
  z-index: 2;
  pointer-events: auto;
}

.preview-img {
  max-width: 100vw;
  max-height: 100vh;
  object-fit: contain;
  transform-origin: center;
}

.preview-img-error {
  width: 300px;
  height: 300px;
  background-color: #979797;
  color: #3b3b3b;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
}

/* 底部工具栏样式 */
.preview-toolbar {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  left: 50%;
  bottom: 30px;
  transform: translate(-50%);
  height: 44px;
  background-color: rgba(50, 50, 50, 0.5);

  padding: 0px 23px;
  border-color: rgb(255, 255, 255);
  border-radius: 22px;
  padding: 12px 20px;
  display: flex;
  gap: 16px;
  transition: opacity 0.2s ease;
  pointer-events: auto;
}

.tool-btn {
  background-color: transparent;
  border: none;
  color: #ffffff;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .preview-page-index {
    top: 15px;
    left: 15px;
    font-size: 14px;
    padding: 6px 12px;
  }

  .preview-close-btn {
    top: 15px;
    right: 15px;
    width: 36px;
    height: 36px;
  }

  .preview-nav-btn {
    width: 48px;
    height: 48px;
    font-size: 20px;
  }

  .preview-nav-btn.prev-btn {
    left: 15px;
  }

  .preview-nav-btn.next-btn {
    right: 15px;
  }

  .preview-img-error {
    width: 200px;
    height: 200px;
    font-size: 14px;
  }

  .preview-toolbar {
    gap: 12px;
    padding: 10px 16px;
  }
  .tool-btn {
    font-size: 12px;
    padding: 6px 10px;
  }
}
</style>
