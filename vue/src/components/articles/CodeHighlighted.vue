<!-- src/components/CodeHighlighted.vue -->
<template>
  <div ref="containerRef" class="code-highlighted-container">
    <div v-html="sanitizedContent"></div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from "vue";
import hljs from "highlight.js/lib/core";
// 按需引入常用语言（按你项目需要增减）
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import python from "highlight.js/lib/languages/python";
import java from "highlight.js/lib/languages/java";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";

// 引入样式（你可以换其他主题）
import "highlight.js/styles/default.css";
//import 'highlight.js/styles/github-dark.css' // 推荐：github-dark, atom-one-dark, vs2015
//import 'highlight.js/styles/github.css'

import copy from "copy-to-clipboard";

// 注册语言
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("python", python);
hljs.registerLanguage("java", java);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("json", json);

const props = defineProps({
  content: {
    type: String,
    required: true,
  },
  // 可选：是否显示复制按钮（默认 true）
  showCopy: {
    type: Boolean,
    default: true,
  },
});

const containerRef = ref(null);
const sanitizedContent = ref("");

// 简单 XSS 过滤（生产环境建议用 DOMPurify）
const sanitizeHtml = (html) => {
  if (!html) return "";
  // 移除危险标签和属性（基础防护）
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "");
};

// 高亮 + 添加复制按钮
const highlightAndAddCopy = () => {
  const container = containerRef.value;
  if (!container) return;

  // 先高亮所有 code 块
  container.querySelectorAll("pre code").forEach((block) => {
    if (!block.classList.contains("hljs")) {
      hljs.highlightElement(block);
    }

    // 如果启用了复制按钮，且尚未添加
    if (props.showCopy && !block.parentElement.querySelector(".copy-btn")) {
      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.textContent = "Copy";
      btn.title = "Copy to clipboard";

      // 样式（你可以在全局 CSS 中覆盖）
      Object.assign(btn.style, {
        position: "absolute",
        top: "8px",
        right: "8px",
        padding: "4px 8px",
        fontSize: "12px",
        background: "rgba(0,0,0,0.6)",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        zIndex: "10",
        opacity: "0",
        transition: "opacity 0.2s",
      });

      // 悬停 pre 时显示按钮
      const pre = block.parentElement;
      pre.style.position = "relative";
      pre.addEventListener("mouseenter", () => {
        btn.style.opacity = "1";
      });
      pre.addEventListener("mouseleave", () => {
        btn.style.opacity = "0";
      });

      // 复制逻辑
      btn.addEventListener("click", () => {
        const code = block.innerText;
        copy(code);
        const originalText = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      });

      pre.appendChild(btn);
    }
  });
};

// 监听内容变化
watch(
  () => props.content,
  async (newVal) => {
    if (newVal) {
      sanitizedContent.value = sanitizeHtml(newVal);
      await nextTick();
      highlightAndAddCopy();
    }
  },
  { immediate: true }
);

// 初始加载
onMounted(() => {
  if (props.content) {
    sanitizedContent.value = sanitizeHtml(props.content);
    nextTick().then(highlightAndAddCopy);
  }
});
</script>

<style scoped>
.code-highlighted-container :deep(pre) {
  position: relative;
  margin: 16px 0;
  border-radius: 6px;
  overflow: hidden;
}

.code-highlighted-container :deep(.copy-btn) {
  /* 样式已在 JS 中设置，这里可覆盖 */
}

.code-highlighted-container :deep(code.hljs) {
  font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;
  font-size: 0.8rem
  line-height: 1.4;
}



</style>
