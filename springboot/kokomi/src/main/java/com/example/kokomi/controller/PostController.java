package com.example.kokomi.controller;

import com.example.kokomi.dto.CreatePostDTO;
import com.example.kokomi.dto.PostPageQueryDTO;
import com.example.kokomi.entity.Post;
import com.example.kokomi.service.PostService;
import com.example.kokomi.vo.PageVO;
import com.example.kokomi.common.Result;
import com.example.kokomi.vo.PostDetailVO;
import lombok.RequiredArgsConstructor;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/post")
@RequiredArgsConstructor
public class PostController {

    private final PostService postService;

    // 首页
    @GetMapping("/getPosts")
    public Result<PageVO<PostDetailVO>> getPosts(@Valid PostPageQueryDTO query) {
        return Result.success(postService.getPostPage(query));
    }

    // 我的帖子
    @GetMapping("/getMyPosts")
    public Result<PageVO<PostDetailVO>> getMyPosts(PostPageQueryDTO dto) {
        return Result.success(postService.getMyPosts(dto));
    }

    // 他人帖子
    @GetMapping("/getUserPosts")
    public Result<PageVO<PostDetailVO>> getUserPosts(PostPageQueryDTO dto) {
        return Result.success(postService.getUserPosts(dto));
    }

    // 全站统计（公开）：首页「社区数据」用，不受当前筛选条件影响
    @GetMapping("/stats")
    public Result<java.util.Map<String, Long>> stats() {
        return Result.success(postService.getStats());
    }

    // 帖子详情
    @GetMapping("/{postId}")
    public Result<PostDetailVO> getPostById(@PathVariable Long postId) {
        return Result.success(postService.getPostById(postId));
    }

    // 发布帖子
    @PostMapping("/createPost")
    public Result<PostDetailVO> createPost(@Valid @RequestBody CreatePostDTO dto) {
        return Result.success(postService.createPost(dto));
    }

    // 删除帖子（Service 层校验：作者本人 或 拥有 post:delete 权限）
    @DeleteMapping("/{postId}")
    public Result<Void> deletePost(@PathVariable Long postId) {
        postService.deletePost(postId);
        return Result.success();
    }

    // 点赞
    @PostMapping("/{postId}/like")
    public Result<Void> like(@PathVariable Long postId) {
        postService.like(postId);
        return Result.success();
    }

    // 取消点赞
    @DeleteMapping("/{postId}/like")
    public Result<Void> unlike(@PathVariable Long postId) {
        postService.unlike(postId);
        return Result.success();
    }

    // 转发（转发数 +1，并给作者发通知）
    @PostMapping("/{postId}/forward")
    public Result<Void> forward(@PathVariable Long postId) {
        postService.forward(postId);
        return Result.success();
    }
}
