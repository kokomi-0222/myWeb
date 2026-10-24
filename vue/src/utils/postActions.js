// utils/postActions.js
import { usePermission } from "@/utils/usePermission";
import { copyPostLink } from "@/utils/sharePost";
/**
 * 所有可用的操作项
 * 每个 action 可以通过 requiredPermission 控制是否显示
 */
export const ALL_ACTIONS = [
  // —— 自己的帖子 ——
  {
    key: 'edit',
    label: '编辑',
    // 自己的帖子都能改；改别人的需要 post:edit（版主 / 编辑 / 管理员）。
    // 这只是「菜单显不显示」，真正的权限判断在后端 updatePost 里。
    requiredPermission: ({ isOwnPost }) =>
      isOwnPost || usePermission().hasPermission('post:edit'),
    // 跳转逻辑在 PostCard.moreActionsHandle 里拦截（需要 router 实例，
    // 放这里会形成 utils ⇄ router 的循环依赖）。
    handler: () => {}
  },
  {
    key: 'delete',
    label: '删除',
    requiredPermission: ({ isOwnPost }) => isOwnPost,
    danger: true,
    handler: () => {}
  },

  // —— 他人的帖子 ——
  {
    key: 'report',
    label: '举报',
    // 举报是每个登录用户的权利，不是特权，所以不挂权限码。
    // 旧版写的是 requiredPermission: 'post:report'，但权限表里根本没有这个码，
    // 结果就是这一项永远不会出现在菜单里。这里只判断「不是自己的帖子」，
    // 未登录时点击会弹登录框（见 PostCard.moreActionsHandle）。
    requiredPermission: ({ isOwnPost }) => !isOwnPost,
    handler: () => {}
  },
  {
    key: 'block',
    label: '拉黑作者',
    requiredPermission: 'user:block',
    handler: () => {
      // 待实现：拉黑作者
    }
  },

  // —— 所有人都能操作 ——
  {
    key: 'share',
    label: '分享',
    requiredPermission: () => true,
    // 分享的唯一动作：把帖子链接复制到剪贴板（见 utils/sharePost.js）。
    // PostCard 会提前拦截 key === 'share'，这里保持同样的实现，
    // 保证任何直接调用 handler 的地方行为一致。
    handler: (post) => copyPostLink(post)
  },

  // —— 管理员专属 ——
  {
    key: 'adminDelete',
    label: '强制删除',
    requiredPermission: ({ isOwnPost }) => !isOwnPost && usePermission().hasPermission('post:delete'),
    danger: true,
    handler: () => {}
  }
]
