package com.example.kokomi.mapper;

import org.apache.ibatis.annotations.Param;
import java.util.Collection;
import java.util.List;

public interface CommentLikeMapper {

    int insert(@Param("commentId") Long commentId, @Param("userId") Long userId);

    // 原子插入（INSERT IGNORE）：遇重复则忽略，返回 0
    int insertIgnore(@Param("commentId") Long commentId, @Param("userId") Long userId);

    int delete(@Param("commentId") Long commentId, @Param("userId") Long userId);

    int existsByCommentIdAndUserId(@Param("commentId") Long commentId, @Param("userId") Long userId);

    int deleteByCommentId(@Param("commentId") Long commentId);

    // 批量查「指定用户在这些评论里点过赞的 commentId」，评论列表用（消除 N+1）
    List<Long> selectLikedCommentIds(@Param("userId") Long userId,
                                     @Param("commentIds") Collection<Long> commentIds);
}
