<template>
  <Dropdown
    v-model:visible="open"
    trigger="click"
    :placement="align === 'start' ? 'bottom-start' : 'bottom-end'"
    :offset-y="6"
    :offset-x="0"
    :show-arrow="false"
    menu-class="select-menu-host"
    :z-index="panelZ"
  >
    <template #trigger>
      <button
        ref="triggerRef"
        type="button"
        class="select-trigger"
        :class="[`select-trigger--${size}`, { 'is-open': open }]"
        aria-haspopup="listbox"
        :aria-expanded="open"
      >
        <span class="select-trigger__text">{{ currentLabel }}</span>
        <IconArrow class="select-trigger__arrow" :size="size === 'sm' ? 10 : 11" />
      </button>
    </template>

    <template #menu="{ close }">
      <ul
        class="select-menu"
        role="listbox"
        :style="{ minWidth: `${menuWidth}px` }"
        @keydown.esc="close()"
      >
        <li
          v-for="opt in options"
          :key="String(opt.value)"
          class="select-option"
          :class="{ 'is-active': opt.value === modelValue }"
          role="option"
          :aria-selected="opt.value === modelValue"
          @click="pick(opt, close)"
        >
          {{ opt.label }}
        </li>
      </ul>
    </template>
  </Dropdown>
</template>

<script setup>
import { computed, ref, watch, nextTick, onUnmounted } from "vue";
import Dropdown from "@/components/modules/Dropdown.vue";
import IconArrow from "@/components/icons/IconArrow.vue";

/**
 * 站内统一样式的下拉选择器。
 *
 * 为什么不用原生 <select>：展开后的选项列表由操作系统/浏览器自绘，
 * CSS 完全管不到（白底、方角、灰色高亮条），暗色主题下尤其突兀，
 * 跟站内 32px/8px 圆角 + --dropdown-bg 浮层完全不是一套语言。
 * 这里用 Dropdown（floating-ui + Teleport 到 body）自绘面板。
 *
 * 用法：
 *   <SelectBox v-model="type" :options="TYPE_OPTIONS" @change="reload" />
 *   <SelectBox v-model="days" size="sm" :options="DAY_OPTIONS" />
 */
const props = defineProps({
  modelValue: { type: [String, Number], default: "" },
  // [{ value, label }]
  options: { type: Array, default: () => [] },
  // md = 32px（与 .admin-btn 对齐）/ sm = 28px
  size: { type: String, default: "md" },
  // 面板相对按钮的对齐方向：end 右对齐（默认，贴右侧的筛选框用）/ start 左对齐
  align: { type: String, default: "end" },
  placeholder: { type: String, default: "" },
  // 浮层层级：放在后台详情弹窗（3000）里时要传 3100，否则会被弹窗盖住
  panelZ: { type: Number, default: 1010 },
});

const emit = defineEmits(["update:modelValue", "change"]);

const open = ref(false);
const triggerRef = ref(null);
const menuWidth = ref(0);

const currentLabel = computed(() => {
  const hit = props.options.find((o) => o.value === props.modelValue);
  return hit ? hit.label : props.placeholder;
});

// 面板跟按钮等宽，视觉上像「从按钮里拉下来」
const syncWidth = () => {
  if (triggerRef.value) menuWidth.value = triggerRef.value.offsetWidth;
};

const pick = (opt, close) => {
  if (opt.value !== props.modelValue) {
    emit("update:modelValue", opt.value);
    emit("change", opt.value);
  }
  close();
};

const onKeydown = (e) => {
  if (e.key === "Escape") open.value = false;
};

watch(open, (val) => {
  if (val) {
    syncWidth();
    nextTick(syncWidth);
    document.addEventListener("keydown", onKeydown);
  } else {
    document.removeEventListener("keydown", onKeydown);
  }
});

onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
/* ---------- 触发按钮：尺寸/配色与 .admin-select 完全一致 ---------- */
.select-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 32px;
  padding: 0 30px 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.8125rem;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.select-trigger--sm {
  height: 28px;
  padding: 0 26px 0 10px;
  font-size: 0.75rem;
}

.select-trigger:hover {
  border-color: var(--primary-color);
}

.select-trigger.is-open,
.select-trigger:focus-visible {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-color-soft);
}

.select-trigger__text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.select-trigger__arrow {
  position: absolute;
  right: 10px;
  color: var(--text-secondary);
  /* IconArrow 本身是「向左」的 chevron，逆时针 90° 才是向下 */
  transform: rotate(-90deg);
  transition:
    transform 0.18s ease,
    color 0.15s ease;
  pointer-events: none;
}

.select-trigger--sm .select-trigger__arrow {
  right: 8px;
}

.select-trigger:hover .select-trigger__arrow,
.select-trigger.is-open .select-trigger__arrow {
  color: var(--primary-color);
}

.select-trigger.is-open .select-trigger__arrow {
  transform: rotate(-90deg) scaleY(-1);
}

/* ---------- 浮层面板（Teleport 到 body，仍带 scoped 标记） ---------- */
.select-menu {
  margin: 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--dropdown-bg);
  box-shadow:
    0 10px 28px rgba(15, 23, 42, 0.14),
    0 2px 6px rgba(15, 23, 42, 0.06);
}

:root.dark .select-menu {
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.55),
    0 1px 3px rgba(0, 0, 0, 0.4);
}

.select-option {
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.8125rem;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}

.select-option:hover {
  background: var(--bg-hover);
}

.select-option.is-active {
  background: var(--primary-color-soft);
  color: var(--primary-color);
  font-weight: 500;
}
</style>
