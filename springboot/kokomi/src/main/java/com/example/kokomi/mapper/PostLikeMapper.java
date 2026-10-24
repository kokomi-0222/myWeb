package com.example.kokomi.mapper;

import com.example.kokomi.entity.PostLike;
import org.apache.ibatis.annotations.Param;
import java.util.Collection;
import java.util.List;

public interface PostLikeMapper {

    // 插入点赞记录
    int insert(PostLike postLike);

    // 原子插入（INSERT IGNORE）：遇重复则忽略，返回 0
    int insertIgnore(PostLike postLike);

    // 删除点赞记录（取消点赞）
    int deleteByPostIdAndUserId(@Param("postId") Long postId, @Param("userId") Long userId);

    // 检查是否已点赞
    int existsByPostIdAndUserId(@Param("postId") Long postId, @Param("userId") Long userId);

    // 统计帖子的点赞数
    int countByPostId(@Param("postId") Long postId);

    // 批量查「指定用户在这些帖子里点过赞的 postId」，列表页用（消除 N+1）
    List<Long> selectLikedPostIds(@Param("userId") Long userId,
                                 @Param("postIds") Collection<Long> postIds);
}