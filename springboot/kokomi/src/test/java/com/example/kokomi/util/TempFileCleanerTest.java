package com.example.kokomi.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * upload/temp 过期清理的回归测试。
 *
 * <p>这段逻辑会真删文件，删错了用户就丢图，所以边界（保留窗口、目录、大小统计）
 * 都要有用例兜着。
 */
class TempFileCleanerTest {

    private static final long HOUR = 3_600_000L;

    @TempDir
    Path tempDir;

    /** 造一个「mtime = now - ageHours」的文件，返回字节数。 */
    private long makeFile(String name, String content, long now, long ageHours) throws IOException {
        Path file = tempDir.resolve(name);
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        Files.write(file, bytes);
        Files.setLastModifiedTime(file, FileTime.from(now - ageHours * HOUR, TimeUnit.MILLISECONDS));
        return bytes.length;
    }

    @Test
    @DisplayName("只删超过保留窗口的，新文件一个不能动")
    void deletesOnlyExpired() throws IOException {
        long now = System.currentTimeMillis();
        makeFile("old-1.jpg", "aaaa", now, 48);
        makeFile("old-2.jpg", "bbbbbb", now, 25);
        makeFile("fresh-1.jpg", "cc", now, 1);
        makeFile("fresh-2.jpg", "dd", now, 0);

        TempFileCleaner.CleanResult result = TempFileCleaner.clean(tempDir, 24 * HOUR, now);

        assertEquals(2, result.deletedFiles());
        assertEquals(10, result.freedBytes(), "释放字节数应该只算被删的两个");
        assertEquals(0, result.failedFiles());
        assertFalse(Files.exists(tempDir.resolve("old-1.jpg")));
        assertFalse(Files.exists(tempDir.resolve("old-2.jpg")));
        assertTrue(Files.exists(tempDir.resolve("fresh-1.jpg")), "1 小时前的文件被误删了");
        assertTrue(Files.exists(tempDir.resolve("fresh-2.jpg")), "刚上传的文件被误删了");
    }

    @Test
    @DisplayName("恰好卡在窗口边界上的文件保留（用 > 判断，不是 >=）")
    void keepsFileExactlyOnBoundary() throws IOException {
        long now = System.currentTimeMillis();
        makeFile("edge.jpg", "x", now, 24);

        TempFileCleaner.CleanResult result = TempFileCleaner.clean(tempDir, 24 * HOUR, now);

        assertEquals(0, result.deletedFiles());
        assertTrue(Files.exists(tempDir.resolve("edge.jpg")));
    }

    @Test
    @DisplayName("子目录本身和里面的文件都不碰，不做递归")
    void leavesDirectoriesAlone() throws IOException {
        long now = System.currentTimeMillis();
        Path sub = Files.createDirectory(tempDir.resolve("nested"));
        Path inner = sub.resolve("keep.jpg");
        Files.write(inner, "z".getBytes(StandardCharsets.UTF_8));
        Files.setLastModifiedTime(inner, FileTime.from(now - 100 * HOUR, TimeUnit.MILLISECONDS));
        Files.setLastModifiedTime(sub, FileTime.from(now - 100 * HOUR, TimeUnit.MILLISECONDS));

        TempFileCleaner.CleanResult result = TempFileCleaner.clean(tempDir, 24 * HOUR, now);

        assertEquals(0, result.deletedFiles());
        assertTrue(Files.isDirectory(sub), "temp 下的子目录被删了");
        assertTrue(Files.exists(inner), "递归删进了子目录");
    }

    @Test
    @DisplayName("空目录和不存在的目录都返回空结果，不抛异常")
    void handlesEmptyAndMissingDir() {
        long now = System.currentTimeMillis();
        assertTrue(TempFileCleaner.clean(tempDir, 24 * HOUR, now).isEmpty());
        assertTrue(TempFileCleaner.clean(tempDir.resolve("nope"), 24 * HOUR, now).isEmpty());
        assertTrue(TempFileCleaner.clean(null, 24 * HOUR, now).isEmpty());
    }

    @Test
    @DisplayName("保留窗口为 0 时只留下「刚好现在」的文件（不应该等于「不清理」）")
    void zeroRetentionDeletesAlmostEverything() throws IOException {
        long now = System.currentTimeMillis();
        makeFile("a.jpg", "1", now, 1);
        makeFile("b.jpg", "22", now, 0);

        TempFileCleaner.CleanResult result = TempFileCleaner.clean(tempDir, 0, now);

        assertEquals(1, result.deletedFiles(), "1 小时前的文件在 0 窗口下必须被删");
        assertFalse(Files.exists(tempDir.resolve("a.jpg")));
    }
}
