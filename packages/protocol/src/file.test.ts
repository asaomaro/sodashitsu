import { describe, expect, it } from "vitest";
import { FILE_NAME_MAX_BYTES, fileUriToPath, quotePathForShell, sanitizeFileName } from "./file.js";
import { isPastablePath } from "./image.js";

describe("sanitizeFileName", () => {
  it("ふつうの名前はそのまま（日本語・空白・先頭のドットを含む）", () => {
    expect(sanitizeFileName("report 2026.pdf")).toBe("report 2026.pdf");
    expect(sanitizeFileName("見積書.xlsx")).toBe("見積書.xlsx");
    expect(sanitizeFileName(".env")).toBe(".env");
  });

  it("ディレクトリの部分を落とす（置き場所の外へ出さない）", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\a.txt")).toBe("a.txt");
    expect(sanitizeFileName("..")).toBe("file");
    expect(sanitizeFileName("dir/")).toBe("file");
  });

  it("制御文字・見た目を偽る文字・Windows で使えない文字を _ に替える", () => {
    expect(sanitizeFileName("a\x1b[201~b.txt")).toBe("a_[201~b.txt");
    expect(sanitizeFileName("a\u202eb.txt")).toBe("a_b.txt");
    expect(sanitizeFileName('a<b>:"|?*.txt')).toBe("a_b______.txt");
    expect(sanitizeFileName("a\nb")).toBe("a_b");
  });

  it("終わりのドット・空白を落とし、Windows の予約名を避ける", () => {
    expect(sanitizeFileName("name. ")).toBe("name");
    expect(sanitizeFileName("NUL.txt")).toBe("_NUL.txt");
    expect(sanitizeFileName("com1")).toBe("_com1");
    expect(sanitizeFileName("console.log")).toBe("console.log");
  });

  it("長い名前は拡張子を残して切る（文字の途中では切らない）", () => {
    const name = sanitizeFileName(`${"あ".repeat(200)}.tar`);
    expect(name.endsWith(".tar")).toBe(true);
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(FILE_NAME_MAX_BYTES);
    expect(name).toMatch(/^あ+\.tar$/);
  });

  it("どんな入力でも、貼れる 1 つの名前になる", () => {
    for (const raw of ["", " ", "\x00", "a/b\\c", "\ud800", "x".repeat(2000), "...", "\u2028"]) {
      const name = sanitizeFileName(raw);
      expect(isPastablePath(name)).toBe(true);
      expect(name).not.toMatch(/[\\/]/);
      expect(name).not.toBe("..");
    }
  });
});

describe("quotePathForShell", () => {
  it("posix: 安全な文字だけならそのまま、そうでなければ単一引用符で包む", () => {
    expect(quotePathForShell("/home/me/a-b_c.txt", "posix")).toBe("/home/me/a-b_c.txt");
    expect(quotePathForShell("/home/me/見積書.txt", "posix")).toBe("/home/me/見積書.txt");
    expect(quotePathForShell("/home/me/my file.txt", "posix")).toBe("'/home/me/my file.txt'");
    expect(quotePathForShell("/tmp/it's $HOME;rm.txt", "posix")).toBe("'/tmp/it'\\''s $HOME;rm.txt'");
    expect(quotePathForShell("/tmp/a(1).txt", "posix")).toBe("'/tmp/a(1).txt'");
  });

  it("windows: 安全な文字だけならそのまま、そうでなければ二重引用符で包む", () => {
    expect(quotePathForShell("C:\\Users\\me\\a.txt", "windows")).toBe("C:\\Users\\me\\a.txt");
    expect(quotePathForShell("C:\\Program Files\\a.txt", "windows")).toBe('"C:\\Program Files\\a.txt"');
    expect(quotePathForShell("C:\\a&b.txt", "windows")).toBe('"C:\\a&b.txt"');
  });
});

describe("fileUriToPath", () => {
  it("file: の URI をパスにする（% の符号を戻す）", () => {
    expect(fileUriToPath("file:///home/me/a.txt")).toBe("/home/me/a.txt");
    expect(fileUriToPath("file://myhost/home/me/my%20file.txt", "MyHost")).toBe("/home/me/my file.txt");
    expect(fileUriToPath("file://localhost/home/me/a.txt")).toBe("/home/me/a.txt");
    expect(fileUriToPath("file:///home/me/%E8%A6%8B%E7%A9%8D.txt")).toBe("/home/me/見積.txt");
  });

  it("Windows のドライブは先頭の / を外す", () => {
    expect(fileUriToPath("file:///C:/Users/me/a.txt")).toBe("C:/Users/me/a.txt");
  });

  it("ほかのホストの URI（ssh の先で出たリンク）と、UNC になる始まりは通さない", () => {
    expect(fileUriToPath("file://remotehost/etc/passwd", "myhost")).toBeNull();
    expect(fileUriToPath("file://remotehost/etc/passwd")).toBeNull();
    expect(fileUriToPath("file:////evil/share/a.txt")).toBeNull();
    expect(fileUriToPath("file:///%5C%5Cevil/share/a.txt")).toBeNull();
  });

  it("file: でない・解釈できない・貼れない文字を含むものは null", () => {
    expect(fileUriToPath("https://example.com/a.txt")).toBeNull();
    expect(fileUriToPath("not a uri")).toBeNull();
    expect(fileUriToPath("file:///tmp/a%1b[201~b")).toBeNull();
    expect(fileUriToPath("file:///tmp/%E0%A4%A")).toBeNull();
  });
});
