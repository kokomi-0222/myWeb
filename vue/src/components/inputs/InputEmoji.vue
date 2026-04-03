<template>
  <Dropdown
    v-model:visible="innerVisible"
    trigger="click"
    menu-class="dropdown-menu--emoji-panel"
    :offsetY="10"
    :show-arrow="false"
    placement="bottom-start"
    :disable-animation="true"
  >
    <template #trigger>
      <div class="emoji-btn" :disabled="disabled">
        <IconEmoji size="16" />
      </div>
    </template>

    <template #menu="{ close }">
      <div
        v-if="normalizedEmojiPacks.length > 1"
        class="emoji-panel-header"
        :style="{
          '--emoji-cell': `${currentEmojiCellSize}px`,
          '--emoji-gap': `${currentEmojiGap}px`,
          '--emoji-rows': currentEmojiMaxRows,
        }"
      >
        <div class="emoji-pack-name">{{ currentEmojiPack.label }}</div>
        <div class="emoji-pack-nav">
          <button
            class="emoji-pack-nav-btn"
            @click="prevEmojiPack"
            aria-label="上一类表情"
          >
            &lt;
          </button>
          <button
            class="emoji-pack-nav-btn"
            @click="nextEmojiPack"
            aria-label="下一类表情"
          >
            &gt;
          </button>
        </div>
      </div>

      <div
        class="emoji-grid-scroll"
        :style="{
          '--emoji-cell': `${currentEmojiCellSize}px`,
          '--emoji-gap': `${currentEmojiGap}px`,
          '--emoji-rows': currentEmojiMaxRows,
        }"
      >
        <div class="emoji-grid">
          <span
            v-for="item in currentEmojiItems"
            :key="item.key"
            class="emoji-item"
            @click="
              () => {
                selectEmoji(item.value);
                close();
              }
            "
          >
            <img
              v-if="item.type === 'image'"
              class="emoji-img"
              :src="item.src"
              :alt="item.alt || ''"
              loading="lazy"
            />
            <template v-else>{{ item.text }}</template>
          </span>
        </div>
      </div>
    </template>
  </Dropdown>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useUIStore } from "@/stores/ui";
import IconEmoji from "@/components/icons/IconEmoji.vue";

const uiStore = useUIStore();
const emit = defineEmits(["select", "update:visible"]);

// 接收属性
const props = defineProps({
  // 是否禁用
  disabled: {
    type: Boolean,
    default: false,
  },
  // 是否显示下拉框
  visible: {
    type: Boolean,
    default: false,
  },

  // 多套表情包（可选）。每套可自定义尺寸：{ label, items, cellSize, gap, maxRows }
  emojiPacks: {
    type: Array,
    default: null,
  },
  // 默认表情网格：单元格大小（px）
  emojiCellSize: {
    type: Number,
    default: 32,
  },
  // 默认表情网格：间距（px）
  emojiGap: {
    type: Number,
    default: 8,
  },
  // 默认表情网格：最多显示行数
  emojiMaxRows: {
    type: Number,
    default: 5,
  },
});

// 内部状态
const innerVisible = computed({
  get() {
    return props.visible;
  },
  set(value) {
    emit("update:visible", value);
  },
});

const emojiList = ref([
  "😀",
  "😂",
  "🤣",
  "😍",
  "🥰",
  "😘",
  "👍",
  "👏",
  "💪",
  "✨",
  "😜",
  "😝",
  "🤪",
  "😎",
  "🤩",
  "🥳",
  "😋",
  "😉",
  "😊",
  "🙂",
  "🤔",
  "🤨",
  "😐",
  "😑",
]);

const normalizedEmojiPacks = computed(() => {
  const packs =
    Array.isArray(props.emojiPacks) && props.emojiPacks.length
      ? props.emojiPacks
      : [
          {
            key: "default",
            label: "默认",
            items: emojiList.value,
            cellSize: props.emojiCellSize,
            gap: props.emojiGap,
            maxRows: props.emojiMaxRows,
          },
        ];

  return packs
    .map((p, idx) => ({
      key: String(p?.key ?? idx),
      label: String(p?.label ?? `表情${idx + 1}`),
      items: Array.isArray(p?.items) ? p.items : [],
      cellSize: Number.isFinite(Number(p?.cellSize))
        ? Number(p.cellSize)
        : props.emojiCellSize,
      gap: Number.isFinite(Number(p?.gap)) ? Number(p.gap) : props.emojiGap,
      maxRows: Number.isFinite(Number(p?.maxRows))
        ? Number(p.maxRows)
        : props.emojiMaxRows,
    }))
    .filter((p) => p.items.length);
});

const currentEmojiPackIndex = ref(0);

watch(
  normalizedEmojiPacks,
  (packs) => {
    if (!packs.length) currentEmojiPackIndex.value = 0;
    if (currentEmojiPackIndex.value >= packs.length) currentEmojiPackIndex.value = 0;
  },
  { immediate: true }
);

