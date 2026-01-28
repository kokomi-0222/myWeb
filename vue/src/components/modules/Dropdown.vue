<template>
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
        :class="['global-dropdown-wrapper']"
        :style="floatingStyles"
        @mouseenter="onMenuMouseEnter"
        @mouseleave="onMenuMouseLeave"
      >
        <div
          :class="['global-dropdown-menu', props.menuClass]"
          :style="menuAnimationStyle"
        >
          <slot name="menu" :visible="localVisible" :close="hide" />
          <div v-if="props.showArrow" ref="arrowRef" :style="arrowStyle"></div>
        </div>
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
  arrow as floatingArrow,
  flip,
  shift,
} from "@floating-ui/vue";

const props = defineProps({
  visible: { type: Boolean, default: false },
  "onUpdate:visible": Function,
  trigger: { type: String, default: "hover" },
  placement: {
    type: String,
    default: "bottom",
    validator: (v) =>
      [
        "top-start",
        "top",
        "top-end",
        "right",
        "right-start",
        "right-end",
        "bottom-start",
        "bottom",
        "bottom-end",
        "left",
        "left-start",
        "left-end",
      ].includes(v),
  },
  menuClass: { type: String, default: "" },
  delay: { type: Number, default: 200 },
  offsetY: { type: Number, default: 0 },
  offsetX: { type: Number, default: 0 },
  showArrow: { type: Boolean, default: true },
  disableAnimation: { type: Boolean, default: false },
  arrowColor: { type: String, default: "#ffffff" },
  arrowBorderColor: { type: String, default: "#e5e7eb" },
  arrowSize: { type: Number, default: 8 },
});

const emit = defineEmits(["update:visible"]);

// 核心Ref
const localVisible = ref(props.visible);
const triggerRef = ref(null);
const menuRef = ref(null);
const arrowRef = ref(null);
const hideTimer = ref(null);
const showTimer = ref(null);

// 判断方向：垂直（top/bottom）/水平（left/right）
const isVerticalPlacement = computed(() => {
  return props.placement.startsWith("top") || props.placement.startsWith("bottom");
});

// 🌟 新增：根据placement确定transformOrigin和缩放方向
const animationConfig = computed(() => {
  const vertical = isVerticalPlacement.value;
  // 垂直方向：scaleY + transformOrigin（top/bottom center）
  if (vertical) {
    return {
      transformOrigin: props.placement.startsWith("top") 
        ? "bottom center"  // top菜单：从底部中心展开
        : "top center",    // bottom菜单：从顶部中心展开
      scaleProp: "scaleY",
      collapseValue: 0,   // 收起时缩放值
      expandValue: 1      // 展开时缩放值
    };
  }
  // 水平方向：scaleX + transformOrigin（left/right center）
  return {
    transformOrigin: props.placement.startsWith("left")
      ? "center right"   // left菜单：从右侧中心展开
      : "center left",   // right菜单：从左侧中心展开
    scaleProp: "scaleX",
    collapseValue: 0,
    expandValue: 1
  };
});

// FloatingUI 配置（保留）
const { floatingStyles, middlewareData, update } = useFloating(triggerRef, menuRef, {
  open: localVisible,
  whileElementsMounted: autoUpdate,
  placement: props.placement,
  strategy: "absolute",
  middleware: [
    floatingOffset(({ placement }) => {
      const isVertical = placement.startsWith("top") || placement.startsWith("bottom");
      return {
        mainAxis: isVertical ? props.offsetY : props.offsetX,
        crossAxis: isVertical ? props.offsetX : props.offsetY,
      };
    }),
    floatingArrow({
      element: arrowRef,
      padding: 12,
    }),
  ],
});

