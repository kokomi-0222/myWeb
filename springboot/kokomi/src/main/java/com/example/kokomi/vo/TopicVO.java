package com.example.kokomi.vo;

import lombok.Data;

/**
 * 话题视图对象，话题栏 / 发布框分类选择用。
 * <p>
 * {@code count} 是该话题下的帖子数，由 {@code GroupBy} 统计得来；
 * 站长新建、还没人发过的话题 count 为 0，同样要返回（否则刚建完看不见）。
 */
@Data
public class TopicVO {
    private Long id;
    private String name;
    private String value;
    private String color;
    private Integer sort;
    private Long count;
    /**
     * 是否已在 topic 表登记。
     * 后台话题管理用：false 表示这个类型只存在于老帖子的 post.type 里、
     * 话题表里没有对应记录（历史脏数据），因此不能编辑 / 删除。
     */
    private Boolean registered;
}
