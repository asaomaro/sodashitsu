import { RpcError } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import {
  MAX_SEQUENCE_SOURCES,
  MetadataTokenBook,
  normalizeMetadataSource,
  normalizeMetadataTokens,
  normalizeMetadataTtl,
  normalizeMetadataValue,
} from "./metadataTokens.js";

/** 20260927-sidebar-row-tokens の AC3〜AC6。herdr の `api_helpers.rs`・`metadata_tokens.rs` のテストと同じ場面を含める。 */

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof RpcError ? err.code : "not-rpc-error";
  }
}

function messageOf(fn: () => unknown): string {
  try {
    fn();
    return "";
  } catch (err) {
    return (err as Error).message;
  }
}

const patch = (items: [string, string | null][]) => new Map(items);

describe("normalizeMetadataSource（AC4）", () => {
  it("前後の空白を除いて返す。文字種は英数字と : . _ -", () => {
    expect(normalizeMetadataSource("  my-agent_hook:v1.2  ")).toBe("my-agent_hook:v1.2");
  });

  it("空・空白だけは断る", () => {
    expect(codeOf(() => normalizeMetadataSource(""))).toBe("invalid_metadata_source");
    expect(messageOf(() => normalizeMetadataSource("   "))).toBe("metadata source must not be empty");
  });

  it("80 文字までは通し、81 文字は断る", () => {
    expect(normalizeMetadataSource("a".repeat(80))).toBe("a".repeat(80));
    expect(codeOf(() => normalizeMetadataSource("a".repeat(81)))).toBe("invalid_metadata_source");
    expect(messageOf(() => normalizeMetadataSource("a".repeat(81)))).toBe("metadata source must be 80 characters or fewer");
  });

  it("前後の空白は Rust の trim と同じ集合（U+0085 は除き、U+FEFF は除かない）", () => {
    expect(normalizeMetadataSource("agent\u0085")).toBe("agent");
    expect(codeOf(() => normalizeMetadataSource("\ufeffagent"))).toBe("invalid_metadata_source");
  });

  it("文字種の外（空白・/・非 ASCII）は断る", () => {
    for (const bad of ["a b", "a/b", "日本", "a\u0000b", "a+b"]) {
      expect(codeOf(() => normalizeMetadataSource(bad))).toBe("invalid_metadata_source");
    }
  });
});

describe("normalizeMetadataTtl（AC4）", () => {
  it("無ければ null、1〜86400000 はそのまま", () => {
    expect(normalizeMetadataTtl(undefined)).toBeNull();
    expect(normalizeMetadataTtl(1)).toBe(1);
    expect(normalizeMetadataTtl(86_400_000)).toBe(86_400_000);
  });

  it("0 と 86400001 は断る", () => {
    expect(codeOf(() => normalizeMetadataTtl(0))).toBe("invalid_metadata_ttl");
    expect(messageOf(() => normalizeMetadataTtl(0))).toBe("metadata ttl_ms must be at least 1");
    expect(codeOf(() => normalizeMetadataTtl(86_400_001))).toBe("invalid_metadata_ttl");
    expect(messageOf(() => normalizeMetadataTtl(86_400_001))).toBe("metadata ttl_ms must be 86400000 or less");
  });
});

