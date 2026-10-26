<template>
  <div ref="mainView"></div>
  <!-- 路由守卫正常时不会走到这里；作为兜底显示 -->
  <div v-if="!userStore.isLogin" class="login-gate">
    <div class="login-gate__icon"><IconUser size="40" /></div>
    <p class="login-gate__title">登录后才能查看个人空间</p>
    <p class="login-gate__desc">在这里发布帖子、管理账号和查看消息</p>
    <button class="login-gate__btn" @click="uiStore.openLoginModal()">立即登录</button>
  </div>
  <div v-else-if="userStore.user" class="home">
    <div class="user-info">
      <Avatar :src="userStore.user?.avatar" :alt="userStore.user?.name" :size="48" />
      <div class="user-name">
        <span :style="{ color: userStore.user?.nameColor }">{{
          userStore.user?.name
        }}</span>
      </div>
      <div
        class="user-role"
        :style="{ backgroundColor: roleBlockBg, color: roleBlockFg }"
      >
        <span>{{ userStore.primaryRole?.name }}</span>
      </div>
    </div>
    <div class="user-tips">
      <span class="user-tips-text">
        <template v-if="userStore.isMuted">你暂时不能发布新内容</template>
        <template v-else-if="!userStore.canComment">绑定邮箱后就能评论、发帖啦</template>
        <template v-else-if="!userStore.canPost">你可以评论和回复，发帖权还没开通</template>
        <template v-else>{{ editingPost ? "正在编辑已发布的帖子" : "今天想说些什么呢？" }}</template>
      </span>
    </div>
    <!--
      被禁言：不给一个点了会报错的编辑框，直接把原因和期限摆出来。
      后端接口同样会拦（绕过前端也没用），这里只是别让人白写一大段。
    -->
    <div v-if="userStore.isMuted" class="muted-notice">
      <IconAlert class="muted-notice__icon" size="18" />
      <div class="muted-notice__body">
        <p class="muted-notice__title">你已被禁言</p>
        <p class="muted-notice__desc" :title="userStore.muteDetail">
          {{ userStore.muteDetail }}
        </p>
        <p class="muted-notice__hint">禁言期间无法发布内容、评论和回复</p>
      </div>
      <!--
        禁言到期后后端不会再主动推，页面也不会自己变回发布框。
        给一个手动检查的入口，省得用户为了恢复发布非要整页刷新一遍。
      -->
      <button
        type="button"
        class="muted-notice__refresh"
        :disabled="muteRefreshing"
        @click="handleRefreshMute"
      >
        {{ muteRefreshing ? "检查中…" : "刷新状态" }}
      </button>
    </div>
    <!--
      等级不到：和禁言一样，不给一个点了会报错的编辑框。
      分两种，因为「怎么解决」完全不同：
        游客（还没绑邮箱）→ 自己能解决，给按钮去绑定，绑完直接能评论也能发帖；
        能评论但不能发帖的自定义角色 → 只能找站长，给按钮等于骗人。
      默认角色矩阵里会员和普通用户都能发帖，所以金色卡平时不会出现；
      它是留给「后台造出一个只读角色」时兜底的，别删。
    -->
    <div v-else-if="!userStore.canComment" class="muted-notice muted-notice--verify">
      <IconMail class="muted-notice__icon" size="18" />
      <div class="muted-notice__body">
        <p class="muted-notice__title">绑定邮箱后就能评论</p>
        <p class="muted-notice__desc">
          <template v-if="userStore.user?.email">验证码会发到 {{ userStore.user.email }}</template>
          <template v-else>点右侧按钮填一个邮箱，收 6 位验证码</template>
        </p>
        <p class="muted-notice__hint">绑完自动成为普通用户，评论和发帖都开了</p>
      </div>
      <button
        type="button"
        class="muted-notice__refresh"
        @click="uiStore.openVerifyModal()"
      >
        去绑定
      </button>
    </div>
    <div v-else-if="!userStore.canPost" class="muted-notice muted-notice--vip">
      <IconCrown class="muted-notice__icon" size="18" />
      <div class="muted-notice__body">
        <p class="muted-notice__title">你的账号还没有发帖权限</p>
        <p class="muted-notice__desc">评论和回复都能用，发帖要等站长给你开通</p>
        <p class="muted-notice__hint">开通后这里会变回发布框，评论区的功能不受影响</p>
      </div>
    </div>
    <div v-else ref="publishingRef" class="publishing" :class="{ 'is-editing': editingPost }">
      <!-- 编辑模式提示条：明确当前不是新发布，避免误以为会再发一条 -->
      <div v-if="editingPost" class="edit-banner">
        <IconEdit size="16" />
        <span class="edit-banner__text">
          正在编辑{{ editingPost.title ? `《${editingPost.title}》` : "这条帖子" }}<span class="edit-banner__hint">，保存后原帖会更新</span>
        </span>
        <button type="button" class="edit-banner__cancel" @click="exitEdit">
          取消编辑
        </button>
      </div>

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
          :maxlength="setting.postTitleMaxLength"
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

      <!-- 分类选择 -->
      <div class="publishing-category">
        <span
          v-for="cat in postCategories"
          :key="cat.value"
          class="category-tag"
          :class="{ active: selectedCategory === cat.value }"
          @click="selectedCategory = selectedCategory === cat.value ? '' : cat.value"
        >
          {{ cat.name }}
        </span>
        <!-- 只有持有 topic:create 权限的角色（站长）能看到，普通用户只能在已有话题里选 -->
        <button
          v-if="canCreateTopic"
          type="button"
          class="category-tag category-tag--add"
          @click="handleCreateTopic"
        >
          + 新建话题
        </button>
      </div>

      <div class="publishing-content">
        <textarea
          ref="textareaRef"
          v-model="publishingContentInnerValue"
          class="input-content"
          placeholder="写下你的想法吧"
          :maxlength="setting.postMaxLength"
          @input="handleContentInput"
          @keydown="handleContentKeydown"
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
            ref="imageInputRef"
            :preview-container="previewContainerRef"
            @change="handleImageChange"
            @change-total="handleMediaTotalChange"
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
              (!publishingTitleInnerValue.trim() && !publishingContentInnerValue.trim()) ||
              submitting
            "
          >
            <template v-if="submitting">
              {{ editingPost ? "保存中..." : "发布中..." }}
            </template>
            <template v-else>{{ editingPost ? "保存修改" : "发布" }}</template>
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
    <div v-show="shouldShowPagination" class="posts-pagination">
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
import { useTopicStore } from "@/stores/topic";
import IconUser from "@/components/icons/IconUser.vue";
import {
  computed,
  ref,
  watch,
  reactive,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import setting from "@/config/setting";
import { getMyPosts, getPostById } from "@/api/posts";
import { createPosts, updatePosts } from "@/api/posts";
import { uploadPostImage } from "@/api/file";
import message from "@/utils/message";
import { normalizeContent, isBlankContent } from "@/utils/contentText";
import { handleTabIndent } from "@/utils/textareaTab";
import { usePermission } from "@/utils/usePermission";
import { roleBlockColor, contrastText } from "@/utils/roleTag";
import { ElMessageBox } from "element-plus";
import { useRoute, useRouter } from "vue-router";
import IconEdit from "@/components/icons/IconEdit.vue";
import IconAlert from "@/components/icons/IconAlert.vue";
import IconMail from "@/components/icons/IconMail.vue";
import IconCrown from "@/components/icons/IconCrown.vue";

const uiStore = useUIStore();
const userStore = useUserStore();
const id = `input-${Math.random().toString(36).substring(2, 11)}`;

// 身份标签方块：后台设了 roleColor 就用它，没设沿用 nameColor（和拆字段前一致）
const roleBlockBg = computed(() =>
  roleBlockColor(userStore.user?.roleColor, userStore.user?.nameColor)
);
// 文字色按底色亮度算，浅色底上不会出现看不见的白字
const roleBlockFg = computed(() => contrastText(roleBlockBg.value));

const submitting = ref(false);

// 分类选项：改成读话题字典，站长新建的话题立刻能选
const topicStore = useTopicStore();
const postCategories = computed(() => topicStore.list);
const selectedCategory = ref('');

// 谁能新建话题，跟后端的 topic:create 权限保持一致
// （登录接口本来就返回 permissions 数组，这里直接查）
const { hasPermission } = usePermission();
const canCreateTopic = computed(() => hasPermission('topic:create'));

/**
 * 新建话题。用 ElMessageBox.prompt 而不是自己写弹窗，
 * 样式已经在 assets/css/message-box.css 里统一过，和删除确认框是同一套。
 */
const handleCreateTopic = async () => {
  let name = '';
  try {
    const { value } = await ElMessageBox.prompt(
      '新建后所有人在发布时都能选到它，话题栏也会出现',
      '新建话题',
      {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputPlaceholder: '例如：读书、旅行、编程',
        inputValidator: (v) => {
          const s = String(v ?? '').trim();
          if (!s) return '话题名称不能为空';
          if (s.length > 16) return '话题名称不能超过16个字';
          if (topicStore.list.some((t) => t.name === s)) return '这个话题已经存在了';
          return true;
        },
      }
    );
    name = String(value ?? '').trim();
  } catch {
    return; // 用户点了取消 / 关闭
  }

  try {
    const created = await topicStore.addTopic(name);
    // 建完直接选中，省得再点一次
    if (created?.value) selectedCategory.value = created.value;
    message.success(`已新建话题「${created?.name || name}」`);
  } catch (err) {
    message.error(err?.message || '新建话题失败');
  }
};






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
/* function handleTitleInput() {
  if (publishingTitleInnerValue.value.length > maxTitleLimit) {
    publishingTitleInnerValue.value = publishingTitleInnerValue.value.slice(
      0,
      maxTitleLimit
    );
  }
} */

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

/**
 * 正文输入框的按键：
 * - Tab → 插入 4 个空格（见 utils/textareaTab.js），不再把焦点跳到「发布」
 * - Ctrl / Cmd + Enter → 提交，和评论框的快捷键习惯一致。
 *   Tab 被缩进占用后，键盘用户没法按 Tab 走到发布按钮，这里补一个出口。
 */
const handleContentKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    handleSubmit();
    return;
  }
  handleTabIndent(e);
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

