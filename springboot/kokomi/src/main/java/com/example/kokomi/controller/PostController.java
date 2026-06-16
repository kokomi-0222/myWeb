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
    public Result<PageVO<PostDetailVO>> getPosts(PostPageQueryDTO query) {
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

    // 删除帖子
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
}
