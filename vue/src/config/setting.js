
const setting = {

    mock:true,
    //app名称
    appName: 'my-web-app',
    //接口地址
    baseURL: 'http://localhost:9090',
    //配后端数据的接收方式application/json;charset=UTF-8或者application/x-www-form-urlencoded;charset=UTF-8
    contentType: 'application/json;charset=UTF-8',
    //消息框消失时间
    messageDuration: 3000,
    //最长请求时间
    requestTimeout: 15000,
    //操作正常code，支持String、Array、int多种类型
    successCode: ['200', '0'],
    //登录失效code
    invalidCode: '402',
    //无权限code
    noPermissionCode: '401',


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
    loginRSA: false,
    //是否分页显示
    showPagination: true,
    //一次加载多少个帖子
    postsPageSize: 3,
}

export default setting