const currentEmojiPack = computed(() => {
  const packs = normalizedEmojiPacks.value;
  return (
    packs[currentEmojiPackIndex.value] || {
      key: "default",
      label: "默认",
      items: [],
      cellSize: props.emojiCellSize,
      gap: props.emojiGap,
      maxRows: props.emojiMaxRows,
    }
  );
});

const currentEmojiCellSize = computed(() => currentEmojiPack.value.cellSize);
const currentEmojiGap = computed(() => currentEmojiPack.value.gap);
const currentEmojiMaxRows = computed(() => currentEmojiPack.value.maxRows);

const currentEmojiItems = computed(() => {
  const items = currentEmojiPack.value.items || [];
  return items.map((it, idx) => {
    if (typeof it === "string") {
      return {
        key: `${currentEmojiPack.value.key}-${idx}`,
        type: "text",
        text: it,
        value: it,
      };
    }
    // 允许图片表情：{ type:'image', src, alt?, code?/text? }
    const type = it?.type === "image" || it?.src ? "image" : "text";
    const value = it?.code ?? it?.text ?? it?.value ?? "";
    return {
      key: String(it?.id ?? `${currentEmojiPack.value.key}-${idx}`),
      type,
      src: it?.src,
      alt: it?.alt,
      text: it?.text ?? "",
      value: value || "",
    };
  });
});

const prevEmojiPack = () => {
  const len = normalizedEmojiPacks.value.length;
  if (len <= 1) return;
  currentEmojiPackIndex.value = (currentEmojiPackIndex.value - 1 + len) % len;
};

const nextEmojiPack = () => {
  const len = normalizedEmojiPacks.value.length;
  if (len <= 1) return;
  currentEmojiPackIndex.value = (currentEmojiPackIndex.value + 1) % len;
};

// 选中后抛给父组件
function selectEmoji(emoji) {
  emit("select", emoji);
  innerVisible.value = false;
}
</script>

<style scoped>
.emoji-btn {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: #f9f9f9;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: rgba(0, 0, 0, 0.5);
}

.emoji-btn:hover {
  background: #f0f0f0;
}

.emoji-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>

<style>
.dropdown-menu--emoji-panel {
  padding: 12px !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 8px !important;
  background: #ffffff !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
  width: 320px !important;
  min-width: 320px !important;
  max-width: 320px !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}

.dropdown-menu--emoji-panel .emoji-panel-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  margin-bottom: 8px !important;
  user-select: none !important;
}

.dropdown-menu--emoji-panel .emoji-pack-name {
  font-size: 12px !important;
  color: var(--text-secondary) !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.dropdown-menu--emoji-panel .emoji-pack-nav {
  display: inline-flex !important;
  gap: 6px !important;
}

.dropdown-menu--emoji-panel .emoji-pack-nav-btn {
  width: 22px !important;
  height: 22px !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 6px !important;
  background: transparent !important;
  cursor: pointer !important;
  line-height: 20px !important;
  color: var(--text-secondary) !important;
}

.dropdown-menu--emoji-panel .emoji-pack-nav-btn:hover {
  color: var(--primary-color) !important;
  border-color: var(--primary-color) !important;
}

.dropdown-menu--emoji-panel .emoji-grid-scroll {
  max-height: calc(
    var(--emoji-cell) * var(--emoji-rows) + var(--emoji-gap) * (var(--emoji-rows) - 1)
  ) !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
}

/* 表情网格：8列排版 */
.dropdown-menu--emoji-panel .emoji-grid {
  display: grid !important;
  /* 根据面板可用宽度自动决定一行多少个（避免 8 个溢出） */
  grid-template-columns: repeat(auto-fill, minmax(var(--emoji-cell), 1fr)) !important;
  gap: var(--emoji-gap) !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

/* 表情项样式 */
.dropdown-menu--emoji-panel .emoji-item {
  font-size: 20px !important;
  cursor: pointer !important;
  padding: 0 !important;
  border-radius: 4px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: var(--emoji-cell) !important;
  height: var(--emoji-cell) !important;
  box-sizing: border-box !important;
}

.dropdown-menu--emoji-panel .emoji-img {
  max-width: 100% !important;
  max-height: 100% !important;
  object-fit: contain !important;
  display: block !important;
}

.dropdown-menu--emoji-panel .emoji-item:hover {
  background: #f5f5f5 !important;
}

/* 美化滚动条 */
.dropdown-menu--emoji-panel .emoji-grid-scroll::-webkit-scrollbar {
  width: 6px !important;
}
.dropdown-menu--emoji-panel .emoji-grid-scroll::-webkit-scrollbar-thumb {
  background: #ccc !important;
  border-radius: 3px !important;
}
.dropdown-menu--emoji-panel .emoji-grid-scroll::-webkit-scrollbar-track {
  background: #f1f1f1 !important;
}
</style>
