<template>
  <div class="comment-input-container">
    <!-- 输入框区域 -->
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

    <!-- 底部操作栏：字数统计 + 功能按钮 -->
    <div class="comment-input-footer">
      <!-- 字数统计 -->
     <!--  <span class="word-count">
        {{ inputValue.length }}/{{ maxLength }}
      </span> -->

      <!-- 功能按钮组 -->
      <div class="btn-group">
        <!-- 可选：表情按钮（预留扩展） -->
        <button
          class="func-btn emoji-btn"
          @click.stop="toggleEmoji"
          v-if="showEmoji"
          :disabled="disabled"
        >
          😊
        </button>

        <!-- 可选：图片按钮（预留扩展） -->
        <button
          class="func-btn image-btn"
          @click.stop="triggerImageUpload"
          v-if="showImage"
          :disabled="disabled"
        >
          📷
        </button>

        <!-- 取消按钮 -->
        <button
          class="cancel-btn"
          @click="handleCancel"
          :disabled="disabled || !inputValue"
        >
          取消
        </button>

        <!-- 提交按钮 -->
        <button
          class="submit-btn"
          @click="handleSubmit"
          :disabled="disabled || !inputValue.trim() || inputValue.length > maxLength"
        >
          发布评论
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'

// 定义组件属性
const props = defineProps({
  // 初始输入内容
  modelValue: {
    type: String,
    default: ''
  },
  // 占位提示文字
  placeholder: {
    type: String,
    default: '说点什么吧...'
  },
  // 最大字数限制
  maxLength: {
    type: Number,
    default: 500
  },
  // 是否禁用
  disabled: {
    type: Boolean,
    default: false
  },
  // 是否显示表情按钮
  showEmoji: {
    type: Boolean,
    default: true
  },
  // 是否显示图片上传按钮
  showImage: {
    type: Boolean,
    default: true
  },
  // 提交防抖时间（ms）
  debounceTime: {
    type: Number,
    default: 500
  }
})

// 定义组件事件
const emit = defineEmits([
  'update:modelValue', // 双向绑定输入内容
  'submit', // 提交评论
  'cancel', // 取消输入
  'input-change', // 输入内容变化
  'image-upload' // 图片上传触发
])

// 内部输入值（双向绑定）
const inputValue = ref(props.modelValue)
// 输入框DOM引用
const textareaRef = ref(null)
// 是否正在提交（防重复提交）
const isSubmitting = ref(false)
// 防抖计时器
let debounceTimer = null

// 监听外部modelValue变化，同步到内部
watch(
  () => props.modelValue,
  (newVal) => {
    inputValue.value = newVal
  },
  { immediate: true }
)

// 监听内部输入值变化，同步到外部
watch(
  inputValue,
  (newVal) => {
    emit('update:modelValue', newVal)
    // 触发输入变化事件（防抖）
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      emit('input-change', newVal)
    }, props.debounceTime)
  },
  { immediate: true }
)

// 输入事件处理
const handleInput = () => {
  // 自动高度适配（可选：让输入框随内容高度自适应）
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 200)}px`
  }
}

// 回车提交（按住ctrl/meta+回车换行，纯回车提交）
const handleEnterSubmit = (e) => {
  // 阻止默认换行
  e.preventDefault()
  // 按住ctrl/command键则换行
  if (e.ctrlKey || e.metaKey) {
    inputValue.value += '\n'
    handleInput()
    return
  }
  // 纯回车提交
  handleSubmit()
}

// 提交评论
const handleSubmit = async () => {
  // 空内容/正在提交/禁用状态 直接返回
  if (isSubmitting.value || props.disabled || !inputValue.value.trim()) return

  try {
    isSubmitting.value = true
    // 触发提交事件，把输入内容传给父组件
    await emit('submit', inputValue.value)
    // 提交成功后清空输入框（可根据业务调整）
    inputValue.value = ''
  } catch (err) {
    console.error('评论提交失败：', err)
  } finally {
    isSubmitting.value = false
  }
}

// 取消输入
const handleCancel = () => {
  inputValue.value = ''
  emit('cancel')
}

// 聚焦/失焦处理（可选）
const handleFocus = () => {
  textareaRef.value?.classList.add('focused')
}
const handleBlur = () => {
  textareaRef.value?.classList.remove('focused')
}

// 表情面板切换（预留扩展）
const toggleEmoji = () => {
  // 可扩展：显示/隐藏表情面板，选择表情插入到输入框
  console.log('切换表情面板')
}

// 触发图片上传（预留扩展）
const triggerImageUpload = () => {
  emit('image-upload')
  // 可扩展：创建input[type=file]触发文件选择
  // const input = document.createElement('input')
  // input.type = 'file'
  // input.accept = 'image/*'
  // input.onchange = (e) => { /* 处理图片文件 */ }
  // input.click()
}
</script>

<style scoped>
.comment-input-container {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  background: #fff;
}

.comment-textarea {
  width: 100%;
  box-sizing: border-box;
  border: none;
  outline: none;
  resize: none;
  font-size: 14px;
  line-height: 1.5;
  padding: 4px 0;
  min-height: 60px;
  max-height: 200px;
  color: #333;
}

.comment-textarea:focused {
  border-color: #4096ff;
}

.comment-input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.word-count {
  font-size: 12px;
  color: #999;
}

.btn-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.func-btn {
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.func-btn:hover {
  background: #f5f5f5;
}

.cancel-btn {
  padding: 4px 12px;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  color: #666;
}

.cancel-btn:disabled {
  cursor: not-allowed;
  color: #ccc;
  background: #f9f9f9;
}

.submit-btn {
  padding: 4px 16px;
  border: none;
  background: #4096ff;
  color: #fff;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.submit-btn:disabled {
  cursor: not-allowed;
  background: #a0cfff;
}
</style>