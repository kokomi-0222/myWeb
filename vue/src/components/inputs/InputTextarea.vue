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

      <div ref="previewContainerRef" class="image-preview-content">
      </div>
    </div>
    <!-- 底部工具栏：常驻显示，不随聚焦消失（否则会让人以为没有表情/图片功能） -->
    <div
      class="comment-input-toolbar"
      @mousedown.prevent="handleToolbarMouseDown"
    >
      <!-- 左侧：功能按钮 + 字数统计 -->
      <div class="toolbar-left">
        <!--表情按钮 -->
        <InputEmoji v-model:visible="showEmojiPanel" @select="selectEmoji" />
        <!--图片按钮 -->
        <InputImage
          v-if="showImage"
          :preview-container="previewContainerRef"
          @change="handleImageChange"
          :max-count="maxImageCount"
        />
        <span
          class="toolbar-count"
          :class="{ 'is-warning': inputValue.length >= maxLength * 0.9 }"
        >
          {{ inputValue.length }}<i>/{{ maxLength }}</i>
        </span>
      </div>
      <!-- 右侧：快捷键提示 + 发送按钮 -->
      <div class="toolbar-right">
        <span class="toolbar-hint">Enter 发送 · Ctrl+Enter 换行</span>
        <!-- 发送按钮（用 span 包裹防止点击失焦） -->
        <span @mousedown.prevent>
          <Button
            class="comment-submit-button"
            type="bilibili"
            @click.stop="handleSubmit"
            :disabled="disabled || (!inputValue.trim() && !imageFiles.length)"
          >
            发送
          </Button>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import { useUIStore } from "@/stores/ui";
import setting from '@/config/setting'
const uiStore = useUIStore();

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
    default: setting.commentMaxLength,
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
  // 提交防抖时间（ms）
  debounceTime: {
    type: Number,
    default: 500,
  },
  showImage: {
    type: Boolean,
    default: true,
  },
  maxImageCount: {
    type: Number,
    default: 9,
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
// 防止 blur 隐藏工具栏（点击工具栏按钮时）
const preventBlur = ref(false);
// 防抖计时器
let debounceTimer = null;

const showEmojiPanel = ref(false);

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
    if (preventBlur.value) {
      preventBlur.value = false;
      isFocused.value = true;
      return;
    }
    if (showEmojiPanel.value) {
      isFocused.value = true;
      return;
    }
    const active = document.activeElement;
    const stillInside = active && wrapperRef.value && wrapperRef.value.contains(active);
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
    const stillInside = active && wrapperRef.value && wrapperRef.value.contains(active);
    if (stillInside) return;
    if (inputValue.value?.trim() || imageFiles.value) return;
    isFocused.value = false;
  }, 0);
});

const handleToolbarMouseDown = () => {
  if (props.disabled) return;
  preventBlur.value = true;
  textareaRef.value?.focus();
};

// 选择表情插入输入框
const selectEmoji = (emoji) => {
  // emoji 既可能是字符串，也可能是图片表情的 code/text/value
  if (emoji) inputValue.value += String(emoji);
  showEmojiPanel.value = false; // 选择后关闭面板
  handleInput(); // 重新计算输入框高度
};

//预览图定位
const previewContainerRef = ref(null);

// 接收图片
const imageFiles = ref([]);
function handleImageChange(files) {
  imageFiles.value = files;
}

// 修改提交逻辑：携带图片文件
const handleSubmit = async () => {
  if (isSubmitting.value || props.disabled) return;
  // 空内容校验：文字+图片都为空时不提交
  if (!inputValue.value.trim() && !imageFiles.value) return;

  try {
    isSubmitting.value = true;
    // 提交时把文字和图片一起传给父组件
    await emit("submit", {
      content: inputValue.value,
      image: imageFiles.value,
    });
    // 提交后清空
    inputValue.value = "";
    imageFiles.value = [];
    // 保持聚焦，让用户继续输入
    textareaRef.value?.focus();
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
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px 10px;
  background: var(--bg-secondary);
  margin-bottom: 8px; /* 和工具栏拉开间距 */
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.comment-input-container.is-focused {
  border-color: var(--primary-color);
  background: var(--bg-primary);
  box-shadow: 0 0 0 3px var(--primary-color-soft);
}

.comment-textarea {
  width: 100%;
  box-sizing: border-box;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-family: inherit;
  line-height: 22px;
  font-size: 0.9rem;
  color: var(--text-primary);
  min-height: 22px;
}

.comment-textarea::placeholder {
  color: var(--text-secondary);
  opacity: 0.8;
}

/* 底部工具栏（独立区域） */
.comment-input-toolbar {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 0 2px;
}

/* 左侧功能按钮组 */
.toolbar-left {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 4px;
  min-width: 0;
}

/* 右侧功能按钮组 */
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* 字数统计 */
.toolbar-count {
  margin-left: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.toolbar-count i {
  font-style: normal;
  opacity: 0.6;
}

.toolbar-count.is-warning {
  color: #ff7a45;
}

/* 快捷键提示 */
.toolbar-hint {
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.8;
  white-space: nowrap;
  user-select: none;
}

/* 复用你原来的发送按钮样式 */
.comment-submit-button {
  min-width: 68px;
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  font-weight: 500;
}

/* 隐藏文件选择器 */
.image-input {
  display: none;
}

/* 移动端：空间紧张，不显示快捷键提示 */
@media (max-width: 767px) {
  .toolbar-hint {
    display: none;
  }
}

/* 图片预览样式 */
.image-preview-content{
  width: 100%;
  height: 100%;
};

</style>
