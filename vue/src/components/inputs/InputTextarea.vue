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
    <!-- 底部工具栏（聚焦或有内容/图片时显示） -->
    <div
      v-if="isFocused || showEmojiPanel || inputValue.trim() || imageFiles.length"
      class="comment-input-toolbar"
      @mousedown.prevent="handleToolbarMouseDown"
    >
      <!-- 左侧留白，保持工具栏右对齐 -->
      <div class="toolbar-left">
        <!--表情按钮 -->
        <InputEmoji v-model:visible="showEmojiPanel" @select="selectEmoji" />
        <!--图片按钮 -->
        <InputImage
          v-if="showImage"
          :preview-container="previewContainerRef"
          @change="handleImageChange"
          :max-count="9"
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
  // 提交防抖时间（ms）
  debounceTime: {
    type: Number,
    default: 500,
  },
  showImage: {
    type: Boolean,
    default: true,
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
.image-preview-content{
  width: 100%;
  height: 100%;
};

</style>