const handleSubmit = async () => {
  const title = publishingTitleInnerValue.value.trim();
  // 只清尾部空白与开头空行，保留首行缩进（显示端 white-space: pre-wrap 会如实还原）
  const content = normalizeContent(publishingContentInnerValue.value);

  if (!title && isBlankContent(content)) return;

  submitting.value = true;
  try {
    // 按预览区顺序组装媒体：老图直接沿用 url（后端认出 /upload/images/ 就原样保留），
    // 新选的图先上传换成临时 url，再由后端搬进 images 目录
    const mediaList = [];
    for (const item of mediaTotal.value) {
      if (item.remote && item.url) {
        mediaList.push({ url: item.url, type: 'image' });
        continue;
      }
      if (!item.file) continue;
      try {
        const res = await uploadPostImage(item.file);
        if (setting.successCode.includes(res.code)) {
          mediaList.push({
            url: res.data.url,
            type: res.data.type || 'image',
            size: res.data.size || item.file.size,
            format: res.data.format || '',
          });
        }
      } catch (err) {
        console.error('图片上传失败:', err);
      }
    }

    const isEdit = !!editingPost.value;
    const payload = {
      title,
      content,
      type: selectedCategory.value || (isEdit ? '' : undefined),
      // 编辑时即使一张图都没有也要传空数组：这代表「图被我删光了」。
      // 传 undefined 会被后端当成「这次没动图」而把原图留着。
      media: isEdit ? mediaList : mediaList.length > 0 ? mediaList : undefined,
    };

    const res = isEdit
      ? await updatePosts(editingPost.value.id, payload)
      : await createPosts(payload);

    if (!setting.successCode.includes(res.code)) {
      message.error(res.msg || (isEdit ? '保存失败' : '发布失败'));
      return;
    }

    message.success(isEdit ? '已保存修改' : '发布成功!');

    if (isEdit) {
      exitEdit();
      userPosts.currentPage = 1;
      await loadPosts();
      // 回到列表顶部，方便确认改动后的样子
      mainView.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // 清空表单（图片预览区也要清，否则发完图还挂在那里）
      publishingTitleInnerValue.value = '';
      publishingContentInnerValue.value = '';
      selectedCategory.value = '';
      imageFiles.value = [];
      mediaTotal.value = [];
      imageInputRef.value?.setRemoteImages([]);
      if (textareaRef.value) {
        textareaRef.value.style.height = 'auto';
      }

      // 重新加载帖子列表
      userPosts.currentPage = 1;
      await loadPosts();
    }
  } catch (err) {
    console.error('提交失败:', err);
    // 被禁言时拦截器已经弹了完整原因，发布框也会切成提示卡，别再叠一句「发布失败」
    if (!err?.muted) {
      message.error(editingPost.value ? '保存失败' : '发布失败');
    }
  } finally {
    submitting.value = false;
  }
};

