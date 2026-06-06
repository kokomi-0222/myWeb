package com.example.kokomi.mapper;

import com.example.kokomi.entity.PostLike;
import org.apache.ibatis.annotations.Param;

public interface PostLikeMapper {

    // 插入点赞记录
    int insert(PostLike postLike);

    // 删除点赞记录（取消点赞）
    int deleteByPostIdAndUserId(@Param("postId") Long postId, @Param("userId") Long userId);

    // 检查是否已点赞
    int existsByPostIdAndUserId(@Param("postId") Long postId, @Param("userId") Long userId);

    // 统计帖子的点赞数
    int countByPostId(@Param("postId") Long postId);
}