import { expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";
it("reserves one bottom row across screens and releases it when disabled", async () => {
  const h = await startedApp({
    rows: 30,
    respond: {
      "server.resources": {
        sampledAt: 1,
        cpuPercent: 25,
        cpuCount: 4,
        memoryTotalBytes: 8 * 1024 ** 3,
        memoryAvailableBytes: 2 * 1024 ** 3,
        serverRssBytes: 512 * 1024 ** 2,
        uptimeSeconds: 90000,
        loadAverage: null,
        hostname: "host",
      },
      "graph.get": { rev: 0, paused: false, nodes: [], links: [] },
      "schedule.list": { jobs: [], runs: [] },
    },
  });
  try {
    h.app.prefs.apply({ systemFooterSettings: { enabled: true, fields: ["cpu", "memory"] } }, 2);
    h.app.renderNow();
    await vi.waitFor(async () => expect((await h.screen()).split("\n")[29]).toContain("CPU 25%"));
    for (const screen of ["graph", "dashboard", "schedule"] as const) {
      h.app.ui.setScreen(screen);
      h.app.renderNow();
      expect((await h.screen()).split("\n")[29]).toContain("メモリ 6.0GiB/8.0GiB 75%");
    }
    h.app.prefs.apply({ systemFooterSettings: { enabled: true, fields: ["load"] } }, 3);
    h.app.renderNow();
    expect((await h.screen()).split("\n")[29]).toContain("選択した情報は利用できません");
    h.app.prefs.apply({ systemFooterSettings: { enabled: false, fields: ["cpu"] } }, 4);
    h.app.renderNow();
    expect((await h.screen()).split("\n")[29]).not.toContain("CPU 25%");
  } finally {
    await h.close();
  }
});
