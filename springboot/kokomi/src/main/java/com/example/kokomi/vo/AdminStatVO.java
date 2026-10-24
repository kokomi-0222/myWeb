package com.example.kokomi.vo;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 后台概览页的数据。
 * <p>
 * 一次请求把卡片数字和两块「最近」列表都带回去，避免首页开好几个接口。
 */
@Data
public class AdminStatVO {

    private Long userCount;
    private Long postCount;
    private Long commentCount;
    private Long topicCount;

    /** 今日新增：按 created_at >= 今天 00:00 统计 */
    private Long todayUserCount;
    private Long todayPostCount;
    private Long todayCommentCount;

    /** 最近注册的用户（最多 5 条） */
    private List<RecentUser> recentUsers;

    /** 最新发布的帖子（最多 5 条） */
    private List<RecentPost> recentPosts;

    @Data
    public static class RecentUser {
        private Long id;
        private String name;
        private String username;
        private String avatar;
        private String primaryRole;
        private LocalDateTime createTime;
    }

    @Data
    public static class RecentPost {
        private Long id;
        private String title;
        private String type;
        private String authorName;
        private LocalDateTime createTime;
        private Integer views;
        private Integer likes;
    }
}
