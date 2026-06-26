package com.example.kokomi.mapper;

import com.example.kokomi.entity.Comment;
import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface CommentMapper {

    // 查询帖子的顶级评论（parent_id IS NULL）
    List<Comment> selectTopLevelByPostId(@Param("postId") Long postId);

    // 查询某条评论的所有子回复
    List<Comment> selectRepliesByParentId(@Param("parentId") Long parentId);

    // 插入评论
    int insert(Comment comment);

    // 根据ID查询
    Comment selectById(@Param("id") Long id);

    // 删除评论
    int deleteById(@Param("id") Long id);

    // 删除帖子的所有评论
    int deleteByPostId(@Param("postId") Long postId);

    // 查询帖子的所有评论（含子回复），用于删除前清理图片文件
    List<Comment> selectByPostId(@Param("postId") Long postId);

    // 分页查询顶级评论
    List<Comment> selectTopLevelByPostIdPaginated(@Param("postId") Long postId,
                                                   @Param("offset") int offset,
                                                   @Param("limit") int limit);

    // 统计顶级评论数
    int countTopLevelByPostId(@Param("postId") Long postId);

    // 点赞数 +1
    int incrementLikes(@Param("id") Long id);

    // 点赞数 -1
    int decrementLikes(@Param("id") Long id);
}