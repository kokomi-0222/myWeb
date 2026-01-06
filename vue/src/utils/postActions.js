// utils/postActions.js
import { usePermission } from "@/utils/usePermission";
/**
 * 所有可用的操作项
 * 每个 action 可以通过 requiredPermission 控制是否显示
 */
export const ALL_ACTIONS = [
  // —— 自己的帖子 ——
  {
    key: 'edit',
    label: '编辑',
    requiredPermission: ({ isOwnPost }) => isOwnPost,
    handler: (post) => {
      console.log('编辑帖子', post.id)
      // 跳转编辑页等
    }
  },
  {
    key: 'delete',
    label: '删除',
    requiredPermission: ({ isOwnPost }) => isOwnPost,
    danger: true,
    handler: (post) => {
      // 使用 Element Plus 弹窗
      import('element-plus').then(({ ElMessageBox }) => {
        ElMessageBox.confirm('确定删除这条帖子？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          // 触发删除事件
          // 注意：handler 不直接 emit，需在组件中绑定
        })
      })
    }
  },

  // —— 他人的帖子 ——
  {
    key: 'report',
    label: '举报',
    requiredPermission: 'post:report', // 需要该权限
    handler: (post) => {
      console.log('举报帖子', post.id)
    }
  },
  {
    key: 'block',
    label: '拉黑作者',
    requiredPermission: 'user:block',
    handler: (post) => {
      console.log('拉黑用户', post.author.id)
    }
  },

  // —— 所有人都能操作 ——
  {
    key: 'share',
    label: '分享',
    requiredPermission: () => true,
    handler: (post) => {
      console.log('分享帖子', post.id)
    }
  },

  // —— 管理员专属 ——
  {
    key: 'adminDelete',
    label: '强制删除',
    requiredPermission: ({ isOwnPost }) => !isOwnPost && usePermission().hasPermission('post:delete'),
    danger: true,
    handler: (post) => {
      import('element-plus').then(({ ElMessageBox }) => {
        ElMessageBox.confirm(`确定以管理员身份删除 ${post.author.name} 的帖子？`, '管理员操作', {
          confirmButtonText: '强制删除',
          cancelButtonText: '取消',
          type: 'error'
        }).then(() => {
          console.log('管理员删除', post.id)
        })
      })
    }
  }
]