// ===== 编辑已有帖子 =====
// 帖子卡片菜单「编辑」→ /space/home?edit={id}：复用顶部这个发布框，
// 只是换成「保存修改」并把原标题、正文、话题、图片回填进来。
const route = useRoute();
const router = useRouter();
const publishingRef = ref(null);
const imageInputRef = ref(null);
const editingPost = ref(null);
// 预览区的完整列表（老图 + 新选的图），顺序就是提交顺序
const mediaTotal = ref([]);
// 防止图片被重复回填（user 晚到 / 组件重新挂载都会再触发一次）
let mediaFilledFor = null;

function handleMediaTotalChange(list) {
  mediaTotal.value = list || [];
}

function applyEditingMedia() {
  if (!editingPost.value || !imageInputRef.value) return;
  if (mediaFilledFor === editingPost.value.id) return;
  mediaFilledFor = editingPost.value.id;
  imageInputRef.value.setRemoteImages(
    (editingPost.value.media || []).map((m) => ({
      url: m.previewUrl || m.thumbnailUrl || m.rowUrl,
    }))
  );
}

// 发布框在 v-else-if="userStore.user" 里，用户信息晚到时组件还没挂上，
// 所以除了主动补一次，也要盯着 ref 出现再补一次
watch(imageInputRef, (el) => {
  if (el) applyEditingMedia();
});

