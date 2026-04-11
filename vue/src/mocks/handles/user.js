// mocks/handlers/user.js


const mockData = [
  {
    token: "token-kokomi",
    user: {
      id: 1,
      name: "kokomi",
      username: "kokomi_00001",
      nameColor: "#e966b2",
      primaryRole: "moderator",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
      badge: "",
      ornament: "",
      birthday: "2010-01-01",
      email: "1063627264@qq.com",
      gender: "female",
      phone: "13879204655",
      signature: "菲比啾比",
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
      username: "kokomi_00002",
      nameColor: "#cf0e0e",
      primaryRole: "admin",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
      badge: "",
      ornament: "",
      birthday: "2010-01-01",
      email: "1233@qq.com",
      signature: "菲比啾比",
      gender:"female",
      phone: "",
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
      username: "kokomi_00003",
      nameColor: "#636161",
      primaryRole: "guest",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
      badge: "",
      ornament: "",
      birthday: "2010-01-01",
      email: "233@qq.com",
      gender:"female",
      phone: "",
      signature: "菲比啾比",
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
      username: "kokomi_00004",
      nameColor: "#242323",
      primaryRole: "member",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
      badge: "",
      ornament: "",
      birthday: "2010-01-01",
      email: "433@qq.com",
      gender:"female",
      phone: "",
      signature: "菲比啾比",
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
      username: "kokomi_00005",
      nameColor: "#ff6699",
      primaryRole: "vip",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
      badge: "",
      ornament: "",
      birthday: "2010-01-01",
      email: "545@qq.com",
      gender: "female",
      phone: "",
      signature: "菲比啾比",
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
  {
    token: "token-AAA",
    user: {
      id: 6,
      name: "AAA",
      username: "kokomi_00006",
      nameColor: "#ff6699",
      primaryRole: "vip",
      avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href,
      badge: "",
      ornament: "",
      birthday: "2010-01-01",
      email: "",
      gender: "female",
      phone: "13377778888",
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
  'token-kokomi': { username: 'kokomi_00001', sub: 1 },
  'token-admin': { username: 'kokomi_00002', sub: 2 },
  'token-张三': { username: 'kokomi_00003', sub: 3 },
  'token-李四': { username: 'kokomi_00004', sub: 4 },
  'token-王五': { username: 'kokomi_00005', sub: 5 },
  'token-AAA': { username: 'kokomi_00006', sub: 6 },
}
export function mockLogin({ data }) {
  // 注意：现在前端传的是 account + password
  const { account, password } = data;
  console.log('登录：', account, password);
  // 没传账号直接返回错误
  if (!account || !password) {
    return { code: "401", message: '用户名/手机号/邮箱或密码错误' };
  }

  // 去 mockData 里匹配：用户名 OR 手机号 OR 邮箱
  const userItem = mockData.find(item => {
    const user = item.user;
    return (
      user.username === account ||    // 用户名登录
      user.phone === account ||       // 手机号登录
      user.email === account          // 邮箱登录
    );
  });

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

  return { code: "401", message: '用户名/手机号/邮箱或密码错误' };
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