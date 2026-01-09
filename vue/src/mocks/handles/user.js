// mocks/handlers/user.js


const mockData = [
  {
    token: "token-kokomi",
    user: {
      id: 1,
      name: "kokomi",
      username: "kokomi",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
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
    token: "token-admin",
    user: {
      id: 2,
      name: "admin",
      username: "admin",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
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
]



const mockToken = {
  'token-kokomi': { username: 'kokomi', sub: 1 },
  'token-admin': { username: 'admin', sub: 2 }
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