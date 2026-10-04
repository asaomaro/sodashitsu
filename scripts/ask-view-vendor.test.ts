import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 成果物の隔離表示が読む同梱のライブラリ（`public/ask-view/vendor/`）が、配布元のまま（SOURCE.json の sha256 と一致）であることを固定する
 * （20261004-ask-media-popup。`scripts/sync-ask-form.test.ts` と同じ流儀: 手で直していないことを `pnpm test` で落とす）。
 */

const DIR = join(import.meta.dirname, "..", "packages", "web", "public", "ask-view");
const VENDOR = join(DIR, "vendor");
interface Source {
  files: Record<
    string,
    { package: string; version: string; license: string; license_file: string; sha256: string }
  >;
}
const source = JSON.parse(readFileSync(join(VENDOR, "SOURCE.json"), "utf8")) as Source;
const sha = (p: string): string => createHash("sha256").update(readFileSync(p)).digest("hex");

describe("ask-view/vendor", () => {
  it("marked・mermaid は SOURCE.json の sha256 と一致する（手で直していない）。ライセンスのファイルが付いている", () => {
    expect(Object.keys(source.files).sort()).toEqual(["marked.umd.js", "mermaid.min.js"]);
    for (const [name, info] of Object.entries(source.files)) {
      expect(sha(join(VENDOR, name)), name).toBe(info.sha256);
      expect(info.license).toBe("MIT");
      expect(readFileSync(join(VENDOR, info.license_file), "utf8")).toMatch(
        /MIT|Permission is hereby granted/,
      );
    }
  });

  it("隔離表示のページ・スクリプトは、外への通信・親の操作の API を呼ばない（fetch・XMLHttpRequest・WebSocket・top・opener・localStorage）。インラインのスクリプトを持たない", () => {
    for (const f of ["markdown.js", "html.js", "keys.js"]) {
      const code = readFileSync(join(DIR, f), "utf8").replace(/\/\/.*$/gm, "");
      expect(code, f).not.toMatch(
        /\bfetch\s*\(|XMLHttpRequest|WebSocket|\bwindow\.top\b|\bopener\b|localStorage|sessionStorage|document\.cookie|\beval\s*\(|new Function/,
      );
    }
    for (const f of ["markdown.html", "html.html"]) {
      const html = readFileSync(join(DIR, f), "utf8");
      // <script src=…> だけ（本文のあるインラインのスクリプトは CSP の script-src 'self' で動かない）
      for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        expect(m[1], f).toMatch(/\bsrc="/);
        expect(m[2]!.trim(), f).toBe("");
      }
    }
  });

  it("親へ送るメッセージは ready・rendered・key だけで、親から受けるのは親（event.source）の ask-view だけ", () => {
    for (const f of ["markdown.js", "html.js"]) {
      const code = readFileSync(join(DIR, f), "utf8");
      expect(code).toMatch(/ev\.source !== parent/);
      expect(
        [...code.matchAll(/postMessage\(\{ type: '([a-z]+)'/g)]
          .map((m) => m[1])
          .every((t) => ["ready", "rendered"].includes(t!)),
        f,
      ).toBe(true);
    }
    expect(readFileSync(join(DIR, "keys.js"), "utf8")).toMatch(/type: 'key'/);
  });
});
