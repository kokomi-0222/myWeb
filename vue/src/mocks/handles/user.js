// mocks/handlers/user.js


const mockData = [
  {
    token: "token-kokomi",
    user: {
      id: 1,
      name: "kokomi",
      username: "kokomi",
      nameColor: "#e966b2",
      primaryRole: "moderator",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
      badge: "",
      ornament: "",
      age: 18,
      email: "1063627264@qq.com",
      sex: 0,
      phone: 18579204655,
    },
    roles: [     // 角色表
      'admin',
      'moderator',
      'editor',
      'vip',
      'member',
      'guest'
    ],
    permissions: [
      'post:create',
      'post:edit',
      'post:delete',
      'user:block',
      'comment:report'
    ]
  },
  {
    token: "token-admin",
    user: {
      id: 2,
      name: "admin",
      username: "admin",
      nameColor: "#cf0e0e",
      primaryRole: "admin",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
      badge: "",
      ornament: "",
      age: 18,
      email: "1063627264@qq.com",
      sex: 0,
      phone: 18579204655,
    },
    roles: [
      "admin"
    ],
    permissions: [
      'post:create',
      'post:edit',
      'post:delete',
      'user:block',
      'comment:report'
    ]
  },
  {
    token: "token-张三",
    user: {
      id: 3,
      name: "张三",
      username: "张三",
      nameColor: "#636161",
      primaryRole: "guest",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
      badge: "",
      ornament: "",
      age: 18,
      email: "1063627264@qq.com",
      sex: 0,
      phone: 18579204655,
    },
    roles: [
      "guest"
    ],
    permissions: [
      'comment:report'
    ]
  },
  {
    token: "token-李四",
    user: {
      id: 4,
      name: "李四",
      username: "李四",
      nameColor: "#242323",
      primaryRole: "member",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
      badge: "",
      ornament: "",
      age: 18,
      email: "1063627264@qq.com",
      sex: 0,
      phone: 18579204655,
    },
    roles: [
      "member"
    ],
    permissions: [
      'comment:report',
      'post:create',
      'user:block',
    ]
  },
  {
    token: "token-王五",
    user: {
      id: 5,
      name: "王五",
      username: "王五",
      nameColor: "#ff6699",
      primaryRole: "vip",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
      badge: "",
      ornament: "",
      age: 18,
      email: "1063627264@qq.com",
      sex: 0,
      phone: 18579204655,
    },
    roles: [
      "vip"
    ],
    permissions: [
      'comment:report',
      'post:create',
      'user:block',
    ]
  },
]



const mockToken = {
  'token-kokomi': { username: 'kokomi', sub: 1 },
  'token-admin': { username: 'admin', sub: 2 },
  'token-张三': { username: '张三', sub: 3 },
  'token-李四': { username: '李四', sub: 4 },
  'token-王五': { username: '王五', sub: 5 },
}

export function mockLogin({ data }) {
  const { username, password } = data
  const userItem = mockData.find(item =>
    item.user.username === username //&&item.user.password === password
  );

  if (userItem) {
    return {
      code: "200",
      data: {
        token: userItem.token,
        user: userItem.user,
        roles: userItem.roles,
        permissions: userItem.permissions
      }
    };
  }
  return { code: "401", message: '用户名或密码错误' }
}



export function mockGetUserInfo({ headers, data }) {

  let token = null;
  if (headers?.authorization && headers.authorization.startsWith('Bearer ')) {
    token = headers.authorization.substring(7);
  }
  else if (data?.token) {
    token = data.token;
  }
  if (!token) {
    return {
      code: "401",
      message: "未提供有效凭证"
    };
  }

  if (!mockToken[token]) {
    return { code: "401", message: '无效的 token' };
  }

  const userItem = mockData.find(item =>
    item.user.id === mockToken[token].sub
  );

  if (!userItem) {
    return { code: "401", message: '用户信息缺失' };
  }

  return {
    code: "200",
    data: {
      user: userItem.user,
      roles: userItem.roles,
      permissions: userItem.permissions
    },
    message: 'success'
  };
}


export function mockLogout() {
  return { code: "200", message: '退出成功' }
}

export function mockGetUserPermissions({ headers }) {
  const auth = headers?.authorization;

  if (!auth || !auth.startsWith('Bearer ')) {
    return { code: "401", message: '请先登录' };
  }

  const token = auth.substring(7); // 安全提取

  if (!mockToken[token]) {
    return { code: "401", message: '无效的 token' };
  }

  const userItem = mockData.find(item =>
    item.user.id === mockToken[token].sub
  );


  if (!userItem) {
    return { code: "401", message: '用户信息缺失' };
  }

  return {
    code: "200",
    data: userItem.permissions,
    message: 'success'
  };
}