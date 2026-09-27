import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { NotificationControllerKey } from "../injection.js";
import type { NotificationController } from "../notify/NotificationController.js";
import SettingsDialog from "./SettingsDialog.vue";

// 設定のダイアログを丸ごと描く。負荷の下で最大 3.3 秒かかった。上限はこのファイルにだけ効く（20260926-load-flaky-tests の D5）。
vi.setConfig({ testTimeout: 10_000 });

// 表（`store/stateIndicator.ts`）を差し替える。注記が表から組み立てられていれば、差し替えた字形と名前が出る。
// 直書きに戻すと、ここで元の字形（× ◐ ✓ ○ ·）が出て落ちる——表を 1 か所で変えたときに注記だけが古いまま残る壊れ方。
vi.mock("@sodashitsu/client-core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@sodashitsu/client-core")>();
  return { ...original, stateGlyph: (s: string | null) => (s ? `<${s}>` : ""), stateLabel: (s: string | null) => (s ? `名前-${s}` : null) };
});

describe("SettingsDialog — 表示の節の注記は状態の表から組み立てる（cross 点検）", () => {
  it("表を差し替えると、注記の字形と名前が追従する", () => {
    const controller = { desktopPermission: () => "granted", requestDesktopPermission: vi.fn(), unlockSound: vi.fn() } as unknown as NotificationController;
    const wrapper = mount(SettingsDialog, {
      global: { plugins: [createPinia()], provide: { [NotificationControllerKey as symbol]: controller } },
    });
    const note = wrapper.get('section[aria-labelledby="settings-display"] .settings-note').text();
    // 字形と名前は組にして並ぶ（review ラウンド1：列を分けると対応を順番で数えるしかない）。並びは優先度の高い順
    // （`STATE_PRIORITY`：blocked > done > working > idle > unknown）。
    expect(note).toContain("<blocked> 名前-blocked、<done> 名前-done、<working> 名前-working、<idle> 名前-idle、<unknown> 名前-unknown");
  });
});
