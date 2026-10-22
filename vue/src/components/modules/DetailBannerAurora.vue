<template>
  <div class="detail-aurora" aria-hidden="true">
    <!-- 光斑：用 radial-gradient 而不是 filter: blur()，同样的柔和度，零滤镜开销 -->
    <span class="aurora-blob aurora-blob--1"></span>
    <span class="aurora-blob aurora-blob--2"></span>
    <span class="aurora-blob aurora-blob--3"></span>
    <!-- 细格线，从中间向外淡出，给纯渐变底一点「材质」 -->
    <span class="aurora-grid"></span>
    <!-- 右下角同心圆，呼应 B 站空间页的装饰语言 -->
    <span class="aurora-rings"></span>
    <!-- 底边高光线：给横幅一条干净的收口，不用白雾硬糊 -->
    <span class="aurora-edge"></span>
  </div>
</template>

<script setup>
/**
 * 详情页横幅（纯 CSS 版，无素材依赖）
 *
 * 为什么改成这个：原来的 DetailBanner.vue 是 10 层 PNG 视差，
 * 但分层素材需要自己画/切图，暂时没有；同时插画风和站点「浅灰底 + 白卡片」的界面不太统一。
 * 这个版本只用 CSS 渐变 + 光斑，零图片请求、深浅主题各自一套。
 *
 * 配色思路：
 * 1. 底色是低饱和的墨蓝（不是品牌亮蓝），顶栏白色图标压在顶部最暗处，对比度天然够
 * 2. 渐变方向「上暗下亮」，底部自动接到内容区的浅色，过渡不生硬
 * 3. 青色 / 品牌粉两个光斑只做点缀，整个横幅保持「安静的深色头图」气质，
 *    这样下面大片白卡片才是视觉主体
 *
 * 改动提醒：
 * - 想把底色改浅，必须同时处理 TopNavbar 的白字（--header-bar-icon 等），否则顶栏会看不见
 * - 以后有了分层素材，把 PostDetail.vue 里的这个组件换回 DetailBanner 即可，
 *   视差逻辑和 assets/images/banner-detail/ 的素材都还留着
 */
</script>

<style scoped>
.detail-aurora {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 四层叠加：斜向光带 + 三个柔光 + 一层对角渐变（左上深墨蓝 → 右下青蓝） */
  background:
    /* 一道斜穿画面的柔光，让扁长条不至于「一块模糊的蓝」 */
    linear-gradient(
      112deg,
      rgba(122, 240, 255, 0) 24%,
      rgba(122, 240, 255, 0.13) 43%,
      rgba(122, 240, 255, 0.02) 53%,
      rgba(122, 240, 255, 0) 65%
    ),
    radial-gradient(
      72% 180% at 6% -62%,
      rgba(95, 208, 243, 0.2) 0%,
      rgba(95, 208, 243, 0) 62%
    ),
    radial-gradient(
      64% 160% at 96% 130%,
      rgba(251, 114, 153, 0.26) 0%,
      rgba(251, 114, 153, 0) 66%
    ),
    linear-gradient(
      150deg,
      #092838 0%,
      #0d3f56 30%,
      #115a76 58%,
      #157a9b 82%,
      #1a8db2 100%
    );
}

/* ---- 光斑 ---- */
.aurora-blob {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  will-change: transform;
}

.aurora-blob--1 {
  width: 56%;
  height: 210%;
  left: -12%;
  top: 36%;
  background: radial-gradient(
    closest-side,
    rgba(95, 208, 243, 0.34),
    rgba(95, 208, 243, 0) 72%
  );
  animation: aurora-drift-1 26s ease-in-out infinite alternate;
}

.aurora-blob--2 {
  width: 46%;
  height: 185%;
  right: 0%;
  top: 26%;
  background: radial-gradient(
    closest-side,
    rgba(251, 114, 153, 0.26),
    rgba(251, 114, 153, 0) 74%
  );
  animation: aurora-drift-2 32s ease-in-out infinite alternate;
}

.aurora-blob--3 {
  width: 36%;
  height: 155%;
  right: 14%;
  bottom: -50%;
  background: radial-gradient(
    closest-side,
    rgba(122, 240, 255, 0.26),
    rgba(122, 240, 255, 0) 76%
  );
  animation: aurora-drift-3 22s ease-in-out infinite alternate;
}

