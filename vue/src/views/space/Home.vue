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
        <div ref="previewContainerRef" class="image-preview-content"></div>
      </div>
      <!-- 底部工具栏-->
      <div class="publishing-footer">
        <div class="toolbar-left">
          <!--表情按钮 -->
          <InputEmoji @select="selectEmoji" />
          <!--图片按钮 -->
          <InputImage
            :preview-container="previewContainerRef"
            @change="handleImageChange"
            :max-count="20"
          />
        </div>
        <!-- 右侧功能按钮组 -->
        <div class="toolbar-right">
          <!-- 字数显示 -->
          <div class="word-count">
            <span>{{ currentContentLength }}</span>
          </div>
          <div class="word-divider"></div>
          <!-- 发送按钮 -->
          <Button
            class="comment-submit-button"
            type="bilibili"
            @click.stop="handleSubmit"
            :disabled="
              !publishingTitleInnerValue.trim() && !publishingContentInnerValue.trim()
            "
          >
            发布
          </Button>
        </div>
      </div>
    </div>

    <div class="user-posts">
      <PostCard
        v-for="post in userPosts.list"
        :key="post.id"
        :post="post"
        @like="handleLike"
        @comment="handleComment"
        @reply="handleReply"
        @edit="handleEdit"
        @delete="handleDelete"
      />
      <!-- 无限滚动：加载提示 -->
      <div v-if="!setting.showPagination && userPosts.loading && hasMore" class="loading">
        加载中...
      </div>

      <!-- 无限滚动：无更多 -->
      <div
        v-if="!setting.showPagination && !hasMore && userPosts.list.length > 0"
        class="no-more"
      >
        已经到底啦！
      </div>

      <!-- 初始无数据 -->
      <!-- <div v-if="userPosts.list.length === 0 && !userPosts.loading" class="no-data">暂无发布</div> -->
    </div>
    <div v-if="shouldShowPagination" class="posts-pagination">
      <Pagination
        :totalItems="userPosts.total"
        :pageSize="userPosts.pageSize"
        v-model="userPosts.currentPage"
        @change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup>
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";
import { computed, ref, watch, reactive, onMounted, onBeforeUnmount } from "vue";
import setting from "@/config/setting";
import { getUserPosts } from "@/api/posts";

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

const currentContentLength = computed(() => {
  return publishingContentInnerValue.value.length;
});

// 输入事件处理（自适应高度）
const handleContentInput = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
    textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 200)}px`;
  }
};

function selectEmoji(emoji) {
  publishingContentInnerValue.value += emoji;
}

//预览图定位
const previewContainerRef = ref(null);

// 接收图片
const imageFiles = ref([]);
function handleImageChange(files) {
  imageFiles.value = files;
}

const handleSubmit = async () => {};

//用户帖子记录
const userPosts = reactive({
  list: [],
  total: 0,
  currentPage: 1,
  pageSize: setting.postsPageSize || 10,
  loading: false,
});

//是否使用分页模式
const shouldShowPagination = computed(
  () => setting.showPagination && !userPosts.loading && userPosts.list.length > 0
);
//主视角定位，选择页面后可回到开头
const mainView = ref(null);
// 是否还能加载更多（用于无限滚动）
const hasMore = computed(() => {
  return userPosts.list.length < userPosts.total;
});

//搜索参数
const searchParams = reactive({
  keyword: "",
  type: "",
});

// 搜索触发函数
const handleSearch = ({ keyword, type }) => {
  // 更新搜索参数
  searchParams.keyword = keyword?.trim() || "";
  searchParams.type = type || "";
  // 重置分页状态
  userPosts.currentPage = 1;
  userPosts.list = [];
  userPosts.total = 0;
  // 重新加载（带搜索参数）
  loadPosts();
};

// ========== 加载逻辑 ==========
const loadPosts = async (isLoadMore = false) => {
  if (isLoadMore) {
    if (userPosts.loading || !hasMore.value) return;
  }

  userPosts.loading = true;
  //下一页
  const targetPage = isLoadMore ? userPosts.currentPage + 1 : userPosts.currentPage;

  try {
    const res = await getUserPosts(
      targetPage,
      userPosts.pageSize,
      "",
      searchParams.keyword,
      searchParams.type
    );

    if (setting.successCode.includes(res.code)) {
      const newPosts = res.data.list || [];
      const newTotal = res.data.total || 0;
      //console.log(res.data);
      if (isLoadMore) {
        userPosts.list.push(...newPosts);
        userPosts.currentPage += 1; // 已成功加载下一页
      } else {
        userPosts.list = newPosts;
        userPosts.total = newTotal;
        userPosts.currentPage = 1; // 重置为第 1 页
      }
    }
  } catch (error) {
    console.error("加载失败:", error);
  } finally {
    userPosts.loading = false;
  }
};

// ========== 分页器 ==========
const handlePageChange = (page) => {
  userPosts.currentPage = page;
  loadPosts();
  nextTick(() => {
    mainView.value?.scrollIntoView({ behavior: "smooth" });
  });
};

// ========== Window 滚动监听（仅无限滚动模式） ==========
let ticking = false;
const onScroll = () => {
  if (!ticking && !setting.showPagination) {
    requestAnimationFrame(() => {
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;

      // 距离底部 < 200px 触发加载（比 100 更宽松，体验更好）
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadPosts(true); // isLoadMore = true
      }
      ticking = false;
    });
    ticking = true;
  }
};

// ========== 生命周期 ==========
onMounted(() => {
  // 首次加载（不分页模式还是无限滚动都走这里）
  loadPosts();

  // 只有无限滚动模式才监听 window scroll
  if (!setting.showPagination) {
    window.addEventListener("scroll", onScroll);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
});

// ========== 事件处理 ==========
const handleLike = (postId) => {};
const handleComment = (postId) => {};
const handleReply = (postId, commentId) => {};
const handleEdit = (postId) => {};
const handleDelete = (postId) => {};
</script>

<style scoped>
.home {
  width: 100%;
  height: 100%;
  padding: 20px;
  --content-with: 700px;
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
  width: var(--content-with);
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
  width: 100%;
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
  margin-left: 10px;
  margin-right: 40px;
  color: var(--text-secondary);
  font-size: 0.8rem;
  height: 24px;
  line-height: 24px;
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

.image-preview-content {
  width: 100%;
  height: 100%;
}

.publishing-footer {
  width: 100%;
  margin-left: 20px;
  padding-right: 30px;
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

.word-count {
  margin-left: 10px;
  color: var(--text-secondary);
  font-size: 0.8rem;
  height: 24px;
  line-height: 24px;
  display: flex;
  align-items: center;
}

.word-divider {
  display: inline-block;
  height: 14px;
  margin: 0px 10px 0px 5px;
  border-left: solid 1px var(--text-secondary);
  vertical-align: -2px;
  opacity: 0.5;
}

/*发布按钮*/
.comment-submit-button {
  width: 65px;
  height: 32px;
  border-radius: 4px;
  font-weight: 500;
}

/* 个人帖子 */
.user-posts {
  margin-top: 40px;
  width: var(--content-with);
  height: 100%;
}


.posts-content {
  padding: 10px 20px;
}

.posts-pagination {
  padding: 12px;
}

.loading,
.no-more,
.no-data {
  text-align: center;
  padding: 16px;
  color: #888;
}

</style>
