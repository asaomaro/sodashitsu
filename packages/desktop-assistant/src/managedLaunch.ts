import type { Readable } from "node:stream";
import { desktopAssistantOrigin } from "@sodashitsu/protocol";
/** One bounded bootstrap record. The parent's pipe is the process lifetime lease. */
export function managedLaunch(input: Readable, stop: () => void): Promise<{serverOrigin: string}> {
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + 5000;
    let buffer = "";
    let received = false;
    const fail = () => { clearTimeout(timer); reject(Error("sodaからの起動情報を確認できません")); stop(); };
    const timer = setTimeout(fail, 5000);
    input.setEncoding("utf8");
    input.on("data", (chunk: string) => {
      if (received) { fail(); return; }
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 4096) { fail(); return; }
      if (!buffer.includes("\n")) return;
      try {
        const value: unknown = JSON.parse(buffer);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
        const record = value as Record<string, unknown>;
        if (Object.keys(record).sort().join(",") !== "serverOrigin,version" || record.version !== 1 || typeof record.serverOrigin !== "string") throw Error();
        const serverOrigin = desktopAssistantOrigin(record.serverOrigin);
        if (performance.now() >= deadline) throw Error();
        received = true; buffer = ""; clearTimeout(timer); resolve({serverOrigin});
      } catch { fail(); }
    });
    input.once("end", () => { clearTimeout(timer); if (!received) reject(Error("sodaの接続が終了しました")); stop(); });
    input.once("error", fail);
    input.resume();
  });
}