describe("normalizeMetadataValue（AC3）", () => {
  it("前後の空白と制御文字を除く（herdr のテストと同じ: '  review\\nready  ' → 'reviewready'）", () => {
    expect(normalizeMetadataValue("  review\nready  ")).toBe("reviewready");
    expect(normalizeMetadataValue("a\u0007b\u009bc\u007fd")).toBe("abcd");
  });

  it("空白・制御文字だけなら null（消去）", () => {
    expect(normalizeMetadataValue(" \n ")).toBeNull();
    expect(normalizeMetadataValue("")).toBeNull();
    expect(normalizeMetadataValue("\u0001\u0002")).toBeNull();
  });

  it("前後の空白は Rust の trim と同じ集合（U+0085 は枠を食う前に除き、U+FEFF〔Cf〕は残す）", () => {
    expect(normalizeMetadataValue(`\u0085   ${"a".repeat(80)}`)).toBe("a".repeat(80));
    expect(normalizeMetadataValue("\ufeffok")).toBe("\ufeffok");
  });

  it("80 コードポイントで切り詰め、切った後の末尾の空白も除く", () => {
    expect(normalizeMetadataValue("x".repeat(100))).toBe("x".repeat(80));
    // サロゲートペア（𝒳）を 1 文字と数える
    expect(normalizeMetadataValue("𝒳".repeat(90))).toBe("𝒳".repeat(80));
    expect(normalizeMetadataValue(`${"y".repeat(79)} zzz`)).toBe("y".repeat(79));
  });

  it("制御文字を除いてから数える（除いた分だけ後ろの文字が残る）", () => {
    expect(normalizeMetadataValue(`${"\u0000".repeat(10)}${"a".repeat(85)}`)).toBe("a".repeat(80));
  });

  it("HTML はそのまま文字として残す（描画はブラウザがテキストとして行う）", () => {
    expect(normalizeMetadataValue("<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("normalizeMetadataTokens（AC3・AC4）", () => {
  it("設定と消去を名前 → 値の表にし、値を整える", () => {
    const out = normalizeMetadataTokens([
      { name: "summary", value: "  review\nready  " },
      { name: "empty", value: " \n " },
      { name: "clear", value: null },
    ]);
    expect([...out]).toEqual([
      ["summary", "reviewready"],
      ["empty", null],
      ["clear", null],
    ]);
  });

  it("同じ名前は後の指定が勝つ（設定の後の消去・消去の後の設定）", () => {
    expect([...normalizeMetadataTokens([{ name: "a", value: "1" }, { name: "a", value: null }])]).toEqual([["a", null]]);
    expect([...normalizeMetadataTokens([{ name: "a", value: null }, { name: "a", value: "2" }])]).toEqual([["a", "2"]]);
  });

  it("組が無ければ断る", () => {
    expect(codeOf(() => normalizeMetadataTokens([]))).toBe("invalid_metadata_token");
    expect(messageOf(() => normalizeMetadataTokens([]))).toBe("missing token to set or clear");
  });

  it("異なる名前 16 までは通し、17 は断る（重複は 1 つと数える）", () => {
    const sixteen = Array.from({ length: 16 }, (_, i) => ({ name: `k${i}`, value: "v" }));
    expect(normalizeMetadataTokens(sixteen).size).toBe(16);
    expect(normalizeMetadataTokens([...sixteen, { name: "k0", value: "w" }]).size).toBe(16);
    expect(codeOf(() => normalizeMetadataTokens([...sixteen, { name: "k16", value: "v" }]))).toBe("invalid_metadata_token");
    expect(messageOf(() => normalizeMetadataTokens([...sixteen, { name: "k16", value: "v" }]))).toBe("a metadata report may update at most 16 tokens");
  });

  it("数の上限は名前の検査より先に見る（17 個に不正な名前が混ざっても上限の誤り）", () => {
    const seventeen = [...Array.from({ length: 16 }, (_, i) => ({ name: `k${i}`, value: "v" })), { name: "bad.name", value: "v" }];
    expect(messageOf(() => normalizeMetadataTokens(seventeen))).toBe("a metadata report may update at most 16 tokens");
  });

  it("名前の規則: 空・33 文字以上・文字種の外は断る。32 文字と _ - は通す（herdr: 'bad.name' と 33 文字を断る）", () => {
    expect(normalizeMetadataTokens([{ name: `${"a".repeat(30)}_-`, value: "v" }]).size).toBe(1);
    for (const bad of ["", "bad.name", "a".repeat(33), "a b", "名前"]) {
      expect(codeOf(() => normalizeMetadataTokens([{ name: bad, value: "v" }]))).toBe("invalid_metadata_token");
    }
    expect(messageOf(() => normalizeMetadataTokens([{ name: "bad.name", value: "v" }]))).toBe("invalid metadata token key: bad.name");
  });

  it("__proto__ もただの名前として扱う", () => {
    const out = normalizeMetadataTokens([{ name: "__proto__", value: "x" }]);
    expect(out.get("__proto__")).toBe("x");
  });
});

describe("MetadataTokenBook — seq（AC5）", () => {
  it("seq が無い報告は常に新しい", () => {
    const book = new MetadataTokenBook();
    expect(book.acceptSequence("s", undefined)).toBe("accepted");
    expect(book.isFresh("s", undefined)).toBe(true);
  });

  it("同じ source の seq は、記録より大きいときだけ受け付ける（同じ・小さいは stale）", () => {
    const book = new MetadataTokenBook();
    expect(book.acceptSequence("s", 5)).toBe("accepted");
    expect(book.isFresh("s", 5)).toBe(false);
    expect(book.acceptSequence("s", 5)).toBe("stale");
    expect(book.acceptSequence("s", 4)).toBe("stale");
    expect(book.acceptSequence("s", 6)).toBe("accepted");
    // 別の source は別に数える
    expect(book.acceptSequence("t", 1)).toBe("accepted");
    // 0 も受け付ける（記録が無ければ）
    expect(book.acceptSequence("u", 0)).toBe("accepted");
    expect(book.acceptSequence("u", 0)).toBe("stale");
  });

  it("seq 付きの source は 32 まで。33 個目は limit、枠を持つ source は受け付け続ける（herdr の sequence_sources_are_bounded）", () => {
    const book = new MetadataTokenBook();
    for (let i = 0; i < MAX_SEQUENCE_SOURCES; i++) expect(book.acceptSequence(`source-${i}`, 1)).toBe("accepted");
    expect(book.acceptSequence("one-too-many", 1)).toBe("limit");
    expect(book.acceptSequence("source-0", 1)).toBe("stale");
    expect(book.acceptSequence("source-0", 2)).toBe("accepted");
    // seq の無い報告は枠に関係なく受け付ける
    expect(book.acceptSequence("one-too-many", undefined)).toBe("accepted");
  });

  it("値を消しても期限で消えても、枠は戻らない", () => {
    const book = new MetadataTokenBook();
    for (let i = 0; i < MAX_SEQUENCE_SOURCES; i++) book.acceptSequence(`s${i}`, 1);
    book.patch(patch([["a", "1"]]), 10, 0);
    book.patch(patch([["a", null]]), null, 0);
    book.expireAt(100);
    expect(book.acceptSequence("new", 1)).toBe("limit");
  });
});

describe("MetadataTokenBook — 反映と数（AC1・AC3・AC4）", () => {
  it("設定と消去を個別に反映し、触れない名前は残す（herdr の patches_and_clears_individual_keys）", () => {
    const book = new MetadataTokenBook();
    book.patch(patch([["summary", "one"], ["model", "opus"]]), null, 0);
    book.patch(patch([["summary", "two"], ["model", null]]), null, 0);
    expect(book.values()).toEqual({ summary: "two" });
    book.patch(patch([["other", "x"]]), null, 0);
    expect(book.values()).toEqual({ summary: "two", other: "x" });
  });

  it("変わらない報告は false（同じ値・無い名前の消去）、変われば true", () => {
    const book = new MetadataTokenBook();
    expect(book.patch(patch([["a", "1"]]), null, 0)).toBe(true);
    expect(book.patch(patch([["a", "1"]]), null, 5)).toBe(false);
    expect(book.patch(patch([["zz", null]]), null, 0)).toBe(false);
    expect(book.patch(patch([["a", "2"]]), null, 0)).toBe(true);
    expect(book.patch(patch([["a", null]]), null, 0)).toBe(true);
    expect(book.values()).toBeNull();
  });

  it("同じ値でも締め切りが変われば変化あり（期限を延ばす報告）", () => {
    const book = new MetadataTokenBook();
    book.patch(patch([["a", "1"]]), 100, 0);
    expect(book.patch(patch([["a", "1"]]), 100, 50)).toBe(true);
    expect(book.nextExpiry()).toBe(150);
  });

  it("反映後の名前の数（値ありは足し、値なしは除く）", () => {
    const book = new MetadataTokenBook();
    book.patch(patch([["a", "1"], ["b", "2"]]), null, 0);
    expect(book.keyCountAfterPatch(patch([["c", "3"]]))).toBe(3);
    expect(book.keyCountAfterPatch(patch([["a", "9"]]))).toBe(2);
    expect(book.keyCountAfterPatch(patch([["a", null], ["c", "3"], ["d", "4"]]))).toBe(3);
    expect(book.keyCountAfterPatch(patch([["zz", null]]))).toBe(2);
  });

  it("values は __proto__ も自前の持ち物として持ち、プロトタイプは普通のまま", () => {
    const book = new MetadataTokenBook();
    book.patch(patch([["__proto__", "x"], ["a", "1"]]), null, 0);
    const values = book.values()!;
    expect(Object.hasOwn(values, "__proto__")).toBe(true);
    expect(values["__proto__"]).toBe("x");
    expect(Object.getPrototypeOf(values)).toBe(Object.prototype);
    expect(Object.keys(values).sort()).toEqual(["__proto__", "a"]);
  });
});

describe("MetadataTokenBook — 期限（AC6）", () => {
  it("期限はその報告で設定した名前にだけ付く（herdr の ttl_only_changes_keys_in_the_patch）", () => {
    const book = new MetadataTokenBook();
    book.patch(patch([["short", "one"]]), 1000, 0);
    book.patch(patch([["persistent", "two"]]), null, 0);
    expect(book.nextExpiry()).toBe(1000);
    expect(book.expireAt(999)).toBe(false);
    expect(book.values()).toEqual({ short: "one", persistent: "two" });
    expect(book.expireAt(1000)).toBe(true);
    expect(book.values()).toEqual({ persistent: "two" });
    expect(book.nextExpiry()).toBeNull();
  });

  it("短い期限の名前を長い期限で設定し直すと、古い締め切りで掃いても消えない（herdr の stale_expiry_does_not_clear_replacement）", () => {
    const book = new MetadataTokenBook();
    book.patch(patch([["a", "old"]]), 100, 0);
    book.patch(patch([["a", "new"]]), 1000, 50);
    expect(book.expireAt(100)).toBe(false);
    expect(book.values()).toEqual({ a: "new" });
    expect(book.expireAt(1050)).toBe(true);
  });

  it("期限なしで設定し直すと期限は外れる", () => {
    const book = new MetadataTokenBook();
    book.patch(patch([["a", "1"]]), 10, 0);
    book.patch(patch([["a", "1"]]), null, 5);
    expect(book.nextExpiry()).toBeNull();
    expect(book.expireAt(1_000_000)).toBe(false);
    expect(book.values()).toEqual({ a: "1" });
  });

  it("遅れて掃いても、締め切りを過ぎたものはすべて消す。nextExpiry は最小", () => {
    const book = new MetadataTokenBook();
    book.patch(patch([["a", "1"]]), 30, 0);
    book.patch(patch([["b", "2"]]), 10, 0);
    book.patch(patch([["c", "3"]]), 50, 0);
    expect(book.nextExpiry()).toBe(10);
    expect(book.expireAt(40)).toBe(true);
    expect(book.values()).toEqual({ c: "3" });
    expect(book.nextExpiry()).toBe(50);
  });
});
