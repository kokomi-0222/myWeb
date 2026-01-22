<template>
  <!-- 根节点必须是单个元素才能继承 attrs，但我们用 Teleport，所以手动处理 -->
  <div
    ref="triggerRef"
    @click="handleClick"
    @mouseenter="onTriggerMouseEnter"
    @mouseleave="onTriggerMouseLeave"
  >
    <slot name="trigger" />
  </div>

  <Teleport to="body">
    <Transition
      :css="false"
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @before-leave="onBeforeLeave"
      @leave="onLeave"
      @after-leave="onAfterLeave"
    >
      <div
        v-show="localVisible"
        ref="menuRef"
        :class="['global-dropdown-menu', props.menuClass]"
        :style="menuStyle"
        @mouseenter="onMenuMouseEnter"
        @mouseleave="onMenuMouseLeave"
      >
        <slot name="menu" :visible="localVisible" :close="hide" />
        <div
          v-if="props.arrow"
          class="global-dropdown-arrow"
          :class="arrowClass"
          :style="arrowStyle"
        ></div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useUIStore } from "@/stores/ui";
const props = defineProps({
  visible: { type: Boolean, default: false },
  "onUpdate:visible": Function,
  trigger: { type: String, default: "hover" }, // 'hover' | 'click'
  placement: {
    type: String,
    default: "bottom",
    validator: (value) =>
      ["top-start", "top", "top-end", "bottom-start", "bottom", "bottom-end"].includes(
        value
      ),
  },
  menuClass: { type: String, default: "" },
  delay: { type: Number, default: 200 },
  offsetY: { type: Number, default: 0 },
  offsetX: { type: Number, default: 0 },
  arrow: { type: Boolean, default: true },
});

const emit = defineEmits(["update:visible"]);

// refs
const triggerRef = ref(null);
const menuRef = ref(null);
const localVisible = ref(props.visible);
const justOpened = ref(false);
const hideTimer = ref(null);

// 同步外部 visible
watch(
  () => props.visible,
  (val) => {
    localVisible.value = val;
  }
);
//监听外部屏幕尺寸变化时关闭
const uiStore = useUIStore();
watch(
  () => uiStore.screenSize,
  (size) => {
    hide();
  }
);

// 计算属性
const isTop = computed(() => props.placement.startsWith("top"));
const isBottom = computed(() => props.placement.startsWith("bottom"));

const arrowClass = computed(() => {
  return isTop.value ? "global-dropdown-arrow--down" : "global-dropdown-arrow--up";
});

// 箭头水平对齐：根据 placement 决定 left 值
const arrowStyle = computed(() => {
  const horizontal = props.placement.split("-")[1]; // 'start', undefined, 'end'
  if (horizontal === "start") {
    return { left: "8px" };
  } else if (horizontal === "end") {
    return { right: "8px", left: "auto" };
  } else {
    return { left: "50%", transform: "translateX(-50%)" };
  }
});

// 菜单样式
const menuStyle = ref({
  position: "fixed",
  top: "0px",
  left: "0px",
  zIndex: 2000,
  opacity: 0,
  transition: "opacity 0.2s ease",
  pointerEvents: "none", // 初始禁用交互
});

// 显示/隐藏逻辑
function show() {
  if (localVisible.value) return;
  justOpened.value = true;
  localVisible.value = true;
  nextTick(() => {
    updatePosition();
    menuStyle.value.opacity = "1";
    menuStyle.value.pointerEvents = "auto";
  });
  setTimeout(() => {
    justOpened.value = false;
  }, 150);
}

function hide() {
  if (!localVisible.value) return;
  localVisible.value = false;
  menuStyle.value.opacity = "0";
  menuStyle.value.pointerEvents = "none";
  emit("update:visible", false);
}

// 定位计算
function updatePosition() {
  if (!triggerRef.value || !menuRef.value) return;

  const triggerRect = triggerRef.value.getBoundingClientRect();
  const menuRect = menuRef.value.getBoundingClientRect();

  const [vertical, horizontal] = props.placement.split("-");

  let top = 0;
  let left = 0;

  // 垂直
  if (vertical === "bottom") {
    top = triggerRect.bottom + props.offsetY;
  } else if (vertical === "top") {
    top = triggerRect.top - menuRect.height - props.offsetY;
  }

  // 水平
  if (horizontal === "start") {
    left = triggerRect.left + props.offsetX;
  } else if (horizontal === "end") {
    left = triggerRect.right - menuRect.width + props.offsetX;
  } else {
    if (triggerRect.width >= menuRect.width) {
      left = triggerRect.left + (triggerRect.width - menuRect.width) / 2 + props.offsetX;
    } else {
      left = triggerRect.left - (menuRect.width - triggerRect.width) / 2 + props.offsetX;
    }
  }

  // 边界校正
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 水平
  if (left < 0) left = 0;
  if (left + menuRect.width > vw) left = vw - menuRect.width;

  // 垂直
  if (top < 0) top = 0;
  if (top + menuRect.height > vh) {
    if (vertical === "bottom") {
      top = Math.max(0, triggerRect.top - menuRect.height);
    }
  }

  menuStyle.value.top = `${top}px`;
  menuStyle.value.left = `${left}px`;
}

