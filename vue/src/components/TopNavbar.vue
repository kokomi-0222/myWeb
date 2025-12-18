<template>
  <!-- 顶部导航栏 -->
  <div class="header-bar">
    <div class="header-bar-left" style="height: 100%; width: 100%;">
      <svg style="height: 100%; width: 100%;" data-v-4a38563e="" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="home" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" class="tab-icon svg-inline--fa fa-home fa-w-18"><path data-v-4a38563e="" fill="currentColor" d="M280.37 148.26L96 300.11V464a16 16 0 0 0 16 16l112.06-.29a16 16 0 0 0 15.92-16V368a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v95.64a16 16 0 0 0 16 16.05L464 480a16 16 0 0 0 16-16V300L295.67 148.26a12.19 12.19 0 0 0-15.3 0zM571.6 251.47L488 182.56V44.05a12 12 0 0 0-12-12h-56a12 12 0 0 0-12 12v72.61L318.47 43a48 48 0 0 0-61 0L4.34 251.47a12 12 0 0 0-1.6 16.9l25.5 31A12 12 0 0 0 45.15 301l235.22-193.74a12.19 12.19 0 0 1 15.3 0L530.9 301a12 12 0 0 0 16.9-1.6l25.5-31a12 12 0 0 0-1.7-16.93z" class=""></path></svg>
    </div>
    <div class="header-bar-right" style="height: 100%; width: 100%;">
    </div>
  </div>
  <div class="top-navbar">
    <img
      src="@/assets/images/bgTop.jpg"
      alt=""
      style="height: 100%; width: 100%; object-fit: cover"
    />
  </div>
</template>
<script setup>
import { ref } from "vue";
import { House } from "@element-plus/icons-vue";

</script>

<style scoped>
.header-bar {
  position: absolute;
  top: 0;
  z-index: 1002;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  max-width: 2560px;
  width: 100%;
  height: 64px;
  background-color: rgba(255, 255, 255, 1);
}

.top-navbar {
  position: relative;
  z-index: 0;
  display: flex;
  -ms-flex-pack: center;
  justify-content: center;
  margin: 0 auto;
  min-width: 1000px;
  min-height: 155px;
  height: 300px;
  max-height: 40vh;
  background-color: #e3e5e7;
  background-position: center 0;
  background-size: cover;
  background-repeat: no-repeat;
}
</style>
