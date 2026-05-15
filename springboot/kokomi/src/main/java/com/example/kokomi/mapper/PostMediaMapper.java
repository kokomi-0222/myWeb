package com.example.kokomi.mapper;

import com.example.kokomi.entity.PostMedia;
import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface PostMediaMapper {
    List<PostMedia> selectByPostId(@Param("postId") Long postId);
}