// 🌟 核心修正：动画样式（严格匹配你的要求）
const menuAnimationStyle = computed(() => {
  const config = animationConfig.value;
  const isExpanded = localVisible.value;
  
  // 拼接transform值（仅缩放，无位移）
  const transform = `${config.scaleProp}(${isExpanded ? config.expandValue : config.collapseValue})`;
  
  return {
    opacity: isExpanded ? "1" : "0",
    pointerEvents: isExpanded ? "auto" : "none",
    transform,
    transformOrigin: config.transformOrigin,
    // 展开/离开动画时长区分：展开0.3s，离开0.2s（通过transition控制）
    transition: props.disableAnimation
      ? "none"
      : `
          opacity ${isExpanded ? '0.3s' : '0.2s'} ease,
          transform ${isExpanded ? '0.3s' : '0.2s'} ease
        `,
    // 关键：避免裁剪，确保布局整洁
    overflow: "visible",
    position: "relative", // 箭头定位需要
  };
});

// 箭头样式（保留）
const arrowStyle = computed(() => {
  const { x, y } = middlewareData.value.arrow || { x: 0, y: 0 };
  const arrowHalf = props.arrowSize / 2;
  const baseStyle = {
    position: "absolute",
    width: `${props.arrowSize}px`,
    height: `${props.arrowSize}px`,
    background: props.arrowColor,
    border: `1px solid ${props.arrowBorderColor}`,
    transform: "rotate(45deg)",
    transformOrigin: "center",
    boxSizing: "border-box",
    pointerEvents: "none",
    zIndex: 2001,
    margin: 0,
    padding: 0,
  };

  if (props.placement.startsWith("top")) {
    return {
      ...baseStyle,
      left: `${x}px`,
      bottom: `-${arrowHalf}px`,
      borderTop: "none",
      borderLeft: "none",
    };
  } else if (props.placement.startsWith("bottom")) {
    return {
      ...baseStyle,
      left: `${x}px`,
      top: `-${arrowHalf}px`,
      borderBottom: "none",
      borderRight: "none",
    };
  } else if (props.placement.startsWith("left")) {
    return {
      ...baseStyle,
      top: `${y}px`,
      right: `-${arrowHalf}px`,
      borderLeft: "none",
      borderBottom: "none",
    };
  } else if (props.placement.startsWith("right")) {
    return {
      ...baseStyle,
      top: `${y}px`,
      left: `-${arrowHalf}px`,
      borderTop: "none",
      borderRight: "none",
    };
  }
  return baseStyle;
});

// show/hide方法（保留）
const show = () => {
  if (localVisible.value) return;
  clearTimeout(hideTimer.value);
  localVisible.value = true;
  emit("update:visible", true);
  nextTick(() => update());
};

const hide = () => {
  if (!localVisible.value) return;
  clearTimeout(showTimer.value);
  localVisible.value = false;
  emit("update:visible", false);
  clearTimeout(hideTimer.value);
};

// 交互事件（保留）
const onTriggerMouseEnter = () => {
  if (props.trigger !== "hover") return;
  clearTimeout(hideTimer.value);
  showTimer.value = setTimeout(() => {
    show();
  }, 50);
};

const onTriggerMouseLeave = () => {
  if (props.trigger !== "hover") return;
  clearTimeout(showTimer.value);
  hideTimer.value = setTimeout(hide, props.delay);
};

const onMenuMouseEnter = () => {
  if (props.trigger === "hover") {
    clearTimeout(hideTimer.value);
    clearTimeout(showTimer.value);
  }
};

const onMenuMouseLeave = () => {
  if (props.trigger === "hover") {
    hideTimer.value = setTimeout(hide, props.delay);
  }
};

const handleClick = (e) => {
  if (props.trigger !== "click") return;
  e.stopPropagation();
  localVisible.value ? hide() : show();
};

const handleClickOutside = (e) => {
  if (props.trigger !== "click" || !localVisible.value) return;
  const inTrigger = triggerRef.value?.contains(e.target);
  const inMenu = menuRef.value?.contains(e.target);
  if (!inTrigger && !inMenu) hide();
};

// 🌟 修正动画钩子（严格匹配缩放逻辑）
const onBeforeEnter = (el) => {
  if (props.disableAnimation) return;
  const menuEl = el.querySelector(".global-dropdown-menu");
  if (menuEl) {
    const config = animationConfig.value;
    // 进入前：初始状态（缩放0 + 透明）
    menuEl.style.opacity = "0";
    menuEl.style.transform = `${config.scaleProp}(0)`;
    menuEl.style.transformOrigin = config.transformOrigin;
  }
};

