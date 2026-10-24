package com.example.kokomi.mapper;

import com.example.kokomi.entity.PostMedia;
import org.apache.ibatis.annotations.Param;
import java.util.Collection;
import java.util.List;

public interface PostMediaMapper {
    List<PostMedia> selectByPostId(@Param("postId") Long postId);

    // 批量查多个帖子的媒体，列表页用（消除 N+1）
    List<PostMedia> selectByPostIds(@Param("postIds") Collection<Long> postIds);

    int insertBatch(@Param("mediaList") List<PostMedia> mediaList);

    int deleteByPostId(@Param("postId") Long postId);
}
