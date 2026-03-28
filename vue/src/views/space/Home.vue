<template>
  <div v-if="userStore.isLogin" class="home">
    <div class="user-info">
      <Avatar :src="userStore.user?.avatar" :alt="userStore.user?.name" :size="48" />
      <div class="user-name">
        <span :style="{ color: userStore.user?.nameColor }">{{
          userStore.user?.name
        }}</span>
      </div>
      <div class="user-role" :style="{ backgroundColor: userStore.user?.nameColor }">
        <span>{{ roleInfo?.name }}</span>
      </div>
    </div>
    <div class="user-tips">
      <span class="user-tips-text"> 今天想说些什么呢？ </span>
    </div>
    <div class="publishing">
      <div class="publishing-title">
        <label :for="id"> 标题：</label>
        <input
          :id="id"
          v-model="publishingTitleInnerValue"
          class="input-title"
          type="text"
          autocomplete="off"
          placeholder="好的标题更容易被人发现哦，选填20字"
        />
        <div
          v-if="showPublishingTitleClear"
          class="clear-title-btn"
          @click="clearTitleInput"
        >
          <IconClearButton size="16" />
        </div>
      </div>
      <div class="publishing-content"> 
      </div>
    </div>
  </div>
</template>

<script setup>
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";
import { computed, ref } from "vue";
const ui = useUIStore();
const userStore = useUserStore();
const id = `input-${Math.random().toString(36).substring(2, 11)}`;
// 角色映射表：key = role，value = 中文名
const roleOptions = [
  { role: "admin", name: "管理员" },
  { role: "moderator", name: "版主" },
  { role: "editor", name: "编辑" },
  { role: "vip", name: "会员" },
  { role: "member", name: "会员" },
  { role: "guest", name: "访客" },
];

const roleInfo = roleOptions.find((item) => item.role === userStore.user?.primaryRole);

const publishingTitleInnerValue = ref("");

const showPublishingTitleClear = computed(() => {
  return publishingTitleInnerValue.value.trim();
});

// 清空输入
function clearTitleInput() {
  publishingTitleInnerValue.value = "";
}
</script>

<style scoped>
.home {
  width: 100%;
  height: 100%;
  padding: 20px;
}

.user-info {
  display: flex;
}

.user-name {
  display: inline-block;
  margin-left: 10px;
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--text-primary);
  transition: opacity 0.2s ease-in-out;
}

.user-role {
  padding: 2px 4px;
  margin-left: 10px;
  border-radius: 4px;
  height: fit-content;
  width: fit-content;
  font-size: 0.8rem;
  border: 1px solid var(--border-color);
  color: var(--bg-primary);
  background-color: var(--bg-secondary);
  transition: opacity 0.2s ease-in-out;
}

.user-tips {
  margin-top: 40px;
  margin-left: 20px;
}

.user-tips-text {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.publishing {
  width: 100%;
  height: 100%;
  margin-top: 20px;
  padding: 20px;
  background-color: var(--bg-secondary);
  user-select: none;
}

.publishing-title {
  display: flex;
  width: 100%;
  height: 100%;
  margin-left: 20px;
  margin-right: 50px;
  background-color: transparent;
  transition: opacity 0.2s ease-in-out;
}

.publishing-title label {
  display: inline-block;
  margin-right: 10px;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
  transition: opacity 0.2s ease-in-out;
}

.input-title {
/*   flex: 1; */
  width: 400px;
  border: none;
  outline: none;
  font-size: 1rem;
  font-weight: 500;
  padding-right: 30px;
  color: var(--text-primary);
  background-color: transparent;
  border-bottom: 1px solid #ccc;
}

.input-title::placeholder {
  color: var(--text-secondary);
}

.clear-title-btn {
  border: none;
  cursor: pointer;
  height: 20px;
  width: 20px;
  margin-left: -20px;
  color: var(--input-search-clear-btn);
  display: flex;
  align-items: center;
  justify-content: center;
}

.publishing-content {
  width: 100%;
  height: 300px;
  background-color: var(--bg-secondary);
}
</style>