const onEnter = (el, done) => {
  if (props.disableAnimation) {
    done();
    return;
  }
  const menuEl = el.querySelector(".global-dropdown-menu");
  if (!menuEl) {
    done();
    return;
  }

  const config = animationConfig.value;
  // 强制重绘
  menuEl.offsetHeight;

  // 展开动画：scaleY/X(1) + opacity(1)（时长0.3s）
  requestAnimationFrame(() => {
    menuEl.style.opacity = "1";
    menuEl.style.transform = `${config.scaleProp}(1)`;
    menuEl.style.transition = "opacity 0.3s ease, transform 0.3s ease";
  });

  const onEnd = (e) => {
    if (["transform", "opacity"].includes(e.propertyName)) {
      menuEl.removeEventListener("transitionend", onEnd);
      done();
    }
  };
  menuEl.addEventListener("transitionend", onEnd);
};

const onBeforeLeave = (el) => {
  if (props.disableAnimation) return;
  const menuEl = el.querySelector(".global-dropdown-menu");
  if (menuEl) {
    const config = animationConfig.value;
    // 离开前：保持展开状态
    menuEl.style.opacity = "1";
    menuEl.style.transform = `${config.scaleProp}(1)`;
    menuEl.style.transformOrigin = config.transformOrigin;
  }
};

const onLeave = (el, done) => {
  if (props.disableAnimation) {
    done();
    return;
  }
  const menuEl = el.querySelector(".global-dropdown-menu");
  if (!menuEl) {
    done();
    return;
  }

  const config = animationConfig.value;
  // 强制重绘
  menuEl.offsetHeight;

  // 离开动画：scaleY/X(0) + opacity(0)（时长0.2s）
  requestAnimationFrame(() => {
    menuEl.style.opacity = "0";
    menuEl.style.transform = `${config.scaleProp}(0)`;
    menuEl.style.transition = "opacity 0.2s ease, transform 0.2s ease";
  });

  const onEnd = (e) => {
    if (["transform", "opacity"].includes(e.propertyName)) {
      menuEl.removeEventListener("transitionend", onEnd);
      done();
    }
  };
  menuEl.addEventListener("transitionend", onEnd);
  setTimeout(() => done(), 200); // 对应离开动画时长0.2s
};

const onAfterLeave = (el) => {
  const menuEl = el.querySelector(".global-dropdown-menu");
  if (menuEl) {
    // 清空内联样式，恢复默认
    menuEl.style.transform = "";
    menuEl.style.opacity = "";
    menuEl.style.transformOrigin = "";
    menuEl.style.transition = "";
  }
};

// 生命周期（保留）
onMounted(() => {
  if (props.trigger === "click") document.addEventListener("click", handleClickOutside);
  nextTick(() => {
    if (localVisible.value) update();
  });
});

onUnmounted(() => {
  if (props.trigger === "click")
    document.removeEventListener("click", handleClickOutside);
  clearTimeout(hideTimer.value);
  clearTimeout(showTimer.value);
});

// 监听（保留）
watch(
  () => props.visible,
  (val) => {
    localVisible.value = val;
    if (val) {
      nextTick(() => update());
    }
  },
  { immediate: true }
);

const uiStore = useUIStore();
watch(
  () => uiStore.screenSize,
  () => hide()
);

watch(
  () => props.placement,
  () => {
    if (localVisible.value) {
      update();
    }
  }
);

watch(
  () =>props.trigger,
  (val) => {
    if (val === "click") {
      document.addEventListener("click", handleClickOutside);
    } else {
      document.removeEventListener("click", handleClickOutside);
    }
  }
)

</script>

<style scoped>
/* 外层容器：确保不裁剪内容 */
.global-dropdown-wrapper {
  position: absolute !important;
  z-index: 1000 !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  overflow: visible !important;
}

/* 菜单容器：基础样式，确保布局整洁 */
.global-dropdown-menu {
  box-sizing: border-box !important;
  min-width: 10px;
  overflow: visible !important;
  position: relative;
  /* 防止缩放时菜单内容模糊 */
  backface-visibility: hidden;
  transform: translateZ(0);
}
</style>