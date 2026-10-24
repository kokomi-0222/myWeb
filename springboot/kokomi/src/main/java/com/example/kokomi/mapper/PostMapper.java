package com.example.kokomi.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Param;

import com.example.kokomi.dto.PostPageQueryDTO;
import com.example.kokomi.entity.Post;

public interface PostMapper {

    // 分页查询帖子
    List<Post> selectPostPage(@Param("query") PostPageQueryDTO query,
                              @Param("offset") Integer offset);

    // 查询总数
    Long selectPostCount(@Param("query") PostPageQueryDTO query);

    // 插入帖子，返回影响行数，主键回填到post.id
    int insert(Post post);

    // 根据ID查询帖子
    Post selectById(@Param("id") Long id);

    // 根据ID删除帖子
    int deleteById(@Param("id") Long id);

    // 点赞数 +1
    int incrementLikes(@Param("id") Long id);

    // 点赞数 -1
    int decrementLikes(@Param("id") Long id);

    // 评论数 +1
    int incrementComments(@Param("id") Long id);

    // 评论数 -1
    int decrementComments(@Param("id") Long id);

    // 转发数 +1
    int incrementForwards(@Param("id") Long id);

    // 浏览量 +1
    int incrementViews(@Param("id") Long id);

    // 全站帖子总数（不带任何筛选条件）
    Long countAll();

    // 某个用户发布的帖子数
    Long countByUserId(@Param("userId") Long userId);
}
