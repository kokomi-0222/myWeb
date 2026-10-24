"""统计项目里各类源码的文件数和行数。

用法：python tools/line_count.py
"""

from pathlib import Path

# 要统计的目录和文件后缀
TARGETS = [
    ("springboot", ".java"),
    ("vue/src", ".vue"),
    ("vue/src", ".js"),
]


def count_lines(folder: str, suffix: str) -> tuple[int, int]:
    """返回 (文件数, 总行数)。"""
    files = 0
    total = 0
    for path in Path(folder).rglob("*" + suffix):
        if path.is_file():
            files += 1
            text = path.read_text(encoding="utf-8", errors="ignore")
            total += len(text.splitlines())
    return files, total


if __name__ == "__main__":
    for folder, suffix in TARGETS:
        n_files, n_lines = count_lines(folder, suffix)
        print(f"{suffix:>6}  {n_files:>4} 个文件  {n_lines:>7} 行  ({folder})")
