import { TERMINAL_CELLS_MAX, TERMINAL_SIZE_MAX } from "@wtm/protocol";
import { describe, expect, it } from "vitest";
import {
  FrameWriter,
  isCanonicalBase64,
  LineSplitter,
  MAX_CONTROL_LINE_BYTES,
  MAX_STREAM_DIMENSION,
  parseControlLine,
  type LineEvent,
} from "./sessionStream.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

const lines = (events: LineEvent[]): string[] =>
  events.map((e) => (e.kind === "line" ? dec.decode(e.bytes) : "<too_long>"));

describe("FrameWriter（記録の形。AC1・AC2）", () => {
  it("terminal.frame は seq が 1 から増え、bytes は UTF-8 の base64", () => {
    const w = new FrameWriter();
    const first = JSON.parse(w.frame("画面\x1b[1m", true, 120, 40)) as Record<string, unknown>;
    expect(first).toEqual({
      type: "terminal.frame",
      seq: 1,
      encoding: "ansi",
      width: 120,
      height: 40,
      full: true,
      bytes: Buffer.from("画面\x1b[1m", "utf8").toString("base64"),
    });
    const second = JSON.parse(w.frame("x", false, 80, 24)) as Record<string, unknown>;
    expect(second).toMatchObject({ seq: 2, full: false, width: 80, height: 24 });
  });

  it("1 行 1 記録（改行で終わり、途中に改行を含まない）", () => {
    const w = new FrameWriter();
    const line = w.frame("a\nb\r\n", false, 1, 1);
    expect(line.endsWith("\n")).toBe(true);
    expect(line.slice(0, -1)).not.toContain("\n");
    expect(w.closed("pane_closed")).toBe('{"type":"terminal.closed","reason":"pane_closed"}\n');
  });

  it("terminal.closed は seq を進めない", () => {
    const w = new FrameWriter();
    w.frame("a", true, 1, 1);
    w.closed("released");
    expect((JSON.parse(w.frame("b", false, 1, 1)) as { seq: number }).seq).toBe(2);
  });
});

describe("LineSplitter（行の切り出しと上限。AC12）", () => {
  it("区切りをまたいだ行をつなぎ、最後の改行の無い行は end で出す", () => {
    const s = new LineSplitter();
    expect(lines(s.feed(enc.encode('{"a"')))).toEqual([]);
    expect(lines(s.feed(enc.encode(':1}\n{"b":2}\n{"c"')))).toEqual(['{"a":1}', '{"b":2}']);
    expect(lines(s.end())).toEqual(['{"c"']);
    expect(lines(s.end())).toEqual([]);
  });

  it("Buffer を渡しても断片を写し取る（呼び出し側が後で書き換えても行は変わらない）", () => {
    const s = new LineSplitter();
    const chunk = Buffer.from("abc");
    s.feed(chunk);
    chunk[0] = 0x7a;
    expect(lines(s.end())).toEqual(["abc"]);
  });

  it("空の行も行として出す（無視するかは parseControlLine が決める）", () => {
    const s = new LineSplitter();
    expect(lines(s.feed(enc.encode("\n\nx\n")))).toEqual(["", "", "x"]);
  });

  it("上限ちょうどの行は通し、1 バイトでも超えたら too_long を 1 回だけ出して次の行から続ける", () => {
    const s = new LineSplitter(8);
    expect(lines(s.feed(enc.encode("12345678\n")))).toEqual(["12345678"]);
    expect(lines(s.feed(enc.encode("123456789\nok\n")))).toEqual(["<too_long>", "ok"]);
  });

  it("改行が来ないまま上限を超えても、報告は 1 回で、溜めずに捨て続け、改行の後から続ける", () => {
    const s = new LineSplitter(8);
    expect(lines(s.feed(enc.encode("12345")))).toEqual([]);
    expect(lines(s.feed(enc.encode("6789")))).toEqual(["<too_long>"]);
    expect(lines(s.feed(enc.encode("abcdefghijklmnop")))).toEqual([]);
    expect(lines(s.feed(enc.encode("xyz\nnext\n")))).toEqual(["next"]);
  });

  it("捨て中に入力が終わっても最後の行として出さない", () => {
    const s = new LineSplitter(4);
    expect(lines(s.feed(enc.encode("123456")))).toEqual(["<too_long>"]);
    expect(lines(s.end())).toEqual([]);
  });

  it("既定の上限は 1 MiB", () => {
    const s = new LineSplitter();
    const ok = new Uint8Array(MAX_CONTROL_LINE_BYTES + 1).fill(0x61);
    ok[MAX_CONTROL_LINE_BYTES] = 0x0a;
    expect(s.feed(ok).map((e) => e.kind)).toEqual(["line"]);
    const tooLong = new Uint8Array(MAX_CONTROL_LINE_BYTES + 2).fill(0x61);
    tooLong[MAX_CONTROL_LINE_BYTES + 1] = 0x0a;
    expect(s.feed(tooLong).map((e) => e.kind)).toEqual(["too_long"]);
  });
});

