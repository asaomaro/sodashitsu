import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { checkWorkAgentAsk } from "@sodashitsu/protocol";
import type { AskService } from "../ask/AskService.js";
import { createExclusive, privateDirs } from "./files.js";

/** Only normalized text crosses PCs. Referenced files are generated locally. */
export async function openWorkAgentAsk(
  asks: Pick<AskService, "open" | "onClientGone">,
  stateDir: string,
  owner: string,
  paneId: string,
  raw: unknown,
  guard: () => void,
) {
  const params = checkWorkAgentAsk(raw);
  guard();
  const directory = await privateDirs(stateDir, ["work-agent-asks", randomUUID()]),
    files: string[] = [];
  try {
    const view = [...params.view];
    for (const document of params.documents) {
      const file = join(directory, `${randomUUID()}.md`);
      await createExclusive(file, document.markdown);
      files.push(file);
      view.push({ title: document.title, file });
    }
    guard();
    const result = await asks.open(owner, {
      paneId,
      timeoutMs: params.timeoutMs,
      spec: { ...params.spec, ...(view.length ? { view } : {}) },
    });
    guard();
    return result;
  } finally {
    asks.onClientGone(owner);
    await Promise.allSettled(files.map((file) => rm(file, { force: true })));
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}
