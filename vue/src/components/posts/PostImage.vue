<!-- CustomImage.vue 带超时功能的最终版 -->
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
      <div class="preview-modal" v-if="previewVisible" @wheel.prevent="handleWheelZoom">
        <div class="modal-mask" @click="handleClosePreview"></div>
        <div class="preview-controls">
          <div class="preview-page-index">
            {{ currentPreviewIndex + 1 }} / {{ previewList.length }}
          </div>
          <button class="preview-close-btn" @click.stop="handleClosePreview">
            <IconClose />
          </button>
          <button
            class="preview-nav-btn prev-btn"
            @click.stop="handlePrevImg"
            v-if="previewList.length > 1"
          >
            <IconArrow />
          </button>
          <button
            class="preview-nav-btn next-btn"
            @click.stop="handleNextImg"
            v-if="previewList.length > 1"
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
            :src="currentPreviewSrc"
            alt="预览图片"
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
            <div style="font-size: 12px; color: #888">
              加载超时
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </teleport>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, shallowRef, computed } from "vue";

const props = defineProps({
  src: { type: String, required: true },
  previewList: { type: Array, default: () => [] },
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
// 预览弹窗核心状态
const status = ref("loading");
const imgContainerRef = ref(null);
const observer = ref(null);
// 预览弹窗核心状态
const previewVisible = ref(false);
const currentPreviewIndex = ref(props.index);
const isPreviewLoading = ref(false);
const isPreviewError = ref(false);
const currentPreviewSrc = ref(""); // 直接存当前预览图URL，取消computed避免响应式问题
// 图片操作状态
const zoomScale = ref(1); // 缩放比例
const rotateDeg = ref(0); // 旋转角度
const flipHorizontal = ref(false); // 水平翻转
const flipVertical = ref(false); // 垂直翻转

// 超时相关配置
const loadTimeoutTimer = ref(null); // 超时定时器
const MAX_RETRY_COUNT = 2; // 最大重试次数
const LOAD_TIMEOUT = 8000; // 超时时间8秒
const retryCountMap = shallowRef(new Map()); // 记录每张图片的重试次数

const previewImgCache = shallowRef(new Map());
// 页面刷新标记：刷新后重新生成，用于清除浏览器缓存
if (!window._imgRefreshFlag) {
  window._imgRefreshFlag = Date.now();
}

// 生成带缓存控制的URL（刷新加时间戳，缓存命中用原URL）
const genPreviewUrl = (url) => {
  if (!url) return "";
  if (previewImgCache.value.has(url)) {
    return url; // 有缓存，用原URL复用浏览器缓存
  }
  // 无缓存，加时间戳清除浏览器缓存（仅刷新生效）
  return `${url}${url.includes("?") ? "&" : "?"}t=${window._imgRefreshFlag}`;
};
// 预加载单张图片
const preloadSingleImg = (url) => {
  if (!url || previewImgCache.value.has(url)) return;
  const img = new Image();
  img.src = genPreviewUrl(url);
  img.onload = () => previewImgCache.value.set(url, true);
};

// 预加载上下张图片
const preloadNearbyImgs = (currentIdx) => {
  const { previewList } = props;
  if (previewList.length <= 1) return;
  // 下一张
  const nextIdx = (currentIdx + 1) % previewList.length;
  preloadSingleImg(previewList[nextIdx]);
  // 上一张
  const prevIdx = (currentIdx - 1 + previewList.length) % previewList.length;
  preloadSingleImg(previewList[prevIdx]);
};

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
  if (observer.value) {
    observer.value.disconnect();
    observer.value = null;
  }
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

// 加载超时处理方法
const handleLoadTimeout = (url) => {
  if (isPreviewLoading.value && currentPreviewSrc.value.includes(url)) {
    isPreviewLoading.value = false;
    isPreviewError.value = true;
    // 超时累加重试次数
    const currentRetry = retryCountMap.value.get(url) || 0;
    retryCountMap.value.set(url, currentRetry + 1);
    emits("preview-error", currentPreviewIndex.value, "图片加载超时");
  }
};

//  打开预览弹窗
const handleImageClick = () => {
  if (props.previewList.length === 0) return;
  previewVisible.value = true;
  const targetIdx = Math.min(props.index, props.previewList.length - 1);
  currentPreviewIndex.value = targetIdx;
  const targetUrl = props.previewList[targetIdx];
  currentPreviewSrc.value = genPreviewUrl(targetUrl);
  // 判断缓存，控制加载动画
  isPreviewLoading.value = !previewImgCache.value.has(targetUrl);
  isPreviewError.value = false;

  // 启动超时定时器
  if (loadTimeoutTimer.value) clearTimeout(loadTimeoutTimer.value);
  if (isPreviewLoading.value) {
    loadTimeoutTimer.value = setTimeout(() => {
      handleLoadTimeout(targetUrl);
    }, LOAD_TIMEOUT);
  }

  // 预加载上下张
  preloadNearbyImgs(targetIdx);

  emits("preview-open", targetIdx);
};

// 关闭预览弹窗
const handleClosePreview = () => {
  previewVisible.value = false;
  isPreviewError.value = false;
  // 重置图片操作状态
  zoomScale.value = 1;
  rotateDeg.value = 0;
  flipHorizontal.value = false;
  flipVertical.value = false;
  
  //清除超时定时器+重置重试次数
  if (loadTimeoutTimer.value) {
    clearTimeout(loadTimeoutTimer.value);
    loadTimeoutTimer.value = null;
  }
  const currentUrl = props.previewList[currentPreviewIndex.value];
  if (currentUrl) retryCountMap.value.delete(currentUrl);
  
  emits("preview-close");
};

// 切换图片时精准控制加载状态
const handlePrevImg = () => {
  const newIdx =
    (currentPreviewIndex.value - 1 + props.previewList.length) % props.previewList.length;
  currentPreviewIndex.value = newIdx;
  const newUrl = props.previewList[newIdx];
  if (!newUrl) return;
  
  // 先赋值URL，再控制状态
  currentPreviewSrc.value = genPreviewUrl(newUrl);
  isPreviewLoading.value = !previewImgCache.value.has(newUrl);
  isPreviewError.value = false;

  // 启动超时定时器
  if (loadTimeoutTimer.value) clearTimeout(loadTimeoutTimer.value);
  if (isPreviewLoading.value) {
    loadTimeoutTimer.value = setTimeout(() => {
      handleLoadTimeout(newUrl);
    }, LOAD_TIMEOUT);
  }

  preloadNearbyImgs(newIdx);
};

// 切换下一张同理
const handleNextImg = () => {
  const newIdx = (currentPreviewIndex.value + 1) % props.previewList.length;
  currentPreviewIndex.value = newIdx;
  const newUrl = props.previewList[newIdx];
  if (!newUrl) return;
  
  // 先赋值URL，再控制状态
  currentPreviewSrc.value = genPreviewUrl(newUrl);
  isPreviewLoading.value = !previewImgCache.value.has(newUrl);
  isPreviewError.value = false;

  // 启动超时定时器
  if (loadTimeoutTimer.value) clearTimeout(loadTimeoutTimer.value);
  if (isPreviewLoading.value) {
    loadTimeoutTimer.value = setTimeout(() => {
      handleLoadTimeout(newUrl);
    }, LOAD_TIMEOUT);
  }

  preloadNearbyImgs(newIdx);
};

// 预览图加载成功：关闭加载动画，存入缓存
const handlePreviewImgLoad = () => {
  // 清除超时定时器
  if (loadTimeoutTimer.value) {
    clearTimeout(loadTimeoutTimer.value);
    loadTimeoutTimer.value = null;
  }
  
  isPreviewLoading.value = false;
  isPreviewError.value = false;
  const currentUrl = props.previewList[currentPreviewIndex.value];
  previewImgCache.value.set(currentUrl, true);
  retryCountMap.value.delete(currentUrl); // 加载成功清空重试次数

  const MAX_CACHE_SIZE = 50;
  if (previewImgCache.value.size > MAX_CACHE_SIZE) {
    // 删除最早加入的缓存
    const firstKey = previewImgCache.value.keys().next().value;
    previewImgCache.value.delete(firstKey);
  }
};

// 预览图加载失败：关闭加载动画，标记错误
const handlePreviewImgError = () => {
  // 清除超时定时器
  if (loadTimeoutTimer.value) {
    clearTimeout(loadTimeoutTimer.value);
    loadTimeoutTimer.value = null;
  }
  
  isPreviewLoading.value = false;
  isPreviewError.value = true;
  
  // 重试次数判断，超过上限则剔除缓存
  const currentUrl = props.previewList[currentPreviewIndex.value];
  const currentRetry = retryCountMap.value.get(currentUrl) || 0;
  if (currentRetry >= MAX_RETRY_COUNT) {
    previewImgCache.value.delete(currentUrl); // 剔除失效缓存
    retryCountMap.value.delete(currentUrl);
  } else {
    retryCountMap.value.set(currentUrl, currentRetry + 1);
  }
  
  emits("preview-error", currentPreviewIndex.value);
};

// 脚本：新增重试方法
const reloadPreviewImg = () => {
  const currentUrl = props.previewList[currentPreviewIndex.value];
  if (!currentUrl) return;
  
  // 移除失败的缓存，强制重新加载
  previewImgCache.value.delete(currentUrl);
  // 重新生成URL（加时间戳）
  currentPreviewSrc.value = genPreviewUrl(currentUrl);
  // 重置状态
  isPreviewError.value = false;
  isPreviewLoading.value = true;

  // 启动重试超时定时器
  if (loadTimeoutTimer.value) clearTimeout(loadTimeoutTimer.value);
  loadTimeoutTimer.value = setTimeout(() => {
    handleLoadTimeout(currentUrl);
  }, LOAD_TIMEOUT);
};

// 滚轮缩放
const handleWheelZoom = (e) => {
  e.deltaY < 0 ? handleZoomIn() : handleZoomOut();
};

// 放大
const handleZoomIn = () => {
  if (zoomScale.value >= 3) return;
  zoomScale.value += 0.2;
};

// 缩小
const handleZoomOut = () => {
  if (zoomScale.value <= 0.3) return;
  zoomScale.value -= 0.2;
};

const handleRotate = () => {
  rotateDeg.value = rotateDeg.value + 90;
};

const handleFlipHorizontal = () => {
  flipHorizontal.value = !flipHorizontal.value;
};

const handleFlipVertical = () => {
  flipVertical.value = !flipVertical.value;
};

const handleDownload = () => {
  const rawUrl = currentPreviewSrc.value.split("?")[0];
  if (!rawUrl) {
    alert("图片地址无效，无法下载");
    return;
  }

  try {
    const a = document.createElement("a");
    a.href = rawUrl;
    a.download = `image-${currentPreviewIndex.value + 1}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 修复：仅当是blob URL时才释放
    if (rawUrl.startsWith("blob:")) {
      URL.revokeObjectURL(a.href);
    }
  } catch (e) {
    // 兼容跨域/无法下载的情况
    alert("当前图片无法直接下载，可右键图片选择“图片另存为”");
    console.warn("下载失败：", e);
  }
};

onMounted(() => {
  initLazyLoad();
});

onUnmounted(() => {
  if (observer.value) {
    observer.value.disconnect();
    observer.value = null;
  }
  // 组件卸载清除定时器和重试记录
  if (loadTimeoutTimer.value) {
    clearTimeout(loadTimeoutTimer.value);
    loadTimeoutTimer.value = null;
  }
  retryCountMap.value.clear();
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
  el.style.transform = "translateY(-50px)";
  el.style.opacity = "0";
  el.querySelector(".modal-mask").style.opacity = "0";
};

const onAfterEnter = (el) => {
  el.style.transform = "translateY(0)";
  el.style.opacity = "1";
  el.querySelector(".modal-mask").style.opacity = "1";
};

const onBeforeLeave = (el) => {
  el.style.transform = "translateY(-50px)";
  el.style.opacity = "0";
  el.querySelector(".modal-mask").style.opacity = "0";
};

const onAfterLeave = () => {
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

/* 预览弹窗样式 */
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
  min-width: 100px;
  min-height: 100px;
}

.preview-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 50px;
  height: 50px;
  z-index: 10;
  opacity: 1;
  transition: opacity 0.2s ease;
}

.preview-loading.hidden {
  opacity: 0;
  pointer-events: none;
}

.preview-spinner {
  width: 50px;
  height: 50px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top: 3px solid #ffffff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.preview-img-error {
  width: 300px;
  height: 300px;
  background-color: #f5f5f5; 
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
  border-radius: 8px; 
  font-size: 14px;
  cursor: pointer; 
  transition: background-color 0.2s ease;
  text-align: center;
  padding: 20px;
  box-sizing: border-box;
}

.preview-img-error:hover {
  background-color: #eee;
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

  .preview-spinner {
    width: 40px;
    height: 40px;
  }
}
</style>