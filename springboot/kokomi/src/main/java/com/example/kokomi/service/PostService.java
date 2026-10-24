package com.example.kokomi.service;

import com.example.kokomi.dto.CreatePostDTO;
import com.example.kokomi.dto.PostPageQueryDTO;
import com.example.kokomi.entity.Post;
import com.example.kokomi.vo.PageVO;
import com.example.kokomi.vo.PostDetailVO;

public interface PostService {
    /**
     *分页获取帖子列表
     * @param dto
     * @return
     */
    PageVO<PostDetailVO> getPostPage(PostPageQueryDTO dto);

    // 根据ID获取单个帖子
    PostDetailVO getPostById(Long id);

    // 我的帖子
    PageVO<PostDetailVO> getMyPosts(PostPageQueryDTO dto);

    // 指定用户帖子
    PageVO<PostDetailVO> getUserPosts(PostPageQueryDTO dto);

    // 发布帖子
    PostDetailVO createPost(CreatePostDTO dto);

    // 编辑帖子（作者本人，或拥有 post:edit 权限的人）
    PostDetailVO updatePost(Long postId, CreatePostDTO dto);

    // 删除帖子
    void deletePost(Long postId);

    /**
     * 后台举报处理专用：不做作者 / 权限校验，直接删除（幂等，帖子已不在则静默返回）。
     * <p>
     * 调用方必须已经用 {@code user:manage} 校验过身份。单独开这个方法而不是复用
     * {@link #deletePost}，是因为处理举报的管理员角色不一定带 {@code post:delete}
     * （比如自建了一个只勾了「后台管理」的角色），复用会莫名 403。
     */
    void deletePostByAdmin(Long postId);

    // 点赞
    void like(Long postId);

    // 取消点赞
    void unlike(Long postId);

    // 转发：转发数 +1 并通知作者（允许同一用户多次转发）
    void forward(Long postId);

    // 全站统计：帖子数 / 用户数 / 评论数
    java.util.Map<String, Long> getStats();
}