async function loadPostForEdit(id) {
  // 禁言期间连自己的旧帖也不能改（后端 updatePost 同样会拦），
  // 不然等于换个地方继续发内容。
  if (userStore.isMuted) {
    message.warning('你正在被禁言，暂时不能编辑帖子');
    exitEdit();
    return;
  }
  try {
    const res = await getPostById(id);
    if (!setting.successCode.includes(res.code) || !res.data) {
      message.error('帖子不存在或已删除');
      exitEdit();
      return;
    }
    const post = res.data;
    // 前端先拦一道给个明确提示，真正的权限判断在后端 updatePost 里
    const isOwner = post.author?.id === userStore.user?.id;
    if (!isOwner && !hasPermission('post:edit')) {
      message.error('无权编辑这条帖子');
      exitEdit();
      return;
    }

    editingPost.value = post;
    mediaFilledFor = null;
    publishingTitleInnerValue.value = post.title || '';
    publishingContentInnerValue.value = post.content || '';
    selectedCategory.value = post.type || '';

    await nextTick();
    applyEditingMedia();
    handleContentInput();
    publishingRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) {
    message.error('加载帖子失败');
    exitEdit();
  }
}

/** 退出编辑模式，发布框恢复成空白 */
function exitEdit() {
  editingPost.value = null;
  mediaFilledFor = null;
  mediaTotal.value = [];
  imageInputRef.value?.setRemoteImages([]);
  publishingTitleInnerValue.value = '';
  publishingContentInnerValue.value = '';
  selectedCategory.value = '';
  imageFiles.value = [];
  if (textareaRef.value) textareaRef.value.style.height = 'auto';
  if (route.query.edit) router.replace({ path: '/space/home' });
}

