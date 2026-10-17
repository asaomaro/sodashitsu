#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { CdpCapture, CdpSocket } from "./cdp-client.mjs";
import { defaultProfilePath, readProfile, writeProfile, removeProfile, sodaOrigin, ResidentSession } from "./resident-bridge.mjs";

export function loopbackUrl(value, websocket = false) {
  const u = new URL(value);
  if (
    u.protocol !== (websocket ? "ws:" : "http:") ||
    !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.hash ||
    u.search ||
    (!websocket && u.pathname !== "/")
  )
    throw new Error("CDPにはWindows側のHTTP loopback URLを指定してください");
  return u;
}
export async function targets(endpoint) {
  const url = loopbackUrl(endpoint);
  url.pathname = "/json/list";
  let r;
  try {
    r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
  } catch (cause) {
    throw new Error(
      `Windows側のCDP接続先 ${url.href} に接続できません。CDPを有効にしたVSCodeが起動しているか、--cdp の接続先を確認してください。`,
      { cause },
    );
  }
  if (!r.ok) throw new Error("CDPの対象一覧を取得できません");
  const body = await r.text();
  if (body.length > 1024 * 1024) throw new Error("CDPの応答が大きすぎます");
  const list = JSON.parse(body);
  if (!Array.isArray(list)) throw new Error("CDPの対象一覧が不正です");
  return list.filter(
    (t) =>
      t.type === "page" &&
      typeof t.id === "string" &&
      typeof t.url === "string" &&
      /^(vscode-file:|file:)/.test(t.url) &&
      /\/workbench[^/]*\.html(?:[?#]|$)/.test(t.url) &&
      typeof t.webSocketDebuggerUrl === "string",
  );
}
export async function main(argv = process.argv.slice(2), { signal } = {}) {
  signal?.throwIfAborted();
  const args = new Map();
  const flags = new Set();
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (["--list", "--allow-input", "--allow-fit", "--remember"].includes(k)) flags.add(k);
    else if (["--soda", "--token", "--target", "--cdp", "--profile"].includes(k) && argv[i + 1])
      args.set(k, argv[++i]);
    else
      throw new Error(
        "引数: --cdp http://127.0.0.1:9222 [--list] / --soda URL --token TOKEN [--target ID] [--allow-input] [--allow-fit] [--remember] [--profile PATH]",
      );
  }
  if (flags.has("--allow-fit") && !flags.has("--allow-input"))
    throw new Error("--allow-fit には --allow-input が必要です");
  const profilePath = args.get("--profile") ?? defaultProfilePath();
  const initial = args.has("--soda") || args.has("--token");
  let profile = !initial && !flags.has("--list") ? await readProfile(profilePath) : null;
  if (profile && (["--cdp","--target"].some(k => args.has(k)) ||
      ["--allow-input","--allow-fit","--remember"].some(k => flags.has(k))))
    throw new Error("保存設定での起動には --profile 以外を指定しないでください。許可を変更する場合はブラウザで登録解除して再登録してください");
  const endpoint = profile?.endpoint ?? args.get("--cdp") ?? "http://127.0.0.1:9222";
  const list = await targets(endpoint);
  if (!list.length)
    throw new Error(
      "VSCodeのworkbenchが見つかりません。CDP有効で起動済みのVSCodeを指定してください（自動起動はしません）",
    );
  if (flags.has("--list")) {
    console.log(
      JSON.stringify(
        list.map(({ id, title, url }) => ({ id, title, url })),
        null,
        2,
      ),
    );
    return;
  }
  const token = args.get("--token");
  if (!profile && !/^[a-f0-9]{64}$/.test(token ?? ""))
    throw new Error("接続コマンドの一回限りのtokenが必要です");
  const soda = new URL(sodaOrigin(profile?.origin ?? args.get("--soda")));
  let target = list.find((t) => t.id === (profile?.targetId ?? args.get("--target")));
  if (!profile && args.has("--target") && !target) throw new Error("指定されたVSCodeの対象がありません");
  if (!target) {
    list.forEach((t, i) =>
      console.log(`${i + 1}: ${String(t.title ?? "").replace(/[\x00-\x1f\x7f]/g, " ")} [${t.id}]`),
    );
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const n = await rl.question("共有するVSCodeの番号（空欄は中止）: ");
      if (!/^[1-9][0-9]*$/.test(n)) throw new Error("中止しました");
      target = list[Number(n) - 1];
    } finally {
      rl.close();
    }
  }
  if (!target) throw new Error("対象の番号が不正です");
  const debug = loopbackUrl(target.webSocketDebuggerUrl, true);
  if (debug.port !== loopbackUrl(endpoint).port) throw new Error("CDPの接続先が一致しません");
  if (profile || flags.has("--remember")) {
    if (profile && profile.targetId !== target.id) {
      profile = {...profile, targetId:target.id};
      await writeProfile(profilePath, profile);
    }
    await runResident({profile, profilePath, token, origin:soda.origin, endpoint, target,
      allowInput:profile?.allowInput ?? flags.has("--allow-input"),
      allowFit:profile?.allowFit ?? flags.has("--allow-fit")});
    return;
  }
  const cdp = await CdpSocket.connect(debug.href);
  soda.pathname = "/desktop-cdp";
  soda.search = "?role=bridge";
  soda.protocol = soda.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(soda);
  let paired = false;
  let stopped = false;
  const capture = new CdpCapture(cdp, {
    frame: (m) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    },
    stopped: (reason) => {
      console.error(reason);
      ws.close();
      cdp.close();
    },
  });
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    await capture.stop();
    ws.close();
    cdp.close();
  };
  const onAbort = () => { void stop(); };
  const timer = setTimeout(() => {
    console.error("共有元を接続できませんでした");
    void stop();
  }, 10000);
  signal?.addEventListener("abort", onAbort, { once:true });
  if (signal?.aborted) { await stop(); return; }
  ws.addEventListener("open", () => {
    if (stopped) return;
    ws.send(
      JSON.stringify({
        type: "hello",
        token,
        title: String(target.title ?? "VSCode").slice(0, 256),
        allowInput: flags.has("--allow-input"),
        allowFit: flags.has("--allow-fit"),
      }),
    );
  });
  ws.addEventListener("message", (e) => {
    if (stopped) return;
    let m;
    try {
      m = JSON.parse(String(e.data));
    } catch {
      void stop();
      return;
    }
    if (m.type === "paired" && !paired) {
      paired = true;
      clearTimeout(timer);
      console.error(
        flags.has("--allow-input")
          ? "接続しました。ブラウザで操作を許可できます。"
          : "閲覧専用で接続しました",
      );
      void capture.start().catch(() => stop());
    } else if (m.type === "ack" && paired) capture.ack(m.seq);
    else if (m.type === "control" && paired)
      void capture.setControl(flags.has("--allow-input") && m.enabled === true);
    else if (m.type === "viewport" && paired && flags.has("--allow-fit"))
      void capture.setViewport(m.size);
    else if (m.type === "input" && paired && flags.has("--allow-input"))
      void capture.input(m.input);
  });
  ws.addEventListener("close", () => {
    clearTimeout(timer);
    void stop();
  });
  ws.addEventListener("error", () => {
    console.error("Sodashitsuへ接続できません");
    void stop();
  });
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}
export async function runResident({profile, profilePath, token, origin, endpoint, target, allowInput, allowFit}) {
  let stopping = false, current, pause, attempts = 0;
  const stop = () => { stopping = true; clearTimeout(pause?.timer); pause?.resolve(); current?.close(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    while (!stopping) {
      const soda = new URL(origin);
      soda.pathname = "/desktop-cdp"; soda.search = "?role=bridge";
      soda.protocol = soda.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(soda); current = ws;
      let authenticated = false, forbidden = false;
      const session = new ResidentSession({
        send: m => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); },
        close: () => ws.close(), allowInput, allowFit, deviceId:profile?.deviceId, canRegister:!profile,
        log: message => console.error(message),
        connectCdp: async () => {
          // Revalidate the saved target before every share. Never silently attach
          // to a different VSCode window after navigation or a window restart.
          const available = await targets(endpoint);
          const selected = available.find(item => item.id === target.id);
          if (!selected) throw new Error("選択したVSCodeがありません。ブリッジを再実行して選び直してください");
          const debug = loopbackUrl(selected.webSocketDebuggerUrl, true);
          if (debug.port !== loopbackUrl(endpoint).port) throw new Error("CDPの接続先が一致しません");
          return CdpSocket.connect(debug.href);
        },
        saveRegistration: async m => {
          const saved = {version:1,origin,endpoint,targetId:target.id,allowInput,allowFit,deviceId:m.deviceId,secret:m.secret};
          await writeProfile(profilePath, saved); profile = saved;
          console.error("登録を保存しました。次回は node ./cdp-bridge.mjs だけで接続できます");
        },
      });
      const timer = setTimeout(() => { if (!authenticated) ws.close(); }, 10000);
      await new Promise(resolve => {
        ws.addEventListener("open", () => {
          if (stopping) { ws.close(); return; }
          const policy = {title:String(target.title ?? "VSCode").slice(0,256),allowInput,allowFit};
          ws.send(JSON.stringify(profile ? {type:"resume",deviceId:profile.deviceId,secret:profile.secret,...policy}
            : {type:"hello",token,remember:true,...policy}));
        });
        ws.addEventListener("message", event => {
          let m;
          try { m = JSON.parse(String(event.data)); } catch { ws.close(); return; }
          if (m.type === "ready" || m.type === "registered") { authenticated = true; attempts = 0; clearTimeout(timer); }
          session.message(m);
        });
        ws.addEventListener("error", () => ws.close());
        ws.addEventListener("close", event => { forbidden = event.code === 4403; resolve(); }, {once:true});
      });
      clearTimeout(timer);
      await session.shutdown();
      if (forbidden) {
        if (profile) await removeProfile(profilePath, profile);
        console.error("登録が解除されました。ブラウザで新しい接続コマンドを発行してください");
        break;
      }
      if (stopping || !profile) break;
      const delay = Math.min(1000 * 2 ** Math.min(attempts++, 4), 10000);
      console.error("接続が切れました。再接続を待ちます");
      await new Promise(resolve => { pause = {resolve,timer:setTimeout(resolve,delay)}; });
      pause = undefined;
    }
  } finally { process.removeListener("SIGINT",stop); process.removeListener("SIGTERM",stop); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
