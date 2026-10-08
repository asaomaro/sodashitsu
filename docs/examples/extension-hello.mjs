#!/usr/bin/env node
// pane ごとに、あいさつの帯を 1 つ出す、最小の拡張。
import { createInterface } from "node:readline";

const call = (method, params) => process.stdout.write(JSON.stringify({ method, params }) + "\n"); // id を省くと、返事は来ない
const lines = createInterface({ input: process.stdin });

lines.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === "ext.panes") {
    for (const pane of msg.panes) {
      call("display.set", { paneId: pane.id, name: "hello", kind: "band", format: "text", content: `こんにちは、${pane.workspaceLabel}` });
    }
  }
  // 知らない type の行は、無視する（後の版で増える）
});
lines.on("close", () => process.exit(0)); // 標準入力が閉じたら終わる（決まり）