describe("isCanonicalBase64", () => {
  it.each(["", "YQ==", "YWI=", "YWJj", "YWJjZA==", "+/+/", "/w=="])("正規: %j", (s) => {
    expect(isCanonicalBase64(s)).toBe(true);
  });
  it.each([
    "YQ",
    "YQ=",
    "Y===",
    "YW Jj",
    "YWJj\n",
    "YQ==YQ==",
    "YW-j",
    "YW_j",
    "=",
    "YWJ",
    "YR==",
    "YWK=",
    "/x==",
  ])("非正規: %j", (s) => {
    expect(isCanonicalBase64(s)).toBe(false);
  });
});

const parse = (text: string) => parseControlLine(enc.encode(text));

describe("parseControlLine（コマンドの検査。AC7・AC8・AC9・AC11）", () => {
  it("terminal.input の text は UTF-8 で、bytes は base64 を戻した列", () => {
    const t = parse('{"type":"terminal.input","text":"ls \\u001b[A\\r"}');
    expect(t).toEqual({
      ok: true,
      command: { type: "terminal.input", data: enc.encode("ls \x1b[A\r") },
    });
    const b = parse(
      `{"type":"terminal.input","bytes":"${Buffer.from([0x03, 0xff]).toString("base64")}"}`,
    );
    expect(b.ok).toBe(true);
    if (b.ok === true && b.command.type === "terminal.input") {
      expect([...b.command.data]).toEqual([0x03, 0xff]);
    }
  });

  it("空の text・空の bytes は正しい（送るものが無い）", () => {
    expect(parse('{"type":"terminal.input","text":""}')).toEqual({
      ok: true,
      command: { type: "terminal.input", data: new Uint8Array(0) },
    });
    expect(parse('{"type":"terminal.input","bytes":""}')).toMatchObject({ ok: true });
  });

  it("terminal.resize は 1〜1000 の整数。herdr の cell_width_px/cell_height_px は受け付けて使わない", () => {
    expect(parse('{"type":"terminal.resize","cols":1000,"rows":1}')).toEqual({
      ok: true,
      command: { type: "terminal.resize", cols: 1000, rows: 1 },
    });
    expect(
      parse('{"type":"terminal.resize","cols":80,"rows":24,"cell_width_px":9,"cell_height_px":0}'),
    ).toEqual({ ok: true, command: { type: "terminal.resize", cols: 80, rows: 24 } });
  });

  it("terminal.release", () => {
    expect(parse('{"type":"terminal.release"}')).toEqual({
      ok: true,
      command: { type: "terminal.release" },
    });
  });

  it.each(["", "   ", "\r", "\t \r"])("空白だけの行は empty: %j", (s) => {
    expect(parse(s)).toEqual({ ok: "empty" });
  });

  it("前後の空白・CR は許す（CRLF の行）", () => {
    expect(parse(' {"type":"terminal.release"} \r')).toMatchObject({ ok: true });
  });

  it.each([
    ["JSON でない", "{type:terminal.input}", "not valid JSON"],
    ["オブジェクトでない（配列）", '[{"type":"terminal.release"}]', "JSON object"],
    ["オブジェクトでない（null）", "null", "JSON object"],
    ["オブジェクトでない（文字列）", '"terminal.release"', "JSON object"],
    ["type が無い", '{"text":"x"}', 'no string "type"'],
    ["type が文字列でない", '{"type":1}', 'no string "type"'],
    ["未知の type", '{"type":"terminal.exec","text":"x"}', "unknown command type"],
    [
      "terminal.scroll は未対応",
      '{"type":"terminal.scroll","direction":"up","lines":3}',
      "not supported",
    ],
    [
      "知らないキー（input）",
      '{"type":"terminal.input","text":"x","paneId":"p2"}',
      "unknown field",
    ],
    ["知らないキー（release）", '{"type":"terminal.release","force":true}', "unknown field"],
    ["知らないキー（__proto__）", '{"type":"terminal.release","__proto__":{}}', "unknown field"],
    ["プロトタイプの名前の type（constructor）", '{"type":"constructor"}', "unknown command type"],
    ["プロトタイプの名前の type（__proto__）", '{"type":"__proto__"}', "unknown command type"],
    ["プロトタイプの名前の type（toString）", '{"type":"toString"}', "unknown command type"],
    [
      "プロトタイプの名前の type（hasOwnProperty）",
      '{"type":"hasOwnProperty"}',
      "unknown command type",
    ],
    ["text と bytes の両方", '{"type":"terminal.input","text":"x","bytes":"eA=="}', "exactly one"],
    ["text も bytes も無い", '{"type":"terminal.input"}', "exactly one"],
    ["text が文字列でない", '{"type":"terminal.input","text":["x"]}', "must be a string"],
    [
      "bytes が base64 でない",
      '{"type":"terminal.input","bytes":"not base64!"}',
      "canonical base64",
    ],
    ["bytes が埋め草を欠く", '{"type":"terminal.input","bytes":"eA"}', "canonical base64"],
    ["bytes が文字列でない", '{"type":"terminal.input","bytes":120}', "canonical base64"],
    ["cols が 0", '{"type":"terminal.resize","cols":0,"rows":24}', "between 1 and 1000"],
    ["cols が 1001", '{"type":"terminal.resize","cols":1001,"rows":24}', "between 1 and 1000"],
    ["rows が小数", '{"type":"terminal.resize","cols":80,"rows":24.5}', "between 1 and 1000"],
    ["rows が文字列", '{"type":"terminal.resize","cols":80,"rows":"24"}', "between 1 and 1000"],
    ["rows が無い", '{"type":"terminal.resize","cols":80}', "between 1 and 1000"],
    [
      "cell_width_px が負",
      '{"type":"terminal.resize","cols":80,"rows":24,"cell_width_px":-1}',
      "non-negative",
    ],
    [
      "cell_height_px が負",
      '{"type":"terminal.resize","cols":80,"rows":24,"cell_height_px":-1}',
      "non-negative",
    ],
    [
      "cell_height_px が小数",
      '{"type":"terminal.resize","cols":80,"rows":24,"cell_height_px":9.5}',
      "non-negative",
    ],
    ["Unicode の空白だけの行", "\u3000 ", "not valid JSON"],
    ["先頭の BOM", '\ufeff{"type":"terminal.release"}', "not valid JSON"],
  ])("不正: %s", (_name, text, reason) => {
    const r = parse(text);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toContain(reason);
  });

  it("理由に入れる利用者の値は JSON 文字列にして 64 文字で切る（制御文字をそのまま stderr に流さない）", () => {
    const r = parse(JSON.stringify({ type: `\x1b]0;x\x07${"a".repeat(100)}` }));
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).not.toMatch(/[\x00-\x1f]/);
      expect(r.reason).toContain("\\u001b");
      expect(r.reason.length).toBeLessThan(120);
    }
  });

  it("bytes から戻した列は独立した配列（共有プールを指さない）", () => {
    const r = parse('{"type":"terminal.input","bytes":"YQ=="}');
    if (r.ok !== true || r.command.type !== "terminal.input") throw new Error("expected input");
    expect(r.command.data.byteOffset).toBe(0);
    expect(r.command.data.buffer.byteLength).toBe(1);
  });

  it("UTF-8 として正しくない行は不正", () => {
    const r = parseControlLine(new Uint8Array([0x7b, 0xff, 0x7d]));
    expect(r).toEqual({ ok: false, reason: "line is not valid UTF-8" });
  });
});

// 20260927-server-size-input-limits（cross の点検）。`pane control` の --cols/--rows・terminal.resize の最大は、サーバのスキーマの上限の内側でなければならない
// （外なら最大の値が invalid_params で断られる）。1000×1000 はちょうど面積の上限。
describe("MAX_STREAM_DIMENSION とサーバの上限", () => {
  it("1 辺も面積もサーバの上限の内側", () => {
    expect(MAX_STREAM_DIMENSION).toBeLessThanOrEqual(TERMINAL_SIZE_MAX);
    expect(MAX_STREAM_DIMENSION * MAX_STREAM_DIMENSION).toBeLessThanOrEqual(TERMINAL_CELLS_MAX);
  });
});
