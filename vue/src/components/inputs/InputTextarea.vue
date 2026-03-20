<template>
  <div ref="wrapperRef" class="comment-input-wrapper">
    <!-- 输入框容器（独立边框） -->
    <div class="comment-input-container" :class="{ 'is-focused': isFocused }">
      <textarea
        ref="textareaRef"
        v-model="inputValue"
        class="comment-textarea"
        :placeholder="placeholder"
        :maxlength="maxLength"
        :disabled="disabled"
        @input="handleInput"
        @keydown.enter="handleEnterSubmit"
        @blur="handleBlur"
        @focus="handleFocus"
      ></textarea>
      <!-- 图片预览（可选：选中图片后显示） -->
      <div v-if="imageFile" class="image-preview">
        <img :src="imagePreviewUrl" alt="预览图片" class="preview-img" />
        <button class="preview-close" @click="clearImage">×</button>
      </div>
    </div>
    <!-- 底部工具栏（聚焦或有内容/图片时显示） -->
    <div
      v-if="isFocused || showEmojiPanel || inputValue.trim() || imageFile"
      class="comment-input-toolbar"
      @mousedown.prevent="handleToolbarMouseDown"
    >
      <!-- 左侧留白，保持工具栏右对齐 -->
      <div class="toolbar-left">
        <Dropdown
          v-model:visible="showEmojiPanel"
          trigger="click"
          menu-class="dropdown-menu--emoji-panel"
          :offsetY="10"
          :show-arrow="false"
          :placement="uiStore.isMobile ? 'bottom-start' : 'bottom'"
          :disable-animation="true"
          v-if="showEmoji"
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
                <button class="emoji-pack-nav-btn" @click="prevEmojiPack" aria-label="上一类表情">
                  &lt;
                </button>
                <button class="emoji-pack-nav-btn" @click="nextEmojiPack" aria-label="下一类表情">
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
        <!--图片按钮 -->
        <div
          class="func-btn image-btn"
          @click.stop="triggerImageUpload"
          v-if="showImage"
          :disabled="disabled"
        >
          <IconPictrue size="16" />
        </div>
        <!-- 隐藏的文件选择器 -->
        <input
          ref="imageInputRef"
          type="file"
          accept="image/*"
          class="image-input"
          @change="handleImageChange"
        />
      </div>
      <!-- 右侧功能按钮组 -->
      <div class="toolbar-right">
        <!-- 发送按钮 -->
        <Button
          class="comment-submit-button"
          type="bilibili"
          @click.stop="handleSubmit"
          :disabled="disabled || !inputValue.trim()"
        >
          发送
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import { useUIStore } from "@/stores/ui";
const uiStore = useUIStore();

// 新增：图片相关ref
const imageInputRef = ref(null); // 文件选择器DOM
const imageFile = ref(null); // 选中的图片文件
const imagePreviewUrl = ref(""); // 图片预览URL

// 定义组件属性
const props = defineProps({
  // 初始输入内容
  modelValue: {
    type: String,
    default: "",
  },
  // 占位提示文字
  placeholder: {
    type: String,
    default: "天青色等烟雨，而我在等你...",
  },
  // 最大字数限制
  maxLength: {
    type: Number,
    default: 500,
  },
  // 是否禁用
  disabled: {
    type: Boolean,
    default: false,
  },
  // 是否显示表情按钮
  showEmoji: {
    type: Boolean,
    default: true,
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
  // 提交防抖时间（ms）
  debounceTime: {
    type: Number,
    default: 500,
  },
  showImage: {
    type: Boolean,
    default: true,
  },
  // 新增：限制图片大小（MB）
  maxImageSize: {
    type: Number,
    default: 5,
  },
});

// 定义组件事件
const emit = defineEmits([
  "update:modelValue", // 双向绑定输入内容
  "submit", // 提交评论
  "cancel", // 取消输入
  "input-change", // 输入内容变化
]);

// 内部输入值（双向绑定）
const inputValue = ref(props.modelValue);
// 输入框DOM引用
const textareaRef = ref(null);
const wrapperRef = ref(null);
// 是否聚焦（控制工具栏和样式）
const isFocused = ref(false);
// 是否正在提交（防重复提交）
const isSubmitting = ref(false);
// 防抖计时器
let debounceTimer = null;

// 表情相关
const showEmojiPanel = ref(false); // 表情面板显示状态
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
  const packs = Array.isArray(props.emojiPacks) && props.emojiPacks.length
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
      cellSize: Number.isFinite(Number(p?.cellSize)) ? Number(p.cellSize) : props.emojiCellSize,
      gap: Number.isFinite(Number(p?.gap)) ? Number(p.gap) : props.emojiGap,
      maxRows: Number.isFinite(Number(p?.maxRows)) ? Number(p.maxRows) : props.emojiMaxRows,
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
  return packs[currentEmojiPackIndex.value] || {
    key: "default",
    label: "默认",
    items: [],
    cellSize: props.emojiCellSize,
    gap: props.emojiGap,
    maxRows: props.emojiMaxRows,
  };
});

const currentEmojiCellSize = computed(() => currentEmojiPack.value.cellSize);
const currentEmojiGap = computed(() => currentEmojiPack.value.gap);
const currentEmojiMaxRows = computed(() => currentEmojiPack.value.maxRows);

