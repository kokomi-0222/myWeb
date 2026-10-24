package com.example.kokomi.mapper;

import com.example.kokomi.entity.PostTag;
import org.apache.ibatis.annotations.Param;
import java.util.Collection;
import java.util.List;

public interface PostTagMapper {
    List<String> selectTagNamesByPostId(@Param("postId") Long postId);

    // 批量查多个帖子的标签，列表页用（消除 N+1）
    List<PostTag> selectByPostIds(@Param("postIds") Collection<Long> postIds);

    int insertBatch(@Param("postId") Long postId, @Param("tags") List<String> tags);

    int deleteByPostId(@Param("postId") Long postId);
}
