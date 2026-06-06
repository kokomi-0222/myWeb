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

    // 我的帖子
    PageVO<PostDetailVO> getMyPosts(PostPageQueryDTO dto);

    // 指定用户帖子
    PageVO<PostDetailVO> getUserPosts(PostPageQueryDTO dto);

    // 发布帖子
    PostDetailVO createPost(CreatePostDTO dto);

    // 删除帖子
    void deletePost(Long postId);
}