// 鼠标事件（hover 模式）
function onTriggerMouseEnter() {
  if (props.trigger === "hover") {
    clearTimeout(hideTimer.value);
    show();
  }
}
function onTriggerMouseLeave() {
  if (props.trigger === "hover") {
    hideTimer.value = setTimeout(hide, props.delay);
  }
}
function onMenuMouseEnter() {
  if (props.trigger === "hover") {
    clearTimeout(hideTimer.value);
  }
}
function onMenuMouseLeave() {
  if (props.trigger === "hover") {
    hideTimer.value = setTimeout(hide, props.delay);
  }
}

// 点击事件（click 模式）
function handleClick(event) {
  if (props.trigger !== "click") return;
  event.stopPropagation();
  if (localVisible.value) {
    hide();
  } else {
    show();
  }
}

// 点击外部关闭
function handleClickOutside(event) {
  if (props.trigger !== "click" || !localVisible.value || justOpened.value) return;

  const inTrigger = triggerRef.value?.contains(event.target);
  const inMenu = menuRef.value?.contains(event.target);

  if (!inTrigger && !inMenu) {
    hide();
  }
}

// 防抖更新
let resizeObserver;
const debouncedUpdate = () => {
  if (localVisible.value) {
    requestAnimationFrame(updatePosition);
  }
};

onMounted(() => {
  if (props.trigger === "click") {
    document.addEventListener("click", handleClickOutside);
  }
  window.addEventListener("resize", debouncedUpdate);
  window.addEventListener("scroll", debouncedUpdate, { passive: true });

  // 可选：监听 DOM 变化（更健壮）
  resizeObserver = new ResizeObserver(debouncedUpdate);
  if (triggerRef.value) resizeObserver.observe(triggerRef.value);
});

onUnmounted(() => {
  if (props.trigger === "click") {
    document.removeEventListener("click", handleClickOutside);
  }
  window.removeEventListener("resize", debouncedUpdate);
  window.removeEventListener("scroll", debouncedUpdate);
  if (resizeObserver) resizeObserver.disconnect();
});

// ====== 动画钩子（加在 script 最后） ======
function onBeforeEnter(el) {
  // 动画开始前：隐藏内容，设置初始状态
  el.style.opacity = "0";
  el.style.transform = "scaleY(0.8)";
  el.style.transformOrigin = isTop.value ? "bottom center" : "top center";
  el.style.transition = "none"; // 先禁用过渡
}

function onEnter(el, done) {
  // 强制重排，确保获取到真实尺寸
  const { height } = el.getBoundingClientRect();

  // 立即开启过渡
  requestAnimationFrame(() => {
    el.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    el.style.opacity = "1";
    el.style.transform = "scaleY(1)";
  });

  // 动画结束后回调
  const onTransitionEnd = () => {
    el.removeEventListener("transitionend", onTransitionEnd);
    done();
  };
  el.addEventListener("transitionend", onTransitionEnd);
}

function onAfterLeave(el) {
  // 动画结束后清理样式
  el.style.opacity = "";
  el.style.transform = "";
  el.style.transition = "";
}

function onBeforeLeave(el) {
  // 收起前：确保元素处于“完全显示”状态，然后设置初始动画值
  el.style.opacity = '1'
  el.style.transform = 'scaleY(1)'
  el.style.transformOrigin = isTop.value ? 'bottom center' : 'top center'
  el.style.transition = 'none' // 先禁用过渡，避免闪跳
}

function onLeave(el, done) {
  // 强制重排，确保样式生效
  el.offsetHeight

  // 开启动画：缩小 + 淡出
  requestAnimationFrame(() => {
    el.style.transition = 'opacity 0.25s ease, transform 0.25s ease'
    el.style.opacity = '0'
    el.style.transform = 'scaleY(0.8)'
  })

  // 监听 transition 结束
  const onTransitionEnd = () => {
    el.removeEventListener('transitionend', onTransitionEnd)
    done() // 通知 Vue：可以安全隐藏了（v-show=false 生效）
  }

  el.addEventListener('transitionend', onTransitionEnd)

  // 防止极端情况不触发（比如 duration=0）
  setTimeout(() => {
    if (el.style.opacity !== '0') {
      done()
    }
  }, 300)
}

</script>

<style>
.global-dropdown-menu {
  position: fixed;
  z-index: 2000;
  /* opacity: 0; */
  transition: opacity 0.2s ease;
  pointer-events: none;
}

/* 箭头 */
.global-dropdown-arrow {
  position: absolute;
  width: 0;
  height: 0;
  border-style: solid;
}

/* 向上的箭头（用于 bottom*） */
.global-dropdown-arrow--up {
  bottom: 100%;
  border-width: 0 6px 6px 6px;
  border-color: transparent transparent white transparent;
}

/* 向下的箭头（用于 top*） */
.global-dropdown-arrow--down {
  top: 100%;
  border-width: 6px 6px 0 6px;
  border-color: white transparent transparent transparent;
}

/* 默认居中 */
.global-dropdown-arrow {
  left: 50%;
  transform: translateX(-50%);
}

/* 左对齐 */
.global-dropdown-arrow[style*="left: 8px"] {
  left: 8px;
  transform: none;
}

/* 右对齐 */
.global-dropdown-arrow[style*="right: 8px"] {
  right: 8px;
  left: auto;
  transform: none;
}

/* 动画 */
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dropdown-enter-to,
.dropdown-leave-from {
  opacity: 1;
  transform: scale(1);
}
</style>
