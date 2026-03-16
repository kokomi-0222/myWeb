// mocks/handlers/comment.js

const defaultAvatar = "https://picsum.photos/32/32";

const COMMENTS_BY_POST_ID = {
  "2": [
    {
      id: "p2-c1",
      content: "这条动态太棒了！",
      author: { id: 101, name: "李四", nameColor: "#242323", avatar: defaultAvatar },
      likes: 3,
      createdAt: "2026-01-06T09:00:00Z",
      replies: [],
    },
    {
      id: "p2-c2",
      content: "同感，照片很有氛围。",
      author: { id: 102, name: "王五", nameColor: "#ff6699", avatar: defaultAvatar },
      likes: 0,
      createdAt: "2026-01-06T10:00:00Z",
      replies: [],
    },
  ],
  "3": [
    {
      id: "p3-c1",
      content: "求路线！想去打卡。",
      author: { id: 103, name: "路人甲", nameColor: "#636161", avatar: defaultAvatar },
      likes: 1,
      createdAt: "2026-01-07T08:30:00Z",
      replies: [],
    },
    {
      id: "p3-c2",
      content: "风景绝了，收藏。",
      author: { id: 104, name: "小黑", nameColor: "#cf0e0e", avatar: defaultAvatar },
      likes: 2,
      createdAt: "2026-01-07T08:45:00Z",
      replies: [],
    },
  ],
  "4": [
    {
      id: "p4-c1",
      content: "这张构图很舒服。",
      author: { id: 105, name: "云端", nameColor: "#597ef7", avatar: defaultAvatar },
      likes: 0,
      createdAt: "2026-01-08T12:00:00Z",
      replies: [],
    },
    {
      id: "p4-c2",
      content: "转发给朋友了。",
      author: { id: 106, name: "橘子汽水", nameColor: "#36cfc9", avatar: defaultAvatar },
      likes: 4,
      createdAt: "2026-01-08T12:10:00Z",
      replies: [],
    },
  ],
  "5": [
    {
      id: "p5-c1",
      content: "太美了，想去。",
      author: { id: 107, name: "小林", nameColor: "#eb2f96", avatar: defaultAvatar },
      likes: 0,
      createdAt: "2026-01-09T14:00:00Z",
      replies: [],
    },
    {
      id: "p5-c2",
      content: "这地方在哪？",
      author: { id: 108, name: "张三", nameColor: "#40a9ff", avatar: defaultAvatar },
      likes: 0,
      createdAt: "2026-01-09T14:05:00Z",
      replies: [],
    },
  ],
  "6": [
    {
      id: "p6-c1",
      content: "点赞支持！",
      author: { id: 109, name: "admin", nameColor: "#cf0e0e", avatar: defaultAvatar },
      likes: 1,
      createdAt: "2026-01-10T16:00:00Z",
      replies: [],
    },
    {
      id: "p6-c2",
      content: "不错不错。",
      author: { id: 110, name: "kokomi", nameColor: "#e966b2", avatar: defaultAvatar },
      likes: 0,
      createdAt: "2026-01-10T16:05:00Z",
      replies: [],
    },
  ],
};

export function mockGetComments({ params }) {
  const postId = String(params?.postId ?? "");
  const list = COMMENTS_BY_POST_ID[postId] || [];
  return {
    code: "200",
    data: {
      list,
      total: list.length,
    },
  };
}

