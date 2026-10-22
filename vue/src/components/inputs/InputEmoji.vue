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
        class="emoji-panel-tabs"
        @mousedown.prevent
      >
        <button
          v-for="(pack, idx) in normalizedEmojiPacks"
          :key="pack.key"
          class="emoji-tab"
          :class="{ active: idx === currentEmojiPackIndex }"
          @click="currentEmojiPackIndex = idx"
        >
          {{ pack.label }}
        </button>
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
    default: 28,
  },
  // 默认表情网格：间距（px）
  emojiGap: {
    type: Number,
    default: 6,
  },
  // 默认表情网格：最多显示行数
  emojiMaxRows: {
    type: Number,
    default: 6,
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

// 内置表情包：分 6 类，共 160+ 个。要接自建表情图（type: 'image'）时从这里塞即可
const DEFAULT_EMOJI_PACKS = [
  {
    key: "hot",
    label: "常用",
    items: [
      "😀", "😂", "🥰", "😍", "🤔", "👍", "🎉", "🔥",
      "✨", "💯", "😭", "😅", "🙏", "😊", "🤣", "😉",
      "😎", "🥳", "😴", "🤩", "😏", "😌", "😋", "🤗",
      "😢", "😤", "😡", "🤯", "😱", "😨", "🙃", "😶",
      "👀", "💦", "☕", "🍺", "🎮", "🎵", "🌝", "🌚",
    ],
  },
  {
    key: "smile",
    label: "笑脸",
    items: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂",
      "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩",
      "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜",
      "🤪", "😝", "🤑", "🤗", "🤭", "🫢", "🤫", "🤔",
      "🫡", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒",
      "🙄", "😬", "😮‍💨", "🤥", "😴", "🤤", "😪", "😵",
    ],
  },
  {
    key: "hand",
    label: "手势",
    items: [
      "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙",
      "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐️",
      "🖖", "👋", "🤝", "🙏", "💪", "🦾", "✍️", "🤳",
      "💅", "👏", "🙌", "👐", "🤲", "🫶", "👊", "✊",
    ],
  },
  {
    key: "heart",
    label: "爱心",
    items: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
      "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖",
      "💘", "💝", "💟", "♥️", "💌", "💐", "🌹", "🥀",
    ],
  },
  {
    key: "animal",
    label: "动物",
    items: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼",
      "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🙈",
      "🙉", "🙊", "🐔", "🐧", "🐦", "🐤", "🦄", "🐝",
      "🦋", "🐢", "🐙", "🦀", "🐬", "🐳", "🐟", "🦈",
    ],
  },
  {
    key: "symbol",
    label: "符号",
    items: [
      "✨", "⭐", "🌟", "💫", "⚡", "🔥", "💥", "💦",
      "🌈", "☀️", "🌙", "⛄", "🎵", "🎶", "🎉", "🎊",
      "🎁", "🏆", "🥇", "⚽", "🎮", "📷", "💡", "💯",
      "✅", "❌", "❓", "❗", "💤", "💬", "👀", "🫠",
    ],
  },
];

const normalizedEmojiPacks = computed(() => {
  const packs =
    Array.isArray(props.emojiPacks) && props.emojiPacks.length
      ? props.emojiPacks
      : DEFAULT_EMOJI_PACKS;

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

// 选中后抛给父组件
function selectEmoji(emoji) {
  emit("select", emoji);
  innerVisible.value = false;
}
</script>

<style scoped>
.emoji-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-secondary);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.emoji-btn:hover {
  background: var(--bg-hover);
  color: var(--primary-color);
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
  border-radius: 12px !important;
  background: var(--bg-primary) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12) !important;
  width: 300px !important;
  min-width: 300px !important;
  max-width: 300px !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}

/* 分类切换：一排小标签 */
.dropdown-menu--emoji-panel .emoji-panel-tabs {
  display: flex !important;
  align-items: center !important;
  gap: 2px !important;
  margin-bottom: 10px !important;
  padding-bottom: 8px !important;
  border-bottom: 1px solid var(--border-color) !important;
  user-select: none !important;
}

.dropdown-menu--emoji-panel .emoji-tab {
  flex: 1 !important;
  padding: 4px 0 !important;
  border: none !important;
  border-radius: 6px !important;
  background: transparent !important;
  font-size: 12px !important;
  line-height: 1.4 !important;
  color: var(--text-secondary) !important;
  cursor: pointer !important;
  white-space: nowrap !important;
  transition: color 0.15s ease, background-color 0.15s ease !important;
}

.dropdown-menu--emoji-panel .emoji-tab:hover {
  color: var(--text-primary) !important;
  background: var(--bg-hover) !important;
}

.dropdown-menu--emoji-panel .emoji-tab.active {
  color: var(--primary-color) !important;
  background: var(--primary-color-soft) !important;
  font-weight: 500 !important;
}

.dropdown-menu--emoji-panel .emoji-grid-scroll {
  max-height: calc(
    var(--emoji-cell) * var(--emoji-rows) + var(--emoji-gap) * (var(--emoji-rows) - 1)
  ) !important;
  /* 至少撑到 5 行，切换分类时面板高度不会跳 */
  min-height: calc(var(--emoji-cell) * 5 + var(--emoji-gap) * 4) !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
}

/* 表情网格：8列排版 */
.dropdown-menu--emoji-panel .emoji-grid {
  display: grid !important;
  grid-template-columns: repeat(8, var(--emoji-cell)) !important;
  gap: var(--emoji-gap) !important;
  justify-content: space-between !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

/* 表情项样式 */
.dropdown-menu--emoji-panel .emoji-item {
  font-size: 19px !important;
  cursor: pointer !important;
  padding: 0 !important;
  border-radius: 6px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: var(--emoji-cell) !important;
  height: var(--emoji-cell) !important;
  box-sizing: border-box !important;
  transition: background-color 0.12s ease !important;
}

.dropdown-menu--emoji-panel .emoji-img {
  max-width: 100% !important;
  max-height: 100% !important;
  object-fit: contain !important;
  display: block !important;
}

.dropdown-menu--emoji-panel .emoji-item:hover {
  background: var(--bg-hover) !important;
}

/* 美化滚动条 */
.dropdown-menu--emoji-panel .emoji-grid-scroll::-webkit-scrollbar {
  width: 6px !important;
}
.dropdown-menu--emoji-panel .emoji-grid-scroll::-webkit-scrollbar-thumb {
  background: var(--border-color-hover) !important;
  border-radius: 3px !important;
}
.dropdown-menu--emoji-panel .emoji-grid-scroll::-webkit-scrollbar-track {
  background: transparent !important;
}
</style>
