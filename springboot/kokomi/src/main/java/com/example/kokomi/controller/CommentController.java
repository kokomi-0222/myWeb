package com.example.kokomi.controller;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.kokomi.common.Result;
import com.example.kokomi.common.ResultCode;
import com.example.kokomi.dto.CreateCommentDTO;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.service.CommentService;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.vo.CommentVO;
import com.example.kokomi.vo.PageVO;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/comments")
@RequiredArgsConstructor
public class CommentController {

    private final CommentService commentService;

    // 获取评论列表（公开，全部）
    @GetMapping
    public Result<List<CommentVO>> getComments(@RequestParam Long postId) {
        return Result.success(commentService.getCommentsByPostId(postId));
    }

    // 分页获取评论列表（公开）
    @GetMapping("/page")
    public Result<PageVO<CommentVO>> getCommentsPaginated(@RequestParam Long postId,
                                                           @RequestParam(defaultValue = "1") int pageNum,
                                                           @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(commentService.getCommentsByPostIdPaginated(postId, pageNum, pageSize));
    }

    // 发表评论（需登录）
    @PostMapping
    public Result<CommentVO> createComment(@RequestParam Long postId,
                                           @RequestBody CreateCommentDTO dto) {
        requireLogin();
        return Result.success(commentService.createComment(postId, dto.getContent(),
                dto.getParentId(), dto.getReplyTo(), dto.getImage()));
    }

    // 删除评论（需登录）
    @DeleteMapping("/{id}")
    public Result<Void> deleteComment(@PathVariable Long id) {
        requireLogin();
        commentService.deleteComment(id);
        return Result.success();
    }

    // 点赞评论
    @PostMapping("/{id}/like")
    public Result<Void> likeComment(@PathVariable Long id) {
        requireLogin();
        commentService.likeComment(id);
        return Result.success();
    }

    // 取消点赞评论
    @DeleteMapping("/{id}/like")
    public Result<Void> unlikeComment(@PathVariable Long id) {
        requireLogin();
        commentService.unlikeComment(id);
        return Result.success();
    }

    private void requireLogin() {
        if (LoginUserHolder.getUserId() == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "请先登录");
        }
    }
}