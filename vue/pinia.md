### 一、什么是 Pinia？
Pinia 是 Vue 官方推荐的状态管理库，由 Vue 核心团队维护，也是 Vuex（Vue 原官方状态管理库）的继任者，
可以看作是 Vuex 5 的升级版。专门为 Vue 2 和 Vue 3 设计，尤其对 Vue 3 的 Composition API 有极佳的适配性。它解决了 Vuex 存在的一些痛点（如繁琐的嵌套模块、TypeScript 支持不友好等），
同时保持了轻量、简洁、易用的特性。
### 二、Pinia 的核心概念
Pinia 是 Vue 生态的新一代状态管理库，它简化了 Vuex 的设计，保留了核心能力，同时适配 Composition API 和 TypeScript，是当前 Vue 项目状态管理的首选方案。Pinia 的核心概念非常简洁，仅包含 Store（仓库）、State（状态）、Getters（计算属性）、Actions（方法） 四个核心部分，抛弃了 Vuex 中 Mutation、Module 等复杂概念，是其 “极简设计” 的核心体现。以下是每个概念的详细解析：
1. Store（仓库）数据容器，每个应用可以有多个Store。
// 定义仓库const useUserStore = defineStore('user', { /* 配置 */ })
// 使用仓库const userStore = useUserStore()
2. State（状态）响应式数据，类似组件的data。
state: () => ({  count: 0,  name: '张三',  list: []})
// 访问
store.count
store.name