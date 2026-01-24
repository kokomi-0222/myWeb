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
      :disabled="props.disableAnimation"
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
        :style="[floatingStyles, { opacity: '1', pointerEvents: 'auto' }]"
        @mouseenter="onMenuMouseEnter"
        @mouseleave="onMenuMouseLeave"
      >
        <slot name="menu" :visible="localVisible" :close="hide" />
        <div
          v-if="props.showArrow"
          ref="arrowRef"
          class="global-dropdown-arrow"
          :style="arrowStyle"
        ></div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useUIStore } from "@/stores/ui";
import {
  useFloating,
  autoUpdate,
  offset as floatingOffset,
  flip,
  shift,
  arrow as floatingArrow,
} from "@floating-ui/vue";

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
  showArrow: { type: Boolean, default: true },
  disableAnimation: { type: Boolean, default: false },
});

const emit = defineEmits(["update:visible"]);

// refs
const localVisible = ref(props.visible);
const triggerRef = ref(null);
const menuRef = ref(null);
const arrowRef = ref(null);
const hideTimer = ref(null);

// ====== 新增：Floating UI 定位逻辑 ======
const { floatingStyles, middlewareData } = useFloating(triggerRef, menuRef, {
  open: localVisible,
  whileElementsMounted: autoUpdate, // 自动响应 scroll/resize
  placement: props.placement,
  middleware: [
    // 转换 offsetX/offsetY 为 Floating UI 的 offset
    floatingOffset(({ placement }) => {
      const isVertical = placement.startsWith("top") || placement.startsWith("bottom");
      return {
        mainAxis: isVertical ? props.offsetY : props.offsetX,
        crossAxis: isVertical ? props.offsetX : props.offsetY,
      };
    }),
    //flip(), // 自动翻转防出屏
    //shift({ padding: 5 }), // 微调避让
    //floatingArrow({ element: arrowRef }),
    props.showArrow ? floatingArrow({ element: arrowRef }) : null,
    /* ...(props.showArrow ? [floatingArrow({ element: arrowRef })] : []), */
  ],
});

// 箭头样式（用于动态定位）
const arrowStyle = computed(() => {
  const { x, y } = middlewareData.value.arrow || {};
  if (x == null || y == null) return {};

  return {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,

  };
});

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

// 箭头水平对齐：根据 placement 决定 left 值

// 显示/隐藏逻辑
function show() {
  if (localVisible.value) return;
  localVisible.value = true;
  emit("update:visible", true);
}

function hide() {
  if (!localVisible.value) return;
  localVisible.value = false;
  emit("update:visible", false);
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
  if (props.trigger !== "click" || !localVisible.value) return;

  const inTrigger = triggerRef.value?.contains(event.target);
  const inMenu = menuRef.value?.contains(event.target);

  if (!inTrigger && !inMenu) {
    hide();
  }
}

onMounted(() => {
  if (props.trigger === "click") {
    document.addEventListener("click", handleClickOutside);
  }
});

onUnmounted(() => {
  if (props.trigger === "click") {
    document.removeEventListener("click", handleClickOutside);
  }
});

// ====== 动画钩子（加在 script 最后） ======
function onBeforeEnter(el) {
  if (props.disableAnimation) return;
  el.style.opacity = "0";
  el.style.transform = "scaleY(0.0)";
  el.style.transformOrigin = isTop.value ? "bottom center" : "top center";
  el.style.transition = "none"; // 先禁用过渡
}

function onEnter(el, done) {
  if (props.disableAnimation) {
    done(); // 立即完成，不动画
    return;
  }
  // 强制重排，确保获取到真实尺寸
  el.offsetHeight;

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

function onBeforeLeave(el) {
  if (props.disableAnimation) return;
  // 收起前：确保元素处于“完全显示”状态，然后设置初始动画值
  el.style.opacity = "1";
  el.style.transform = "scaleY(1)";
  el.style.transformOrigin = isTop.value ? "bottom center" : "top center";
  el.style.transition = "none"; // 先禁用过渡，避免闪跳
}

function onLeave(el, done) {
  if (props.disableAnimation) {
    done(); // 立即完成，不动画
    return;
  }
  // 强制重排，确保样式生效
  el.offsetHeight;
  // 开启动画：缩小 + 淡出
  requestAnimationFrame(() => {
    el.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    el.style.opacity = "0";
    el.style.transform = "scaleY(0.0)";
  });

  // 监听 transition 结束
  const onTransitionEnd = () => {
    el.removeEventListener("transitionend", onTransitionEnd);
    done(); // 通知 Vue：可以安全隐藏了（v-show=false 生效）
  };

  el.addEventListener("transitionend", onTransitionEnd);

  // 防止极端情况不触发（比如 duration=0）
  setTimeout(() => {
    if (el.style.opacity !== "0") {
      done();
    }
  }, 300);
}

function onAfterLeave(el) {
  // 动画结束后清理样式
  el.style.opacity = "";
  el.style.transform = "";
  el.style.transition = "";
}
</script>

<style>
.global-dropdown-menu {
  position: absolute;
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
</style>
