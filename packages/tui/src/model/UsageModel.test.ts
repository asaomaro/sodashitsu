import { expect, it, vi } from "vitest";
import { UsageModel } from "./UsageModel.js";
import type { RequestPort } from "../term/PaneRegistry.js";
it("見えている間だけ購読し、接続切断後の遅い取得結果を捨てる", async () => {
  let resolve: (v: unknown) => void = () => {};
  const request = vi.fn(async (method: string) =>
    method === "agent.usage"
      ? new Promise((r) => {
          resolve = r;
        })
      : {},
  );
  const m = new UsageModel({ request } as unknown as RequestPort, vi.fn());
  m.sync(true);
  expect(request).not.toHaveBeenCalled();
  m.connected();
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith("agent.usage", {}));
  m.disconnected();
  resolve({ panes: { old: null }, accounts: [] });
  await Promise.resolve();
  expect(m.data.panes).toEqual({});
  m.sync(false);
  expect(request).not.toHaveBeenCalledWith("agent.usage_watch", { on: false });
});
it("配信の差分を合成し、非表示で購読を止めて後続配信を捨てる", async () => {
  const request = vi.fn(async (method: string) =>
    method === "agent.usage" ? { panes: { a: null }, accounts: [] } : {},
  );
  const m = new UsageModel({ request } as unknown as RequestPort, vi.fn());
  m.connected();
  m.sync(true);
  await vi.waitFor(() => expect(m.status).toBe("ready"));
  m.apply({ panes: { b: null } });
  expect(m.data.panes).toEqual({ a: null, b: null });
  m.sync(false);
  expect(request).toHaveBeenCalledWith("agent.usage_watch", { on: false });
  m.apply({ panes: { c: null } });
  expect(m.data.panes).not.toHaveProperty("c");
});
it("先着した配信を遅いsnapshotや古い差分で戻さない", async () => {
  let finish: (v: unknown) => void = () => {};
  const request = vi.fn(async (method: string) =>
    method === "agent.usage"
      ? new Promise((r) => {
          finish = r;
        })
      : {},
  );
  const m = new UsageModel({ request } as unknown as RequestPort, vi.fn());
  m.connected();
  m.sync(true);
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith("agent.usage", {}));
  const u = {
    paneId: "p",
    kind: "codex",
    model: null,
    tokens: { basis: "cumulative" as const, total: 100 },
    source: "rollout" as const,
    updatedAt: 200,
  };
  m.apply({ panes: { p: u } });
  finish({
    panes: { p: { ...u, updatedAt: 100, tokens: { basis: "cumulative", total: 10 } } },
    accounts: [],
  });
  await vi.waitFor(() => expect(m.status).toBe("ready"));
  await Promise.resolve();
  expect(m.data.panes.p?.tokens.total).toBe(100);
  m.apply({ panes: { p: { ...u, updatedAt: 100 } } });
  expect(m.data.panes.p?.updatedAt).toBe(200);
});
it("ペインだけの先着差分でもsnapshotのアカウントを取り込む", async () => {
  let finish: (v: unknown) => void = () => {};
  const request = vi.fn(async (method: string) =>
    method === "agent.usage"
      ? new Promise((r) => {
          finish = r;
        })
      : {},
  );
  const m = new UsageModel({ request } as unknown as RequestPort, vi.fn());
  m.connected();
  m.sync(true);
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith("agent.usage", {}));
  m.apply({ panes: { p: null } });
  const account = {
    kind: "codex",
    accountKey: "a",
    label: "account",
    windows: [],
    source: "rollout" as const,
    asOf: 1,
  };
  finish({ panes: { p: null }, accounts: [account] });
  await vi.waitFor(() => expect(m.data.accounts).toEqual([account]));
});
it('後着snapshotの時刻がさらに新しいときはsnapshotを採用する',async()=>{
 let finish:(v:unknown)=>void=()=>{};const request=vi.fn(async(method:string)=>method==='agent.usage'?new Promise(r=>{finish=r;}):{});
 const m=new UsageModel({request} as unknown as RequestPort,vi.fn());m.connected();m.sync(true);await vi.waitFor(()=>expect(request).toHaveBeenCalledWith('agent.usage',{}));
 const u={paneId:'p',kind:'codex',model:null,tokens:{basis:'cumulative' as const,total:100},source:'rollout' as const,updatedAt:200};m.apply({panes:{p:u}});finish({panes:{p:{...u,updatedAt:300,tokens:{basis:'cumulative',total:200}}},accounts:[]});await vi.waitFor(()=>expect(m.data.panes.p?.tokens.total).toBe(200));
});
