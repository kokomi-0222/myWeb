// mocks/handlers/comment.js

const defaultAvatar = "https://picsum.photos/32/32";

const makeReply = ({
  id,
  content,
  author,
  createdAt,
  likes = 0,
  isHot = false,
  replyTo = null,
}) => ({
  id,
  content,
  author: { avatar: defaultAvatar, ...author },
  createdAt,
  likes,
  isHot,
  replyTo,
});

const COMMENTS_BY_POST_ID = {
  "2": [
    {
      id: "p2-c1",
      content: "这条动态太棒了！",
      author: { id: 101, name: "李四", nameColor: "#242323", avatar: defaultAvatar },
      likes: 3,
      createdAt: "2026-01-06T09:00:00Z",
      replies: [
        makeReply({
          id: "p2-c1-r1",
          content: "确实，拍得很有感觉。",
          author: { id: 201, name: "云端", nameColor: "#597ef7" },
          createdAt: "2026-01-06T09:10:00Z",
          likes: 8,
          isHot: true,
        }),
        makeReply({
          id: "p2-c1-r2",
          content: "我也想去爬这座山！",
          author: { id: 202, name: "小林", nameColor: "#eb2f96" },
          createdAt: "2026-01-06T09:12:00Z",
          likes: 6,
          isHot: true,
          replyTo: "云端",
        }),
        makeReply({
          id: "p2-c1-r3",
          content: "求定位。",
          author: { id: 203, name: "路人甲", nameColor: "#636161" },
          createdAt: "2026-01-06T09:15:00Z",
          likes: 0,
          isHot: false,
          replyTo: null,
        }),
      ],
    },
    {
      id: "p2-c2",
      content: "同感，照片很有氛围。",
      author: { id: 102, name: "王五", nameColor: "#ff6699", avatar: defaultAvatar },
      likes: 0,
      createdAt: "2026-01-06T10:00:00Z",
      // 15 条回复：用于测试“回复汇总 + 分页 + 收起/展开”
      replies: [
        makeReply({
          id: "p2-c2-r1",
          content: "这张光影太绝了。",
          author: { id: 204, name: "橘子汽水", nameColor: "#36cfc9" },
          createdAt: "2026-01-06T10:02:00Z",
          likes: 12,
          isHot: true,
        }),
        makeReply({
          id: "p2-c2-r2",
          content: "同款滤镜求教程。",
          author: { id: 205, name: "admin", nameColor: "#cf0e0e" },
          createdAt: "2026-01-06T10:03:00Z",
          likes: 9,
          isHot: true,
          replyTo: "橘子汽水",
        }),
        ...Array.from({ length: 13 }).map((_, idx) =>
          makeReply({
            id: `p2-c2-r-extra-${idx + 1}`,
            content: `路人回复 ${idx + 1}`,
            author: {
              id: 300 + idx + 1,
              name: `用户${idx + 1}`,
              nameColor: "#8c8c8c",
            },
            createdAt: "2026-01-06T10:05:00Z",
            likes: idx % 3 === 0 ? 1 : 0,
            isHot: false,
            // 仅用于“回复回复”的展示测试：不应指向楼主(王五)
            replyTo: idx % 4 === 0 ? "橘子汽水" : null,
          })
        ),
      ],
    },
  ],
  "3": [
    {
      id: "p3-c1",
      content: "求路线！想去打卡。",
      author: { id: 103, name: "路人甲", nameColor: "#636161", avatar: defaultAvatar },
      likes: 1,
      createdAt: "2026-01-07T08:30:00Z",
      replies: [
        makeReply({
          id: "p3-c1-r1",
          content: "同求，我也想去。",
          author: { id: 206, name: "张三", nameColor: "#40a9ff" },
          createdAt: "2026-01-07T08:40:00Z",
          likes: 2,
          isHot: true,
          replyTo: null,
        }),
      ],
    },
    {
      id: "p3-c2",
      content: "风景绝了，收藏。",
      author: { id: 104, name: "小黑", nameColor: "#cf0e0e", avatar: defaultAvatar },
      likes: 2,
      createdAt: "2026-01-07T08:45:00Z",
      replies: [
        makeReply({
          id: "p3-c2-r1",
          content: "收藏+1。",
          author: { id: 207, name: "李四", nameColor: "#242323" },
          createdAt: "2026-01-07T09:00:00Z",
          likes: 0,
          isHot: false,
          replyTo: null,
        }),
      ],
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
      replies: [
        makeReply({
          id: "p4-c2-r1",
          content: "我朋友也喜欢这种风格。",
          author: { id: 208, name: "小林", nameColor: "#eb2f96" },
          createdAt: "2026-01-08T12:20:00Z",
          likes: 0,
          isHot: false,
          replyTo: "橘子汽水",
        }),
      ],
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
      replies: [
        makeReply({
          id: "p5-c2-r1",
          content: "蹲一个地址。",
          author: { id: 209, name: "云端", nameColor: "#597ef7" },
          createdAt: "2026-01-09T14:12:00Z",
          likes: 1,
          isHot: true,
          replyTo: null,
        }),
        makeReply({
          id: "p5-c2-r2",
          content: "应该是某某景区？",
          author: { id: 210, name: "路人甲", nameColor: "#636161" },
          createdAt: "2026-01-09T14:15:00Z",
          likes: 0,
          isHot: false,
          replyTo: "云端",
        }),
      ],
    },
  ],
  "6": [
    {
      id: "p6-c1",
      content: "点赞支持！",
      author: { id: 109, name: "admin", nameColor: "#cf0e0e", avatar: defaultAvatar },
      likes: 1,
      createdAt: "2026-01-10T16:00:00Z",
      replies: [
        makeReply({
          id: "p6-c1-r1",
          content: "同意，支持一下。",
          author: { id: 211, name: "kokomi", nameColor: "#e966b2" },
          createdAt: "2026-01-10T16:10:00Z",
          likes: 3,
          isHot: true,
          replyTo: null,
        }),
      ],
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

