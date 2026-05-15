package com.example.kokomi.service.impl;


import com.example.kokomi.dto.PostPageQueryDTO;
import com.example.kokomi.entity.Post;
import com.example.kokomi.entity.PostMedia;
import com.example.kokomi.entity.User;
import com.example.kokomi.mapper.PostMapper;
import com.example.kokomi.mapper.PostMediaMapper;
import com.example.kokomi.mapper.PostTagMapper;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.service.PostService;
import com.example.kokomi.vo.PageVO;
import com.example.kokomi.vo.PostAuthorVO;
import com.example.kokomi.vo.PostDetailVO;
import com.example.kokomi.vo.PostMediaVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
@Service
@RequiredArgsConstructor
public class PostServiceImpl implements PostService {

    private final PostMapper postMapper;
    private final PostMediaMapper postMediaMapper;
    private final PostTagMapper postTagMapper;
    private final UserMapper userMapper;

    @Override
    public PageVO<PostDetailVO> getPostPage(PostPageQueryDTO dto) {
        int offset = (dto.getPageNum() - 1) * dto.getPageSize();

        // 查询帖子基础信息 + 作者信息
        List<Post> postList  = postMapper.selectPostPage(dto, offset);

        Long total  = postMapper.selectPostCount(dto);

        // 给每个帖子 装 图片 + 标签
        List<PostDetailVO> voList = new ArrayList<>();
        for (Post post : postList) {
            PostDetailVO vo = new PostDetailVO();
            vo.setId(post.getId());
            vo.setTitle(post.getTitle());
            vo.setContent(post.getContent());
            vo.setCreatedAt(post.getCreatedAt());
            vo.setViews(post.getViews());
            vo.setLikes(post.getLikes());
            vo.setCommentsCount(post.getComments());
            vo.setForward(post.getForwards());

            // 查询作者（实体 → VO）
            User user = userMapper.selectById(post.getUserId());
            PostAuthorVO authorVO = new PostAuthorVO();
            authorVO.setId(user.getId());
            authorVO.setName(user.getName());
            authorVO.setNameColor(user.getNameColor());
            authorVO.setPrimaryRole(user.getPrimaryRole());
            authorVO.setAvatar(user.getAvatar());
            authorVO.setBadge(user.getBadge());
            authorVO.setOrnament(user.getOrnament());
            vo.setAuthor(authorVO);

            // 媒体实体 → VO
            List<PostMedia> mediaList = postMediaMapper.selectByPostId(post.getId());
            List<PostMediaVO> mediaVOList = new ArrayList<>();
            for (PostMedia m : mediaList) {
                PostMediaVO mv = new PostMediaVO();
                mv.setId(String.valueOf(m.getId()));
                mv.setThumbnailUrl(m.getThumbnailUrl());
                mv.setPreviewUrl(m.getPreviewUrl());
                mv.setRowUrl(m.getRawUrl());
                mv.setType(m.getType());
                mv.setWidth(m.getWidth());
                mv.setHeight(m.getHeight());
                mv.setSize(m.getSize());
                mv.setAlt(m.getAlt());
                mv.setOrientation(1);
                mv.setFormat(m.getFormat());
                mv.setIsAnimated(m.getIsAnimated() == 1);
                mediaVOList.add(mv);
            }
            vo.setMedia(mediaVOList);

            // 标签
            vo.setTag(postTagMapper.selectTagNamesByPostId(post.getId()));
            vo.setLikedByMe(false);
            voList.add(vo);
        }

        return PageVO.build(voList, total, dto.getPageNum(), dto.getPageSize());
    }
}