const currentEmojiItems = computed(() => {
  const items = currentEmojiPack.value.items || [];
  return items.map((it, idx) => {
    if (typeof it === "string") {
      return { key: `${currentEmojiPack.value.key}-${idx}`, type: "text", text: it, value: it };
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

// 监听外部modelValue变化，同步到内部
watch(
  () => props.modelValue,
  (newVal) => {
    inputValue.value = newVal;
  },
  { immediate: true }
);

// 监听内部输入值变化，同步到外部
watch(
  inputValue,
  (newVal) => {
    emit("update:modelValue", newVal);
    // 触发输入变化事件（防抖）
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      emit("input-change", newVal);
    }, props.debounceTime);
  },
  { immediate: true }
);

// 输入事件处理（自适应高度）
const handleInput = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
    textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 200)}px`;
  }
};

// 回车提交（按住ctrl/meta+回车换行，纯回车提交）
const handleEnterSubmit = (e) => {
  e.preventDefault();
  // 按住ctrl/command键则换行
  if (e.ctrlKey || e.metaKey) {
    inputValue.value += "\n";
    handleInput();
    return;
  }
  // 纯回车提交
  handleSubmit();
};

// 取消输入（预留）
const handleCancel = () => {
  inputValue.value = "";
  emit("cancel");
};

// 聚焦/失焦处理
const handleFocus = () => {
  isFocused.value = true;
  textareaRef.value?.classList.add("focused");
};
const handleBlur = () => {
  // 点击工具栏/按钮时，textarea 会先 blur，但我们不希望工具栏立刻消失
  // 这里延迟一拍判断：如果焦点仍在组件内部，就维持 focused 状态
  setTimeout(() => {
    if (showEmojiPanel.value) {
      isFocused.value = true;
      return;
    }
    const active = document.activeElement;
    const stillInside =
      active && wrapperRef.value && wrapperRef.value.contains(active);
    if (stillInside) {
      isFocused.value = true;
      return;
    }
    isFocused.value = false;
    textareaRef.value?.classList.remove("focused");
  }, 0);
};

watch(showEmojiPanel, (visible) => {
  if (visible) {
    isFocused.value = true;
    return;
  }
  setTimeout(() => {
    const active = document.activeElement;
    const stillInside =
      active && wrapperRef.value && wrapperRef.value.contains(active);
    if (stillInside) return;
    if (inputValue.value?.trim() || imageFile.value) return;
    isFocused.value = false;
  }, 0);
});

const handleToolbarMouseDown = () => {
  if (props.disabled) return;
  textareaRef.value?.focus();
};

// 选择表情插入输入框
const selectEmoji = (emoji) => {
  // emoji 既可能是字符串，也可能是图片表情的 code/text/value
  if (emoji) inputValue.value += String(emoji);
  showEmojiPanel.value = false; // 选择后关闭面板
  handleInput(); // 重新计算输入框高度
};

// 新增：触发图片选择
const triggerImageUpload = () => {
  if (props.disabled) return;
  imageInputRef.value?.click();
};

// 新增：处理图片选择
const handleImageChange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // 校验图片大小
  if (file.size > props.maxImageSize * 1024 * 1024) {
    alert(`图片大小不能超过${props.maxImageSize}MB`);
    return;
  }

  // 校验图片类型
  if (!file.type.startsWith("image/")) {
    alert("请选择图片文件");
    return;
  }

  // 保存文件并生成预览URL
  imageFile.value = file;
  imagePreviewUrl.value = URL.createObjectURL(file);
  // 清空文件选择器（避免重复选择同一文件不触发change）
  e.target.value = "";
};

// 新增：清空图片
const clearImage = () => {
  if (imagePreviewUrl.value) {
    URL.revokeObjectURL(imagePreviewUrl.value); // 释放内存
  }
  imageFile.value = null;
  imagePreviewUrl.value = "";
};

// 修改提交逻辑：携带图片文件
const handleSubmit = async () => {
  if (isSubmitting.value || props.disabled) return;
  // 空内容校验：文字+图片都为空时不提交
  if (!inputValue.value.trim() && !imageFile.value) return;

  try {
    isSubmitting.value = true;
    // 提交时把文字和图片一起传给父组件
    await emit("submit", {
      content: inputValue.value,
      image: imageFile.value,
    });
    // 提交后清空
    inputValue.value = "";
    clearImage();
  } catch (err) {
    console.error("评论提交失败：", err);
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<style scoped>
/* 外层容器：包含输入框 + 工具栏 */
.comment-input-wrapper {
  width: 100%;
  box-sizing: border-box;
}

/* 输入框容器（独立边框） */
.comment-input-container {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 4px 8px;
  background: #fff;
  margin-bottom: 8px; /* 和工具栏拉开间距 */
}

.comment-input-container.is-focused {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 1px rgba(64, 150, 255, 0.2);
}

.comment-textarea {
  width: 100%;
  box-sizing: border-box;
  border: none;
  outline: none;
  resize: none;
  line-height: 20px;
  font-size: 0.9rem;
  color: #333;
  min-height: 20px;
}

/* 底部工具栏（独立区域） */
.comment-input-toolbar {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 左侧留白，保证按钮右对齐 */
.toolbar-left {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 8px;
}

/* 右侧功能按钮组 */
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 复用你原来的表情按钮样式 */
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

/* 复用你原来的发送按钮样式 */
.comment-submit-button {
  width: 65px;
  height: 32px;
  border-radius: 4px;
  font-weight: 500;
}
/* 新增：图片按钮样式（和表情按钮统一） */
.func-btn.image-btn {
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

.func-btn.image-btn:hover {
  background: #f0f0f0;
}
.func-btn.image-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* 隐藏文件选择器 */
.image-input {
  display: none;
}

/* 图片预览样式 */
.image-preview {
  margin-top: 8px;
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}
.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.preview-close {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>

<!-- 全局样式：表情面板样式（和你之前的完全一致） -->
<style>
/* 表情下拉面板：320px宽度，刚好容纳8列表情 */
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
  max-height: calc(var(--emoji-cell) * var(--emoji-rows) + var(--emoji-gap) * (var(--emoji-rows) - 1)) !important;
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