@keyframes aurora-drift-1 {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(7%, -9%, 0) scale(1.12);
  }
}

@keyframes aurora-drift-2 {
  from {
    transform: translate3d(0, 0, 0) scale(1.05);
  }
  to {
    transform: translate3d(-8%, 8%, 0) scale(0.93);
  }
}

@keyframes aurora-drift-3 {
  from {
    transform: translate3d(0, 0, 0) scale(0.95);
  }
  to {
    transform: translate3d(-6%, -8%, 0) scale(1.1);
  }
}

/* ---- 细格线 ---- */
.aurora-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px);
  background-size: 42px 42px;
  /* 中心清楚、四周淡出，避免看起来像贴了张网格纸 */
  mask-image: radial-gradient(
    128% 130% at 44% 6%,
    #000 0%,
    rgba(0, 0, 0, 0.4) 56%,
    transparent 86%
  );
  -webkit-mask-image: radial-gradient(
    128% 130% at 44% 6%,
    #000 0%,
    rgba(0, 0, 0, 0.4) 56%,
    transparent 86%
  );
}

/* ---- 右下角同心圆 ---- */
.aurora-rings {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(
      circle at 84% 128%,
      transparent 0 98px,
      rgba(255, 255, 255, 0.14) 98px 99px,
      transparent 99px
    ),
    radial-gradient(
      circle at 84% 128%,
      transparent 0 138px,
      rgba(255, 255, 255, 0.1) 138px 139px,
      transparent 139px
    ),
    radial-gradient(
      circle at 84% 128%,
      transparent 0 182px,
      rgba(255, 255, 255, 0.07) 182px 183px,
      transparent 183px
    );
}

/* ---- 底边高光线：一条柔柔的白线收口，比白雾过渡干净得多 ---- */
.aurora-edge {
  position: absolute;
  inset: auto 0 0 0;
  height: 1px;
  pointer-events: none;
  background: linear-gradient(
    to right,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.14) 20%,
    rgba(255, 255, 255, 0.26) 50%,
    rgba(255, 255, 255, 0.14) 80%,
    rgba(255, 255, 255, 0) 100%
  );
}

/* ---- 深色主题：整体压暗、降饱和，避免夜空感过头 ---- */
:global(:root.dark .detail-aurora) {
  background:
    linear-gradient(
      112deg,
      rgba(122, 240, 255, 0) 24%,
      rgba(122, 240, 255, 0.08) 43%,
      rgba(122, 240, 255, 0.015) 53%,
      rgba(122, 240, 255, 0) 65%
    ),
    radial-gradient(
      72% 180% at 6% -62%,
      rgba(95, 208, 243, 0.16) 0%,
      rgba(95, 208, 243, 0) 62%
    ),
    radial-gradient(
      64% 160% at 96% 130%,
      rgba(251, 114, 153, 0.16) 0%,
      rgba(251, 114, 153, 0) 66%
    ),
    linear-gradient(
      150deg,
      #050f16 0%,
      #071b26 30%,
      #092735 58%,
      #0b3446 82%,
      #0d3f54 100%
    );
}

:global(:root.dark .aurora-blob--1) {
  background: radial-gradient(
    closest-side,
    rgba(95, 208, 243, 0.22),
    rgba(95, 208, 243, 0) 72%
  );
}

:global(:root.dark .aurora-blob--2) {
  background: radial-gradient(
    closest-side,
    rgba(251, 114, 153, 0.18),
    rgba(251, 114, 153, 0) 74%
  );
}

:global(:root.dark .aurora-blob--3) {
  background: radial-gradient(
    closest-side,
    rgba(122, 240, 255, 0.16),
    rgba(122, 240, 255, 0) 76%
  );
}

:global(:root.dark .aurora-grid) {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
}

:global(:root.dark .aurora-rings) {
  opacity: 0.72;
}

:global(:root.dark .aurora-edge) {
  background: linear-gradient(
    to right,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.06) 20%,
    rgba(255, 255, 255, 0.12) 50%,
    rgba(255, 255, 255, 0.06) 80%,
    rgba(255, 255, 255, 0) 100%
  );
}

/* 尊重系统的「减少动态效果」设置 */
@media (prefers-reduced-motion: reduce) {
  .aurora-blob {
    animation: none !important;
  }
}
</style>