watch(
  () => route.query.edit,
  (id) => {
    if (id && String(id) !== String(editingPost.value?.id ?? '')) {
      loadPostForEdit(id);
    } else if (!id && editingPost.value) {
      // 地址栏的 edit 被清掉（比如点了浏览器后退），同步退出编辑
      exitEdit();
    }
  },
  { immediate: true }
);

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
    const res = await getMyPosts(
      targetPage,
      userPosts.pageSize,
      "",
      searchParams.keyword,
      searchParams.type,
    );

    if (setting.successCode.includes(res.code)) {
      const newPosts = res.data.list || [];
      const newTotal = res.data.total || 0;
      if (isLoadMore) {
        userPosts.list.push(...newPosts);
        userPosts.currentPage += 1; // 已成功加载下一页
      } else {
        userPosts.list = newPosts;
        userPosts.total = newTotal;
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
/** 禁言提示卡上的「刷新状态」：到点了不必整页刷新也能恢复发布框 */
const muteRefreshing = ref(false);
async function handleRefreshMute() {
  if (muteRefreshing.value) return;
  muteRefreshing.value = true;
  try {
    // refreshUser 不碰 isLoading，发布框不会先闪成「登录后可评论」再变回来
    await userStore.refreshUser();
  } finally {
    muteRefreshing.value = false;
  }
  if (userStore.isMuted) {
    // 卡片上已经写全了原因和期限，toast 只补一句结论，别再重复一遍长文案
    message.warning("仍在禁言中，解除后再试");
  } else {
    message.success("禁言已解除，现在可以发帖了");
  }
}

onMounted(() => {
  // 首次加载（不分页模式还是无限滚动都走这里）
  loadPosts();

  // 话题字典：发布框的分类标签要读它（store 有缓存，不会重复请求）
  topicStore.loadTopics();

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
const handleDelete = (postId) => {
  userPosts.list = userPosts.list.filter((p) => p.id !== postId);
  userPosts.total = Math.max(0, userPosts.total - 1);
};
</script>

<style scoped>
/* 未登录兜底 */
.login-gate {
  max-width: 700px;
  margin: 60px auto;
  padding: 60px 20px;
  text-align: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.login-gate__icon {
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.login-gate__title {
  margin: 0 0 6px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.login-gate__desc {
  margin: 0 0 18px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.login-gate__btn {
  padding: 9px 26px;
  border: none;
  border-radius: 19px;
  background: var(--primary-color);
  color: #fff;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.login-gate__btn:hover {
  background: var(--primary-color-hover);
}

.home {
  width: 100%;
  height: 100%;
  padding: 20px;
  --content-with: 700px;
  max-width: 700px;
  margin: 0 auto;
  box-sizing: border-box;
}

.user-info {
  display: flex;
  align-items: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 20px;
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
  margin-top: 24px;
  margin-left: 4px;
}

.user-tips-text {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.publishing {
  width: var(--content-with);
  margin-top: 16px;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  user-select: none;
  box-sizing: border-box;
}

/* 被禁言时顶替发布框的提示卡：和 .publishing 同宽同圆角，位置不跳 */
.muted-notice {
  /* grid 而不是 flex：图标 / 文字 / 按钮三列，文字列 minmax(0,1fr)，
     保证长原因会换行而不是把按钮挤出卡片 */
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 0 10px;
  width: var(--content-with);
  /* 桌面就是 700，但手机上 .home 只有 ~350（见文末媒体查询），
     光靠 width:100% 兜不住非 768 断点，这里再兜一层 */
  max-width: 100%;
  margin-top: 16px;
  padding: 16px 18px;
  box-sizing: border-box;
  border-radius: 12px;
  border: 1px solid rgba(251, 114, 153, 0.35);
  background: rgba(251, 114, 153, 0.08);
  color: #fb7299;
}

/* 邮箱未验证用主色蓝，和「禁言」的粉色区分开：一个是提醒你去做件事，一个是被罚 */
.muted-notice--verify {
  border-color: var(--primary-color-soft);
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  color: var(--primary-color);
}

.muted-notice--verify .muted-notice__desc,
.muted-notice--verify .muted-notice__hint {
  color: var(--text-secondary);
}

.muted-notice--verify .muted-notice__refresh {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

/* 等级不够发帖（普通用户）：金色，和「自己能解决的蓝」与「被处罚的粉」都区分开 */
.muted-notice--vip {
  border-color: rgba(230, 162, 60, 0.42);
  background: rgba(230, 162, 60, 0.08);
  color: #e6a23c;
}

.muted-notice--vip .muted-notice__desc,
.muted-notice--vip .muted-notice__hint {
  color: var(--text-secondary);
}

.muted-notice__icon {
  margin-top: 1px;
}

.muted-notice__body {
  min-width: 0;
}

.muted-notice__title {
  margin: 0 0 4px;
  font-size: 0.875rem;
  font-weight: 600;
}

.muted-notice__desc {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--text-secondary);
  word-break: break-word;
}

/* 「禁言期间无法发布内容、评论和回复」：桌面有空间，手机隐藏 */
.muted-notice__hint {
  margin: 6px 0 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--text-secondary);
  opacity: 0.8;
}

/* 提示卡右侧的「刷新状态」：描边胶囊，和站内其它次要操作同一套尺寸语言 */
.muted-notice__refresh {
  justify-self: end;
  margin-top: 1px;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(251, 114, 153, 0.45);
  background: transparent;
  color: #fb7299;
  font-size: 0.75rem;
  line-height: 26px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
}

.muted-notice__refresh:hover:not(:disabled) {
  background: rgba(251, 114, 153, 0.12);
  border-color: #fb7299;
}

.muted-notice__refresh:disabled {
  opacity: 0.6;
  cursor: default;
}

/* 手机宽度放不下并排：按钮换到第二行，左边距对齐标题文字（图标 18 + gap 10） */
@media (max-width: 767px) {
  .muted-notice {
    /* 用 grid 而不是 flex-wrap：flex 只要内容够短就会缩在按钮旁边，
       一旦文案长了就把按钮挤成两行高，卡片高度完全不可控 */
    grid-template-columns: auto minmax(0, 1fr);
    padding: 14px 16px;
    gap: 0 8px;
  }

  /* 手机上省掉「期间无法……」，标题 + 下面那行期限原因已经说清楚了 */
  .muted-notice__hint {
    display: none;
  }

  /* 原因可能很长（管理员随手写的），最多两行，超出省略，长按/悬停看全文 */
  .muted-notice__desc {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .muted-notice__refresh {
    grid-column: 2;
    justify-self: start;
    margin-top: 10px;
    height: 26px;
    padding: 0 11px;
    font-size: 0.72rem;
    line-height: 24px;
  }
}

/* 编辑模式：左侧留一条主色竖线，和「新发布」在视觉上区分开 */
.publishing.is-editing {
  position: relative;
  box-shadow: inset 3px 0 0 var(--primary-color);
}

/* 编辑提示条 */
.edit-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--bg-nomarl);
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.edit-banner__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-banner__cancel {
  flex-shrink: 0;
  padding: 2px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--primary-color);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.edit-banner__cancel:hover {
  background: var(--bg-hover);
}

/* 小屏空间窄：只留「正在编辑《标题》」，次要说明藏起来，免得被截成省略号 */
@media (max-width: 767px) {
  .edit-banner__hint {
    display: none;
  }
}

.publishing-title {
  display: flex;
  width: 100%;
  min-height: 24px;
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

.publishing-category {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  padding-right: 30px;
  user-select: none;
}

.category-tag {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 12px;
  font-size: 0.8rem;
  line-height: 1;
  color: var(--text-secondary);
  background: var(--bg-nomarl);
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.category-tag:hover {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.category-tag.active {
  color: #fff;
  background: var(--primary-color);
  border-color: var(--primary-color);
}

/* 「+ 新建话题」：虚线边框跟实心的分类标签区分开，
   一眼能看出它是动作而不是某个可选分类 */
.category-tag--add {
  font-family: inherit;
  color: var(--text-tertiary, var(--text-secondary));
  background: transparent;
  border: 1px dashed var(--border-color);
}

.category-tag--add:hover {
  color: var(--primary-color);
  background: transparent;
  border-color: var(--primary-color);
}

.publishing-content {
  width: 100%;
  height: 100%;
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
  color: var(--text-primary);
  background: transparent;
  min-height: 24px;
  font-family: inherit;
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
  border-radius: 8px;
  font-weight: 500;
}

/* 编辑模式按钮文案是「保存修改」，比「发布」宽，固定 65px 会被挤成两行 */
.publishing.is-editing .comment-submit-button {
  width: auto;
  min-width: 65px;
  padding: 0 14px;
  white-space: nowrap;
}

/* 个人帖子 */
.user-posts {
  margin-top: 40px;
  width: var(--content-with);
  /* 不要 height: 100%：一条帖子都没有时会撑成一个几百像素的空块，
     配合上面 40px 的间距就是一片看不到内容的空白 */
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

@media (max-width: 768px) {
  .home {
    padding: 15px 12px;
  }

  .publishing {
    padding: 12px;
    border-radius: 6px;
    width: 100%;
  }

  /* ⚠️ 这张卡和 .publishing 同宽（--content-with 700px），
     忘在这里改成 100% 就会横向溢出 700px（手机上一半内容在屏幕外），
     而且因为它宽，body 的 scrollWidth 被撑大、连 fixed 元素的 ICB 都跟着变宽。
     之前漏了，靠 mobile 模拟截图看不出来（截图是把 712 宽的布局压进 390 的）。 */
  .muted-notice {
    width: 100%;
  }

  .user-tips {
    margin-left: 0;
  }

  .user-posts {
    margin-top: 20px;
    width: 100%;
  }
}
</style>
