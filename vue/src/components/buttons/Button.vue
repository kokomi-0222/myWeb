<!-- components/Button.vue -->
<template>
  <button
    class="my-button"
    :class="[`my-button--${computedType}`]"
    :style="customStyle"
  >
    <slot></slot>
  </button>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: {
    type: String,
    default: 'default',
    validator(value) {
      return ['default', 'primary', 'success', 'warning', 'danger','bilibili'].includes(value)
    }
  },
  // 手动覆盖颜色（可选）
  backgroundColor: String,
  hoverBackgroundColor: String,
  color: String,
  hoverColor: String
})

// 如果用户传了自定义颜色，就用 CSS 变量注入；否则用 type 默认值
const customStyle = computed(() => {
  const style = {}
  if (props.backgroundColor) {
    style['--bg-color'] = props.backgroundColor
    style['--hover-bg-color'] = props.hoverBackgroundColor || lighten(props.backgroundColor, -10)
  }
  if (props.color) {
    style['--text-color'] = props.color
    style['--hover-text-color'] = props.hoverColor || props.color
  }
  return style
})

const computedType = computed(() => {
  // 如果用户传了 backgroundColor，说明是自定义按钮，归为 custom 类型
  return props.backgroundColor ? 'custom' : props.type
})

// 辅助函数：调整颜色亮度（简单版，适用于 #RRGGBB）
function lighten(color, percent) {
  if (!color || !color.startsWith('#') || color.length !== 7) return color
  let R = parseInt(color.substring(1, 3), 16)
  let G = parseInt(color.substring(3, 5), 16)
  let B = parseInt(color.substring(5, 7), 16)

  R = Math.max(0, Math.min(255, R + (255 * percent) / 100))
  G = Math.max(0, Math.min(255, G + (255 * percent) / 100))
  B = Math.max(0, Math.min(255, B + (255 * percent) / 100))

  return `#${Math.round(R).toString(16).padStart(2, '0')}${Math.round(G).toString(16).padStart(2, '0')}${Math.round(B).toString(16).padStart(2, '0')}`
}
</script>

<style scoped>
.my-button {
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: var(--bg-color, #ffffff);
  color: var(--text-color, #606266);
}

/* 默认类型 */
.my-button--default {
  --bg-color: #ffffff;
  --text-color: #606266;
  --hover-bg-color: #f5f5f5;
  --hover-text-color: #404040;

}

/* Primary */
.my-button--primary {
  --bg-color: #409eff;
  --text-color: #ffffff;
  --hover-bg-color: #66b1ff;
  --hover-text-color: #ffffff;
}

/* Success */
.my-button--success {
  --bg-color: #67c23a;
  --text-color: #ffffff;
  --hover-bg-color: #85ce61;
  --hover-text-color: #ffffff;
}

/* Warning */
.my-button--warning {
  --bg-color: #e6a23c;
  --text-color: #ffffff;
  --hover-bg-color: #ebb563;
  --hover-text-color: #ffffff;
}

/* Danger */
.my-button--danger {
  --bg-color: #f56c6c;
  --text-color: #ffffff;
  --hover-bg-color: #f78989;
  --hover-text-color: #ffffff;
}

.my-button--bilibili {
  --bg-color: #00aeee;
  --text-color: #fff;
  --hover-bg-color: #04bcff;
  --hover-text-color: #fff;
}


/* 自定义类型（通过 backgroundColor 触发） */
.my-button--custom {
  /* CSS 变量由 style 动态注入 */
}

/* Hover 效果统一处理 */
.my-button:hover {
  background-color: var(--hover-bg-color);
  color: var(--hover-text-color);
}
</style>
