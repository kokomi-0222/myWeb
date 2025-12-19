<template>
  <!-- 顶部导航栏 -->
  <div class="header-bar">
    <div class="header-bar-left">
      <IconHome class="iconHome" size="36" />
      <span style="font-size: 18px">{{ $route.meta.title }}</span>
    </div>
    <div class="header-bar-center">
      <!--  <el-input
        placeholder="请输入内容"
        style="
          height: 36px;
          width: 100%;
          border-radius: 18px;
          padding: 0 10px;
        "
      ><template #append>
        <el-button :icon="Search" />
      </template></el-input> -->
      <InputSearch
        v-model="searchText"
        placeholder="搜索帖子、用户..."
        @search="onSearch"
      />
    </div>
    <!-- 右侧 -->
    <div class="header-bar-right">
      <!-- 切换主题 -->
      <div class="header-bar-switch">
        <el-switch
          v-model="styleSwitch"
          :active-action-icon="IconLight"
          :inactive-action-icon="IconDark"
        >
        </el-switch>
      </div>
      <!-- 登录 -->
      <div class="header-bar-login">
        <el-button
          @click="login"
          color="#00aeec"
          style="
            height: 36px;
            width: 36px;
            border-radius: 50%;
            color: white;
            font-size: 16px;
          "
          >登录</el-button
        >
      </div>
      <!-- 消息  -->
      <div class="header-bar-message">
        <el-icon color="#000" :size="24"><Message /></el-icon>
      </div>
      <!-- 联系站长 -->
      <div class="header-bar-contact">
        <el-icon color="#000" :size="24"><Promotion /></el-icon>
      </div>
      <!-- 发布动态 -->
      <div class="header-bar-publish">
        <el-button color="#fb7299" style="height: 36px; width: 36px; border-radius: 30%"
          ><el-icon size="large" color="#fff"><UploadFilled /></el-icon
        ></el-button>
      </div>
    </div>
  </div>
  <!-- 顶部宣传图 -->
  <!--  <div class="header-banner">
    <img
      src="@/assets/images/bgTop.jpg"
      alt=""
      style="height: 100%; width: 100%; object-fit: cover"
    />
  </div> -->
</template>
<script setup>
import { ref } from "vue";
import { Search, Message, UploadFilled, Promotion } from "@element-plus/icons-vue";
import IconHome from "./icons/IconHome.vue";
import IconLight from "./icons/IconLight.vue";
import IconDark from "./icons/IconDark.vue";
import InputSearch from "./inputs/InputSearch.vue";
const styleSwitch = ref(true);

const searchText = ref('')

function onSearch(keyword) {
  console.log('执行搜索:', keyword)
  // 这里调用你的 API

}

const login = () => {
  console.log("登录");
};


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
  width: 100%;
  height: 64px;
  background-color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.header-bar-left {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding-left: 20px;
}

.header-bar-center {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 20px;
}

.header-bar-right {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 20px;
  padding-right: 20px;
}

.iconHome {
  color: #00aeec;
}

.header-banner {
  position: relative;
  z-index: 0;
  display: flex;
  justify-content: center;
  margin: 0 auto;
  width: 100%;
  height: 300px;
  background-color: #e3e5e7;
  background-position: center 0;
  background-size: cover;
  background-repeat: no-repeat;
}

.el-switch {
  --el-switch-off-color: #f2f2f2;
  --el-switch-on-color: #f2f2f2;
  --el-switch-border-color: #dcdfe6;
}

:deep(.icon-dark),
:deep(.icon-light) {
  color: #222;
}
</style>
