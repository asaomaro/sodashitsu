import { describe, expect, it } from "vitest";
import { clientErrorMessage, errorCodeOf } from "./clientError.js";

describe("clientErrorMessage（D107：client.error の英語の message をそのまま出さず、code から日本語の文言を引く）", () => {
  it("今のサーバが送る invalid_params（1MB を超える貼り付け等）は、送った分が端末に届いていないことを日本語で示す", () => {
    const text = clientErrorMessage("invalid_params");
    expect(text).toContain("1MB を超えた");
    expect(text).toContain("端末に届いていません");
    expect(text).not.toMatch(/malformed|frame/i);
  });

  it.each(["unauthorized", "not_found", "spawn_failed", "internal"])("design のエラーコード %s にも日本語の文言がある（汎用の文言ではない）", (code) => {
    const text = clientErrorMessage(code);
    expect(text).not.toContain(code);
    expect(text).toMatch(/[ぁ-んァ-ン]/);
  });

  it("知らない code は汎用の日本語の文言にその code を添える", () => {
    expect(clientErrorMessage("too_many_frames")).toBe("サーバでエラーが起きました（too_many_frames）。");
  });

  it("Object の既定のプロパティ名（toString 等）は知らない code として扱う", () => {
    expect(clientErrorMessage("toString")).toBe("サーバでエラーが起きました（toString）。");
    expect(clientErrorMessage("__proto__")).toBe("サーバでエラーが起きました（__proto__）。");
  });
});

// 20260920-git-worktree-actions：git の失敗は**種類ごとに別のコード**で来る（D2）。
// 生の診断は見せないので、ここが利用者の目に触れる唯一の文言になる。
describe("worktree のエラー（20260920-git-worktree-actions）", () => {
  it("種類ごとに違う文言を返す", () => {
    expect(clientErrorMessage("not_a_git_repository")).toContain("Git リポジトリではありません");
    expect(clientErrorMessage("worktree_branch_in_use")).toContain("既に別の場所");
    expect(clientErrorMessage("worktree_path_exists")).toContain("作成先のパス");
    // **「作成」と言い切らない**——一覧の取得の失敗にも同じコードを使う（cross 点検の nit）。
    expect(clientErrorMessage("worktree_failed")).toContain("操作に失敗しました");
    expect(clientErrorMessage("worktree_failed")).not.toContain("作成できませんでした");
    expect(clientErrorMessage("worktree_no_commits")).toContain("コミット");
  });

  it("6 つとも互いに違う（同じ文言に潰れていない）", () => {
    const codes = [
      "not_a_git_repository",
      "worktree_branch_in_use",
      "worktree_path_exists",
      "worktree_no_commits",
      "worktree_invalid_branch",
      "worktree_failed",
    ];
    expect(new Set(codes.map(clientErrorMessage)).size).toBe(6);
  });
});

describe("worktree のロック済み削除（20260925-worktree-remove-locked）", () => {
  it("worktree_locked は「ロックされています」を含む文言で、既存の worktree_dirty とは別の文言", () => {
    expect(clientErrorMessage("worktree_locked")).toContain("ロックされています");
    expect(clientErrorMessage("worktree_locked")).not.toBe(clientErrorMessage("worktree_dirty"));
  });
});

// `Connection` は `new Error(`<code>: <message>`)` で reject する（decisions.md D4）。
// **この書式が変わると黙って汎用の文言に落ちる**ので、ここで固定する。
describe("errorCodeOf", () => {
  it("`<code>: <message>` の code を取り出す", () => {
    expect(errorCodeOf(new Error("worktree_path_exists: git worktree add failed"))).toBe("worktree_path_exists");
  });

  it("書式に合わなければ null", () => {
    expect(errorCodeOf(new Error("something went wrong"))).toBeNull();
    expect(errorCodeOf(new Error("Not A Code: x"))).toBeNull();
    expect(errorCodeOf(undefined)).toBeNull();
  });

  // 20260925-connection-error-code（design「振る舞いの詳細」）。
  it("code プロパティを持てば最優先でそれを返す（AC2）", () => {
    const err = Object.assign(new Error("worktree_dirty: from server"), { code: "worktree_locked" });
    expect(errorCodeOf(err)).toBe("worktree_locked"); // message の書式ではなく code プロパティが勝つ
  });

  it("code プロパティを持たない従来型の値は、引き続き正規表現フォールバックで判定する（AC3）", () => {
    expect(errorCodeOf(new Error("worktree_dirty: from server"))).toBe("worktree_dirty");
  });

  it("code プロパティが文字列でなければ、正規表現フォールバックに落ちる", () => {
    const err = Object.assign(new Error("worktree_dirty: from server"), { code: 42 });
    expect(errorCodeOf(err)).toBe("worktree_dirty");
  });
});

// 20260926-agent-prompt-send-keys：エージェントへの入力の code にも日本語の文言がある（汎用の文言ではない）。
describe("エージェントへの入力のエラー（20260926-agent-prompt-send-keys）", () => {
  it.each(["agent_not_found", "agent_blocked", "empty_agent_prompt", "invalid_key", "agent_prompt_failed"])("%s", (code) => {
    const text = clientErrorMessage(code);
    expect(text).not.toContain(code);
    expect(text).toMatch(/[ぁ-んァ-ン]/);
  });

  it("5 つの文言は互いに違う", () => {
    const codes = ["agent_not_found", "agent_blocked", "empty_agent_prompt", "invalid_key", "agent_prompt_failed"];
    expect(new Set(codes.map(clientErrorMessage)).size).toBe(codes.length);
  });
});

describe("入力の書き込み待ちの上限（20260927-server-size-input-limits）", () => {
  it("input_queue_full は、pane が入力を読まず送った入力を捨てたことを日本語で示す（AC9）", () => {
    const text = clientErrorMessage("input_queue_full");
    expect(text).toContain("入力を読んでいない");
    expect(text).toContain("捨てました");
    expect(text).not.toContain("input_queue_full"); // 知らない code の汎用の文言ではない
  });
});
