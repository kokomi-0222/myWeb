
const setting = {

    mock:false,
    //app名称
    appName: 'my-web-app',
    //接口地址
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
    //配后端数据的接收方式application/json;charset=UTF-8或者application/x-www-form-urlencoded;charset=UTF-8
    contentType: 'application/json;charset=UTF-8',
    //消息框消失时间
    messageDuration: 3000,
    //最长请求时间
    requestTimeout: 15000,
    //操作正常code，支持String、Array、int多种类型
    successCode: [200, 0, "200", "0"],
    //登录失效code
    invalidCode: 401,
    //无权限code
    noPermissionCode: 402,
    //被禁言 code（能登录、不能发内容）。前端收到它要顺手刷新一次用户状态，
    // 把发布框换成「你已被禁言」的提示条，而不是让人一直点发布一直失败。
    mutedCode: 506,
    //游客 / 没绑邮箱 code：能登录、能浏览，但评论、回复、举报会被拦。
    // 前端收到它要把「绑定邮箱」弹窗直接叫出来，而不是只弹一条红色错误。
    unverifiedCode: 507,
    //没开通发帖权 code：账号能评论、能登录，但缺 post:create（自己解决不了）。
    // 和 507 分开处理 —— 507 用户去绑个邮箱就好了，这个只能等站长开通，
    // 所以既不该弹绑定弹窗，也不该给一个点了没用的按钮。
    // 注意默认矩阵里会员和普通用户都能发帖，这个码平时基本不会出现。
    needVipCode: 509,


    //不经过token校验的路由
    routesWhiteList: ['/user/login', '/user/register', '/404', '/401'],
    //token名称
    tokenName: 'accessToken',
    //token存储位置localStorage sessionStorage
    storage: 'localStorage',
    //token名称
    tokenTableName: 'token',
    //是否开启登录拦截
    loginInterception: true,
    //是否开启登录RSA加密
    loginRSA: true,
    //是否分页显示
    showPagination: false,
    //一次加载多少个帖子
    postsPageSize: 3,
    //图片大小限制
    //⚠️ 这个值必须和服务器 Nginx 的 client_max_body_size 对齐（当前服务器配的是 2m）。
    //   前端限制得比 Nginx 宽松时，大图会先被 Nginx 拦下来返回 413，页面只会显示「网络异常」。
    //   multipart 编码本身还有几百字节开销，所以卡在 2MB 减 8KB，避免边界值刚好超限。
    //   改这里时记得同步 Nginx：client_max_body_size 要比 imageSize 大一点。
    imageSize: 2 * 1024 * 1024 - 8192,
    //与 imageSize 对应的提示文案，改上限时一起改
    imageSizeText: "2MB",
    //评论最大长度
    commentMaxLength: 500,
    //帖子标题最大长度
    postTitleMaxLength: 20,
    //帖子最大长度（与后端 CreatePostDTO 的 @Size 保持一致）
    // 数据库 post.content 是 TEXT（65535 字节，中文约 2.1 万字），这里留了一倍余量
    postMaxLength: 10000,
    //个性签名最大长度
    signatureMaxLength: 100,
    //昵称最大长度
    nameMaxLength: 12,
}

export default setting