package com.example.kokomi.mapper;

import org.apache.ibatis.annotations.Param;

public interface CommentLikeMapper {

    int insert(@Param("commentId") Long commentId, @Param("userId") Long userId);

    // 原子插入（INSERT IGNORE）：遇重复则忽略，返回 0
    int insertIgnore(@Param("commentId") Long commentId, @Param("userId") Long userId);

    int delete(@Param("commentId") Long commentId, @Param("userId") Long userId);

    int existsByCommentIdAndUserId(@Param("commentId") Long commentId, @Param("userId") Long userId);

    int deleteByCommentId(@Param("commentId") Long commentId);
}
