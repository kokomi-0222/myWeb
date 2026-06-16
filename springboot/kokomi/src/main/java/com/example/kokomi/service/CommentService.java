package com.example.kokomi.service;

import com.example.kokomi.vo.CommentVO;
import com.example.kokomi.vo.PageVO;
import java.util.List;

public interface CommentService {

    // 获取帖子的评论列表（全部）
    List<CommentVO> getCommentsByPostId(Long postId);

    // 分页获取评论列表
    PageVO<CommentVO> getCommentsByPostIdPaginated(Long postId, int pageNum, int pageSize);

    // 发表评论（顶级或回复）
    CommentVO createComment(Long postId, String content, Long parentId, String replyTo, String image);

    // 删除评论
    void deleteComment(Long commentId);

    // 点赞评论
    void likeComment(Long commentId);

    // 取消点赞评论
    void unlikeComment(Long commentId);
}