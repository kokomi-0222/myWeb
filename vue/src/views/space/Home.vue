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
          @input="handleTitleInput"
        />
        <div
          v-if="showPublishingTitleClear"
          class="clear-title-btn"
          @click="clearTitleInput"
        >
          <IconClearButton size="18" />
        </div>
        <div class="title-limit">
          <span v-if="currentTitleLength">{{ currentTitleLength }}</span>
        </div>
      </div>

      <div class="publishing-content">
        <textarea
          ref="textareaRef"
          v-model="publishingContentInnerValue"
          class="input-content"
          placeholder="写下你的想法吧"
          maxlength="1000"
          @input="handleContentInput"
        />
      </div>
      <!-- 底部工具栏-->
      <div class="publishing-footer">
        <div class="toolbar-left">
        <InputEmoji
          @select="selectEmoji"
        />
        
        </div>
        <!-- 右侧功能按钮组 -->
        <div class="toolbar-right">
          <!-- 发送按钮 -->
          <Button
            class="comment-submit-button"
            type="bilibili"
            @click.stop="handleSubmit"
            :disabled="
              !publishingTitleInnerValue.trim() && !publishingContentInnerValue.trim()
            "
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";
import { computed, ref, watch } from "vue";
import setting from "@/config/setting";
const uiStore = useUIStore();
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
const roleInfo = computed(() => {
  return roleOptions.find((item) => item.role === userStore.user?.primaryRole);
});

const publishingTitleInnerValue = ref("");
const maxTitleLimit = 20;

const showPublishingTitleClear = computed(() => {
  return publishingTitleInnerValue.value.trim();
});

const currentTitleLength = computed(() => {
  return publishingTitleInnerValue.value.length;
});

// 清空输入
function clearTitleInput() {
  publishingTitleInnerValue.value = "";
}

//
function handleTitleInput() {
  if (publishingTitleInnerValue.value.length > maxTitleLimit) {
    publishingTitleInnerValue.value = publishingTitleInnerValue.value.slice(
      0,
      maxTitleLimit
    );
  }
}

const textareaRef = ref(null);
const publishingContentInnerValue = ref("");
// 输入事件处理（自适应高度）
const handleContentInput = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
    textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 200)}px`;
  }
};

function selectEmoji(emoji) {
  publishingContentInnerValue.value += emoji
}

const handleSubmit = async () => {};
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
  width: 600px;
  height: 100%;
  margin-top: 20px;
  padding: 20px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  user-select: none;
}

.publishing-title {
  display: flex;
  width: 100%;
  height: 24px;
  margin-left: 20px;
  margin-right: 50px;
  background-color: transparent;
  align-items: center;
  transition: opacity 0.2s ease-in-out;
}

.publishing-title label {
  display: none;
  margin-right: 10px;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
  transition: opacity 0.2s ease-in-out;
}

.input-title {
  width: 400px;
  border: none;
  outline: none;
  font-size: 1rem;
  font-weight: 500;
  padding: 0px;
  padding-right: 30px;
  color: var(--text-primary);
  background-color: transparent;
}

.input-title::placeholder {
  color: var(--text-secondary);
  opacity: 0.8;
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

.title-limit {
  margin-left: 30px;
  color: var(--text-secondary);
  font-size: 0.8rem;
  height: 24px;
  line-height: 24px; /* 关键 */
  display: flex;
  align-items: center;
}

.publishing-content {
  width: 100%;
  height: 100%;
  margin-left: 20px;
  padding-right: 30px;
  margin-top: 10px;
}

.input-content {
  width: 100%;
  box-sizing: border-box;
  border: none;
  outline: none;
  resize: none;
  line-height: 24px;
  font-size: 0.9rem;
  color: #333;
  min-height: 24px;
}

.input-content::placeholder {
  color: var(--text-secondary);
  opacity: 0.8;
}

.publishing-footer {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 左侧*/
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

.comment-submit-button {
  width: 65px;
  height: 32px;
  border-radius: 4px;
  font-weight: 500;
}
</style>
