package com.example.kokomi.service.impl;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.entity.Comment;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.CommentLikeMapper;
import com.example.kokomi.mapper.CommentMapper;
import com.example.kokomi.mapper.PostMapper;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.mapper.UserRoleMapper;
import com.example.kokomi.service.CommentService;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.vo.CommentAuthorVO;
import com.example.kokomi.vo.CommentVO;
import com.example.kokomi.vo.PageVO;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CommentServiceImpl implements CommentService {

    private final CommentMapper commentMapper;
    private final CommentLikeMapper commentLikeMapper;
    private final PostMapper postMapper;
    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;

    @Value("${app.upload-path}")
    private String uploadPath;

    @Value("${app.base-url}")
    private String baseUrl;

    @Override
    public List<CommentVO> getCommentsByPostId(Long postId) {
        List<Comment> topLevel = commentMapper.selectTopLevelByPostId(postId);
        List<CommentVO> result = new ArrayList<>();

        for (Comment comment : topLevel) {
            CommentVO vo = convertToVO(comment);
            // 加载子回复
            List<Comment> replies = commentMapper.selectRepliesByParentId(comment.getId());
            List<CommentVO> replyVOs = new ArrayList<>();
            for (Comment reply : replies) {
                replyVOs.add(convertToVO(reply));
            }
            vo.setReplies(replyVOs);
            result.add(vo);
        }
        return result;
    }

    @Override
    public PageVO<CommentVO> getCommentsByPostIdPaginated(Long postId, int pageNum, int pageSize) {
        int offset = (pageNum - 1) * pageSize;
        List<Comment> topLevel = commentMapper.selectTopLevelByPostIdPaginated(postId, offset, pageSize);
        int total = commentMapper.countTopLevelByPostId(postId);

        List<CommentVO> voList = new ArrayList<>();
        for (Comment comment : topLevel) {
            CommentVO vo = convertToVO(comment);
            List<Comment> replies = commentMapper.selectRepliesByParentId(comment.getId());
            List<CommentVO> replyVOs = new ArrayList<>();
            for (Comment reply : replies) {
                replyVOs.add(convertToVO(reply));
            }
            vo.setReplies(replyVOs);
            voList.add(vo);
        }
        return PageVO.build(voList, (long) total, pageNum, pageSize);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public CommentVO createComment(Long postId, String content, Long parentId, String replyTo, String image) {
        Long userId = LoginUserHolder.getUserId();

        if (postMapper.selectById(postId) == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }
        if ((content == null || content.trim().isEmpty()) && (image == null || image.isEmpty())) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "评论内容不能为空");
        }

        Comment comment = new Comment();
        comment.setPostId(postId);
        comment.setUserId(userId);
        comment.setContent(content != null ? content.trim() : "");
        comment.setParentId(parentId);
        comment.setReplyTo(replyTo);
        // 仅顶级评论可带图片，将图片从 temp 移到 images
        if (parentId == null && image != null && !image.isEmpty()) {
            comment.setImage(moveImageToPermanent(image));
        }

        commentMapper.insert(comment);

        // 重新查询获取完整记录（包括 createdAt）
        comment = commentMapper.selectById(comment.getId());

        // 只有顶级评论才增加帖子评论数
        if (parentId == null) {
            postMapper.incrementComments(postId);
        }

        return convertToVO(comment);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void likeComment(Long commentId) {
        Long userId = LoginUserHolder.getUserId();

        Comment comment = commentMapper.selectById(commentId);
        if (comment == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "评论不存在");
        }

        // 检查是否已点赞
        if (commentLikeMapper.existsByCommentIdAndUserId(commentId, userId) > 0) {
            return; // 已点赞，幂等处理
        }

        commentLikeMapper.insert(commentId, userId);
        commentMapper.incrementLikes(commentId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void unlikeComment(Long commentId) {
        Long userId = LoginUserHolder.getUserId();

        Comment comment = commentMapper.selectById(commentId);
        if (comment == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "评论不存在");
        }

        // 检查是否已点赞
        if (commentLikeMapper.existsByCommentIdAndUserId(commentId, userId) == 0) {
            return; // 未点赞，幂等处理
        }

        commentLikeMapper.delete(commentId, userId);
        commentMapper.decrementLikes(commentId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteComment(Long commentId) {
        Long currentUserId = LoginUserHolder.getUserId();

        Comment comment = commentMapper.selectById(commentId);
        if (comment == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "评论不存在");
        }

        // 只有评论作者、帖子作者（仅顶级评论）或管理员可以删除
        boolean isOwner = comment.getUserId().equals(currentUserId);
        boolean isPostAuthor = false;
        if (comment.getParentId() == null) {
            var post = postMapper.selectById(comment.getPostId());
            isPostAuthor = post != null && post.getUserId().equals(currentUserId);
        }
        boolean isAdmin = userRoleMapper.selectRolesByUserId(currentUserId).contains("admin");
        if (!isOwner && !isPostAuthor && !isAdmin) {
            throw new CustomerException(ResultCode.NO_PERMISSION, "无权删除该评论");
        }

        // 删除子回复
        List<Comment> replies = commentMapper.selectRepliesByParentId(commentId);
        for (Comment reply : replies) {
            commentLikeMapper.deleteByCommentId(reply.getId());
            commentMapper.deleteById(reply.getId());
        }
        commentLikeMapper.deleteByCommentId(commentId);
        commentMapper.deleteById(commentId);

        // 只有顶级评论才减少帖子评论数
        if (comment.getParentId() == null) {
            postMapper.decrementComments(comment.getPostId());
        }
    }

    private CommentVO convertToVO(Comment comment) {
        CommentVO vo = new CommentVO();
        vo.setId(comment.getId());
        vo.setPostId(comment.getPostId());
        vo.setContent(comment.getContent());
        vo.setLikes(comment.getLikes());
        vo.setIsHot(comment.getIsHot() != null && comment.getIsHot() == 1);
        vo.setCreatedAt(comment.getCreatedAt());
        vo.setParentId(comment.getParentId());
        vo.setReplyTo(comment.getReplyTo());
        vo.setImage(comment.getImage());

        // 作者信息
        User user = userMapper.selectById(comment.getUserId());
        if (user != null) {
            CommentAuthorVO author = new CommentAuthorVO();
            author.setId(user.getId());
            author.setName(user.getName());
            author.setNameColor(user.getNameColor());
            author.setAvatar(user.getAvatar());
            vo.setAuthor(author);
        }

        // 当前用户是否已点赞
        Long currentUserId = LoginUserHolder.getUserId();
        vo.setLikedByMe(currentUserId != null
                && commentLikeMapper.existsByCommentIdAndUserId(comment.getId(), currentUserId) > 0);

        return vo;
    }

    /**
     * 将图片从 temp 目录移动到 images 永久目录
     */
    private String moveImageToPermanent(String imageUrl) {
        if (imageUrl == null || !imageUrl.contains("/upload/temp/")) {
            return imageUrl;
        }
        String filename = imageUrl.substring(imageUrl.lastIndexOf("/") + 1);
        File tempFile = new File(uploadPath + "temp/" + filename);
        File imagesDir = new File(uploadPath + "images/");
        if (!imagesDir.exists()) {
            imagesDir.mkdirs();
        }
        File imageFile = new File(imagesDir, filename);
        if (tempFile.exists()) {
            try {
                Files.move(tempFile.toPath(), imageFile.toPath(),
                        StandardCopyOption.REPLACE_EXISTING);
                return baseUrl + "/upload/images/" + filename;
            } catch (IOException e) {
                // ignore move failure and keep original image URL
            }
        }
        return imageUrl;
    }
}