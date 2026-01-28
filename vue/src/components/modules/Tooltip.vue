<script setup>
import { ref } from "vue";
import { useFloating, autoUpdate, offset, arrow } from "@floating-ui/vue";

const open = ref(false);
const reference = ref();
const floating = ref();
const floatingArrow = ref(null);

const { floatingStyles, middlewareData } = useFloating(reference, floating, {
  open,
  whileElementsMounted: autoUpdate,
  placement: "bottom", // 垂直方向排列，仅生成 arrow.x
  middleware: [
    // 1. 添加 offset，控制浮层与按钮的间距（10px），可选但推荐
    offset(10),
    // 2. 保留 arrow 中间件，关联箭头元素
    arrow({ 
      element: floatingArrow,
      padding: 8, // 箭头与浮层边缘的间距，防止箭头超出浮层
    })
  ],
});

const toggle = () => (open.value = !open.value);
</script>

<template>
<button ref="reference" @click="toggle">Click me</button>

<Teleport to="body">
  <div
    v-if="open"
    ref="floating"
    :style="floatingStyles"
    style="
      background: #333;
      color: #fff;
      padding: 10px 10px 6px;
      border-radius: 4px;
      position: absolute;
      z-index: 2000;
      overflow: hidden;
      /* 给浮层加一点内边距，防止箭头被内容遮挡 */


    "
  >
    Hello Floating UI!

    <!-- 箭头在浮层内部 -->
    <div
      ref="floatingArrow"
      :style="{
        position: 'absolute',
        /* 2. 手动设置垂直位置：top: -4px（让箭头一半在浮层外，一半在内） */
        top: '-4px', 
        left: middlewareData.arrow?.x != null ? `${middlewareData.arrow.x}px` : '50%',
        width: '8px',
        height: '8px',
        background: '#999',
        transform: 'rotate(45deg)',
        /* 防止箭头遮挡浮层内容 */
        zIndex: -1,
        /* 可选：添加过渡，让箭头位置变化更平滑 */
    
      }"
    />
  </div>
</Teleport>
</template>