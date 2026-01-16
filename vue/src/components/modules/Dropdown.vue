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
    <div
      v-show="localVisible"
      ref="menuRef"
      :class="['global-dropdown-menu', props.menuClass]"
      :style="menuStyle"
      @mouseenter="onMenuMouseEnter"
      @mouseleave="onMenuMouseLeave"
    >
      <slot name="menu" :visible="localVisible" :close="hide" />
      <div class="global-dropdown-arrow" :class="arrowClass" :style="arrowStyle"></div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";

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
/* function updatePosition() {
  if (!triggerRef.value || !menuRef.value) return

  const triggerRect = triggerRef.value.getBoundingClientRect()
  const menuRect = menuRef.value.getBoundingClientRect()

  let top = 0
  let left = 0

  const [vertical, horizontal] = props.placement.split('-')

  // 垂直定位
  if (vertical === 'bottom') {
    top = triggerRect.bottom + window.scrollY
  } else if (vertical === 'top') {
    top = triggerRect.top - menuRect.height + window.scrollY
  }

  // 水平定位
  if (horizontal === 'start') {
    left = triggerRect.left + window.scrollX
  } else if (horizontal === 'end') {
    left = triggerRect.right - menuRect.width + window.scrollX
  } else {
    // 居中对齐（placement 为 'top' 或 'bottom'）
    left = triggerRect.left + (triggerRect.width - menuRect.width) / 2 + window.scrollX
  }

  // 边界检测（简化版，可扩展）
  if (left < window.scrollX) left = window.scrollX
  if (left + menuRect.width > window.innerWidth + window.scrollX) {
    left = window.innerWidth - menuRect.width + window.scrollX
  }
  if (top < window.scrollY) top = window.scrollY
  if (top + menuRect.height > window.innerHeight + window.scrollY) {
    if (vertical === 'bottom') {
      top = triggerRect.top - menuRect.height + window.scrollY
    }
  }

  menuStyle.value.top = `${top}px`
  menuStyle.value.left = `${left}px`
} */

function updatePosition() {
  if (!triggerRef.value || !menuRef.value) return;

  const triggerRect = triggerRef.value.getBoundingClientRect();
  const menuRect = menuRef.value.getBoundingClientRect();

  const [vertical, horizontal] = props.placement.split("-");

  let top = 0;
  let left = 0;

  // 垂直
  if (vertical === "bottom") {
    top = triggerRect.bottom;
  } else if (vertical === "top") {
    top = triggerRect.top - menuRect.height;
  }

  // 水平
  if (horizontal === "start") {
    left = triggerRect.left;
  } else if (horizontal === "end") {
    left = triggerRect.right - menuRect.width;
  } else {
    left = triggerRect.left + (triggerRect.width - menuRect.width) / 2;
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
</script>

<style>
.global-dropdown-menu {
  position: fixed;
  z-index: 2000;
  /*  background: white; */
  /*  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); */
  opacity: 0;
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
</style>
