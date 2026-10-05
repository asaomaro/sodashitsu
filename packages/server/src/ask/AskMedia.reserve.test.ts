import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeAskSpec, type AskSpec } from "@sodashitsu/protocol";

/**
 * ローカル起動（unlimited）のサーバ全体の安全弁が、読み込む（確保する）前に効くこと（20261005-ask-local-no-limit。独立レビューの指摘）。
 * `node:fs/promises` の `open` を、読みが門（gate）で止まる偽のファイルに替えて、複数の `prepare` が同時に大きなファイルへ確保しに来た状態を決定的に作る。
 */
const state = vi.hoisted(() => ({
  size: 0,
  gate: Promise.resolve(),
  opened: 0,
  allocated: 0,
  failUtf8: false,
}));

vi.mock("node:fs/promises", () => ({
  open: async () => {
    state.opened++;
    let pos = 0;
    return {
      stat: async () => ({ isFile: () => true, size: state.size }),
      read: async (buf: Buffer, off: number, len: number) => {
        await state.gate;
        const n = Math.min(len, state.size - pos);
        if (n > 0) buf.fill(state.failUtf8 ? 0xff : 97, off, off + n);
        pos += n;
        return { bytesRead: n };
      },
      close: async () => undefined,
    };
  },
}));

import { AskMedia } from "./AskMedia.js";

const MIB = 1024 * 1024;
const SERVER = 400 * MIB;
const view = (file: string): AskSpec => {
  const r = normalizeAskSpec({ questions: [{ id: "a", label: "A", options: ["x"] }], view: { file } });
  if (!r.ok) throw new Error(r.message);
  return r.spec;
};
const media = (): AskMedia => new AskMedia({ fetcher: { fetchImage: () => Promise.reject(new Error("no")) } });
const sig = (): AbortSignal => new AbortController().signal;

describe("AskMedia: サーバ全体の安全弁は、読む前に予約して見る", () => {
  let release!: () => void;
  beforeEach(() => {
    state.opened = 0;
    state.failUtf8 = false;
    state.gate = new Promise<void>((r) => (release = r));
  });

  it("同時の prepare が空きを超えるぶんは、確保せずに ask_busy。通ったものは終われば予約が戻る", async () => {
    state.size = 40 * MIB;
    const m = media();
    const held = SERVER - 180 * MIB; // 空きは 180 MiB（40 MiB のファイルは 4 つまで）
    const runs = Array.from({ length: 6 }, (_, i) => m.prepare(view(`/f${i}.html`), sig(), () => held, true).then(
      (r) => ({ ok: true as const, bytes: r.totalBytes }),
      (e: { code?: string }) => ({ ok: false as const, code: e.code }),
    ));
    await new Promise((r) => setTimeout(r, 50)); // 全部が予約まで進んだ（4 つは読みの門で待ち、残りは断られている）
    expect(m.reservedBytes).toBeGreaterThan(0);
    expect(m.reservedBytes).toBeLessThanOrEqual(180 * MIB);
    release();
    const res = await Promise.all(runs);
    expect(res.filter((r) => r.ok)).toHaveLength(4);
    expect(res.filter((r) => !r.ok)).toEqual([{ ok: false, code: "ask_busy" }, { ok: false, code: "ask_busy" }]);
    expect(m.reservedBytes).toBe(0);
    expect(m.inflightBytes).toBe(0);
  });

  it("失敗（UTF-8 でない）でも予約は戻り、負にならない", async () => {
    state.size = 10 * MIB;
    state.failUtf8 = true;
    release();
    const m = media();
    await expect(m.prepare(view("/bad.html"), sig(), () => 0, true)).rejects.toMatchObject({ code: "invalid_ask_spec" });
    expect(m.reservedBytes).toBe(0);
  });

  it("従来の上限（外向き）でも、サーバ全体の空きを超える確保は読む前に断る", async () => {
    state.size = 5 * MIB;
    release();
    const m = media();
    await expect(m.prepare(view("/a.html"), sig(), () => 128 * MIB - 4 * MIB, false)).rejects.toMatchObject({ code: "ask_busy" });
    expect(state.opened).toBe(1);
    expect(m.reservedBytes).toBe(0);
  });
});
