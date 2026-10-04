import { THEME_NAMES, type AgentIntegrationInstallResult, type AgentIntegrationStatusResult } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionDispatcherKey, DeviceKindKey, NotificationControllerKey } from "../injection.js";
import type { ActionDispatcher } from "../actions/ActionDispatcher.js";
import type { NotificationController } from "../notify/NotificationController.js";
import type { DesktopPermission } from "../notify/ports.js";
import { useAgentIntegrationsStore } from "../store/agentIntegrations.js";
import { useNotificationsStore } from "../store/notifications.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { readPrefs, useViewStore } from "../store/view.js";
import SettingsDialog from "./SettingsDialog.vue";

// 設定のダイアログを丸ごと描く。負荷の下で最大 5.7 秒かかって既定の 5 秒で落ちた。上限はこのファイルにだけ効く（20260926-load-flaky-tests の D5）。
vi.setConfig({ testTimeout: 15_000 });

let pinia: Pinia;

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
  // `happy-dom` の `<dialog>` は showModal/close を持たない場合があるので、必要な面だけ生やす。
  HTMLDialogElement.prototype.showModal ??= function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.open = false;
  };
});
afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

function makeController(opts: { permission?: DesktopPermission; requestResult?: DesktopPermission } = {}) {
  // **実物の `Notification.permission` は外で変わる**（利用者が許可する／ブラウザの設定を変える）。
  // 常に同じ値を返す偽物にすると、「許可を取っても画面が追従しない」穴が見えなくなる。
  let permission: DesktopPermission = opts.permission ?? "granted";
  const requestDesktopPermission = vi.fn(async () => {
    permission = opts.requestResult ?? "granted";
    return permission;
  });
  const unlockSound = vi.fn();
  const c = {
    desktopPermission: () => permission,
    requestDesktopPermission,
    unlockSound,
  } as unknown as NotificationController;
  return { c, requestDesktopPermission, unlockSound, setPermission: (p: DesktopPermission) => void (permission = p) };
}

async function openDialog(controller = makeController(), kind?: "desktop" | "mobile", actions?: Partial<ActionDispatcher>) {
  const view = useViewStore(pinia);
  // `DeviceKindKey` は既定値つきで受ける（provide しなければ "desktop"）。モバイルのテストだけ渡す。
  const provide: Record<symbol, unknown> = { [NotificationControllerKey as symbol]: controller.c };
  if (kind) provide[DeviceKindKey as symbol] = kind;
  // `ActionDispatcherKey` も既定では provide しない（節「エージェント連携」は握りつぶす設計。渡したテストだけ使う）。
  if (actions) provide[ActionDispatcherKey as symbol] = actions;
  const wrapper = mount(SettingsDialog, {
    global: { plugins: [pinia], provide },
    attachTo: document.body,
  });
  view.openDialogWithContext({ kind: "settings" });
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();
  return { wrapper, view, controller };
}

const switches = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => w.findAll('[role="switch"]');
/**
 * 「通知」節の中の switch だけ（20260921-herdr-settings-gaps で表示の節の switch が加わった）。
 * `switches(w)[0..2]` は通知の 3 つのまま（表示の節は後ろにある）なので、個々の操作のテストはそのまま使える。
 */
const notifySwitches = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
  w.findAll('section[aria-labelledby="settings-notify"] [role="switch"]');

describe("SettingsDialog — 通知の節 — 切り替え（AC6・AC-I2）", () => {
  // **decisions D2**：APG の switch は「on/off を表し、操作が即座に効く」もの。確定ボタンを置かない。
  it("3 つの切り替えを role=switch で出し、いまの値を aria-checked で示す", async () => {
    const { wrapper } = await openDialog();
    const sw = notifySwitches(wrapper);
    expect(sw).toHaveLength(3);
    expect(sw.map((s) => s.attributes("aria-checked"))).toEqual(["true", "false", "false"]); // 既定
    expect(sw.map((s) => s.element.tagName), "Tab で辿れる <button>").toEqual(["BUTTON", "BUTTON", "BUTTON"]);
  });

  it("押した時点で反映され、保存される（確定ボタンは無い）", async () => {
    const { wrapper } = await openDialog();
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);

    await switches(wrapper)[0]!.trigger("click");
    expect(useNotificationsStore(pinia).prefs.toast).toBe(false);
    expect(useNotificationsStore(createPinia()).prefs.toast, "再読み込みしても残る").toBe(false);
  });

  it("もう一度押すと戻る", async () => {
    const { wrapper } = await openDialog();
    await switches(wrapper)[2]!.trigger("click");
    expect(useNotificationsStore(pinia).prefs.sound).toBe(true);
    await switches(wrapper)[2]!.trigger("click");
    expect(useNotificationsStore(pinia).prefs.sound).toBe(false);
  });
});

// **AC8 と AC12 を取り違えない**——許可が無いだけなのか、環境が対応していないのか。
describe("SettingsDialog — 通知の節 — OS 通知の 4 状態（AC8・AC12）", () => {
  it("granted：普通に切り替えられる", async () => {
    const { wrapper } = await openDialog(makeController({ permission: "granted" }));
    const sw = switches(wrapper)[1]!;
    expect(sw.attributes("disabled")).toBeUndefined();
    await sw.trigger("click");
    expect(useNotificationsStore(pinia).prefs.desktop).toBe(true);
  });

  it("denied：押せなくして理由を出す", async () => {
    const { wrapper } = await openDialog(makeController({ permission: "denied" }));
    expect(switches(wrapper)[1]!.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("ブラウザで拒否されています");
  });

  // **AC7**：ページを開いただけでは求めない。押したときだけ。
  it("default：押すまで許可を求めない。押すと求める", async () => {
    const { wrapper, controller } = await openDialog(makeController({ permission: "default", requestResult: "granted" }));
    expect(controller.requestDesktopPermission, "開いただけでは呼ばない").not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("押すとブラウザに許可を求めます");

    await switches(wrapper)[1]!.trigger("click");
    await wrapper.vm.$nextTick();
    expect(controller.requestDesktopPermission).toHaveBeenCalledOnce();
    expect(useNotificationsStore(pinia).prefs.desktop).toBe(true);
  });

  // **`Notification.permission` は reactive ではない**ので、computed から呼ぶと最初の値で固まる。
  // 固まると、許可を取っても行が「切」のままで、**もう一度押しても切に戻せない**。
  it("許可を取ったら、その場で行が「入」に変わり、もう一度押せば「切」に戻せる", async () => {
    const { wrapper } = await openDialog(makeController({ permission: "default", requestResult: "granted" }));
    await switches(wrapper)[1]!.trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(switches(wrapper)[1]!.attributes("aria-checked"), "許可の後は「入」").toBe("true");
    expect(wrapper.text(), "「押すと求めます」は消える").not.toContain("押すとブラウザに許可を求めます");

    await switches(wrapper)[1]!.trigger("click");
    await wrapper.vm.$nextTick();
    expect(switches(wrapper)[1]!.attributes("aria-checked"), "切に戻せる").toBe("false");
    expect(useNotificationsStore(pinia).prefs.desktop).toBe(false);
  });

  // 外（ブラウザの設定）で変わることもある。開いたときに読み直す。
  it("開き直すと許可の状態を読み直す", async () => {
    const controller = makeController({ permission: "granted" });
    const { wrapper, view } = await openDialog(controller);
    expect(switches(wrapper)[1]!.attributes("disabled")).toBeUndefined();

    view.closeDialog();
    controller.setPermission("denied"); // 利用者がブラウザの設定で取り消した
    view.openDialogWithContext({ kind: "settings" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(switches(wrapper)[1]!.attributes("disabled"), "読み直して押せなくする").toBeDefined();
  });

  it("default で拒否されたら「入」にしない", async () => {
    const { wrapper } = await openDialog(makeController({ permission: "default", requestResult: "denied" }));
    await switches(wrapper)[1]!.trigger("click");
    await wrapper.vm.$nextTick();
    expect(useNotificationsStore(pinia).prefs.desktop).toBe(false);
  });

  it("この環境では使えない（実際に出そうとして失敗した）：押せなくして、その旨を出す", async () => {
    const { wrapper } = await openDialog();
    useNotificationsStore(pinia).desktopUsable = false;
    await wrapper.vm.$nextTick();
    expect(switches(wrapper)[1]!.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("この環境では使えません");
  });

  it("Notification が無い環境も同じ扱いにする（AC12）", async () => {
    const { wrapper } = await openDialog(makeController({ permission: "unsupported" }));
    expect(switches(wrapper)[1]!.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("この環境では使えません");
  });

  // 設定が「入」でも、許可が外れたら「切」に見せる（嘘をつかない）。
  it("設定が「入」でも、許可が無ければ「切」と示す", async () => {
    useNotificationsStore(pinia).setPrefs({ desktop: true });
    const { wrapper } = await openDialog(makeController({ permission: "denied" }));
    expect(switches(wrapper)[1]!.attributes("aria-checked")).toBe("false");
  });
});

describe("SettingsDialog — 通知の節 — 音（AC13）", () => {
  // 自動再生の解除は**利用者の操作の中**でしかできない。「入」にした瞬間がその機会。
  it("「入」にしたら自動再生を解除しにいく", async () => {
    const { wrapper, controller } = await openDialog();
    await switches(wrapper)[2]!.trigger("click");
    expect(controller.unlockSound).toHaveBeenCalledOnce();
  });

  it("「切」にするときは解除しにいかない", async () => {
    useNotificationsStore(pinia).setPrefs({ sound: true });
    const { wrapper, controller } = await openDialog();
    await switches(wrapper)[2]!.trigger("click");
    expect(controller.unlockSound).not.toHaveBeenCalled();
  });

  // review ラウンド1：「この環境では鳴らせない」と「この画面をまだ操作していない」は別の話。
  // 畳むと、**永久に鳴らない設定を利用者が「入」だと思い続ける**。
  it("音を鳴らせない環境では押せなくして、その旨を出す", async () => {
    useNotificationsStore(pinia).setPrefs({ sound: true });
    const { wrapper } = await openDialog();
    useNotificationsStore(pinia).soundUsable = false;
    await wrapper.vm.$nextTick();

    const sound = switches(wrapper)[2]!;
    expect(sound.attributes("disabled")).toBeDefined();
    expect(sound.attributes("aria-checked"), "「入」だと嘘をつかない").toBe("false");
    expect(wrapper.text()).toContain("この環境では音を鳴らせません");
  });

  it("鳴らせなかったときは理由を出す（黙って失敗しない）", async () => {
    const { wrapper } = await openDialog();
    expect(wrapper.text()).not.toContain("鳴らせませんでした");
    useNotificationsStore(pinia).soundBlocked = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("鳴らせませんでした");
  });
});

describe("SettingsDialog — 通知の節 — 開閉とフォーカス（AC-I1・AC-I4）", () => {
  it("Esc で閉じ、設定は保たれる", async () => {
    const { wrapper, view } = await openDialog();
    await switches(wrapper)[0]!.trigger("click");

    await wrapper.get("dialog").trigger("cancel");
    expect(view.dialogContext).toBeNull();
    expect(useNotificationsStore(pinia).prefs.toast, "閉じても押した結果が正典").toBe(false);
  });

  it("背景のクリックでも閉じる", async () => {
    const { wrapper, view } = await openDialog();
    await wrapper.get("dialog").trigger("click");
    expect(view.dialogContext).toBeNull();
  });

  it("開いたら最初の切り替えへフォーカスが移る", async () => {
    const { wrapper } = await openDialog();
    expect(document.activeElement).toBe(switches(wrapper)[0]!.element);
  });

  // 20260921-herdr-settings-gaps で見出し「設定」を持つようになった。名前は見出しを指す（文字を二重に持たない）。
  it("ダイアログに名前が付いている（読み上げで何の設定か分かる）", async () => {
    const { wrapper } = await openDialog();
    const id = wrapper.get("dialog").attributes("aria-labelledby");
    expect(id).toBe("settings-title");
    expect(wrapper.get(`#${id}`).text()).toBe("設定");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 20260921-herdr-settings-gaps：通知だけのダイアログを、見出しで節に分けた「設定」に広げた（20260921-theme-settings で「テーマ」を足して 4 節）。

const radios = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => w.findAll('input[type="radio"][name="settings-scrollback"]');
const checkedRadio = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
  radios(w).filter((r) => (r.element as HTMLInputElement).checked);
const radioLabel = (r: ReturnType<typeof radios>[number]) => r.element.parentElement!.textContent!.trim();

describe("SettingsDialog — 6 つの節（AC12）", () => {
  it("見出し「通知」「テーマ」「表示」「端末」「エージェント連携」「キー」の 6 節が、この順で 1 枚に並ぶ（テーマは 20260921-theme-settings、キーは 20260921-keybinding-customization、エージェント連携は 20260923-agent-session-resume で足した）", async () => {
    const { wrapper } = await openDialog();
    expect(wrapper.findAll("section h3").map((h) => h.text())).toEqual(["通知", "テーマ", "表示", "端末", "エージェント連携", "キー"]);
    // 節は見出しで名前が付いている（読み上げで節の名前が分かる）。
    for (const sec of wrapper.findAll("section")) {
      const id = sec.attributes("aria-labelledby")!;
      expect(sec.find(`#${id}`).exists(), `${id} の見出しがある`).toBe(true);
    }
  });
});

/** claude/codex 以外の6 kind は「未検出・未導入」の既定値で埋める（20260923-other-agents-session-resume）。 */
function defaultOtherAgentStatuses(): Omit<AgentIntegrationStatusResult["agents"], "claude" | "codex"> {
  const notInstalled = { cliDetected: false, installed: false } as const;
  return { cursor: notInstalled, copilot: notInstalled, devin: notInstalled, droid: notInstalled, grok: notInstalled, qwen: notInstalled };
}

function makeAgentIntegrationActions(status: AgentIntegrationStatusResult) {
  const refreshAgentIntegrationStatus = vi.fn(async () => {
    useAgentIntegrationsStore(pinia).setStatus(status);
  });
  const installAgentIntegration = vi.fn(async (): Promise<AgentIntegrationInstallResult> => ({ ok: true, message: null }));
  const uninstallAgentIntegration = vi.fn(async (): Promise<AgentIntegrationInstallResult> => ({ ok: true, message: null }));
  const setAgentIntegrationAutoResume = vi.fn(async () => undefined);
  const actions: Partial<ActionDispatcher> = {
    refreshAgentIntegrationStatus,
    installAgentIntegration,
    uninstallAgentIntegration,
    setAgentIntegrationAutoResume,
  };
  return { actions, refreshAgentIntegrationStatus, installAgentIntegration, uninstallAgentIntegration, setAgentIntegrationAutoResume };
}

const agentIntegrationSection = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => w.find('section[aria-labelledby="settings-agent-integration"]');

describe("SettingsDialog — 節「エージェント連携」（20260923-agent-session-resume・AC-I1〜AC-I5）", () => {
  it("開くたびに状態を取得する（client.hello のスナップショットに乗らないため）", async () => {
    const status: AgentIntegrationStatusResult = {
      autoResumeEnabled: true,
      agents: { claude: { cliDetected: true, installed: false }, codex: { cliDetected: false, installed: true }, ...defaultOtherAgentStatuses() },
    };
    const { actions, refreshAgentIntegrationStatus } = makeAgentIntegrationActions(status);
    const { wrapper } = await openDialog(makeController(), undefined, actions);

    expect(refreshAgentIntegrationStatus).toHaveBeenCalledTimes(1);
    const section = agentIntegrationSection(wrapper);
    expect(section.text()).toContain("Claude Code");
    expect(section.text()).toContain("未導入");
    expect(section.text()).toContain("Codex");
    expect(section.text()).toContain("導入済み");
    expect(section.text()).toContain("この PATH には見つかりません"); // codex は cliDetected: false
  });

  it("未導入なら「導入」ボタンで installAgentIntegration(kind) を呼ぶ（AC-I1）", async () => {
    const status: AgentIntegrationStatusResult = {
      autoResumeEnabled: true,
      agents: { claude: { cliDetected: true, installed: false }, codex: { cliDetected: true, installed: false }, ...defaultOtherAgentStatuses() },
    };
    const { actions, installAgentIntegration } = makeAgentIntegrationActions(status);
    const { wrapper } = await openDialog(makeController(), undefined, actions);

    const buttons = agentIntegrationSection(wrapper).findAll("button.settings-btn");
    await buttons[0]!.trigger("click");
    await wrapper.vm.$nextTick();

    expect(installAgentIntegration).toHaveBeenCalledWith("claude");
  });

  it("導入済みなら「解除」ボタンで uninstallAgentIntegration(kind) を呼ぶ（AC-I2）", async () => {
    const status: AgentIntegrationStatusResult = {
      autoResumeEnabled: true,
      agents: { claude: { cliDetected: true, installed: true }, codex: { cliDetected: true, installed: false }, ...defaultOtherAgentStatuses() },
    };
    const { actions, uninstallAgentIntegration } = makeAgentIntegrationActions(status);
    const { wrapper } = await openDialog(makeController(), undefined, actions);

    const buttons = agentIntegrationSection(wrapper).findAll("button.settings-btn");
    expect(buttons[0]!.text()).toBe("解除");
    await buttons[0]!.trigger("click");
    await wrapper.vm.$nextTick();

    expect(uninstallAgentIntegration).toHaveBeenCalledWith("claude");
  });

  it("自動再開の switch は現在値を反映し、押すと反転して setAgentIntegrationAutoResume を呼ぶ（AC-I4）", async () => {
    const status: AgentIntegrationStatusResult = {
      autoResumeEnabled: true,
      agents: { claude: { cliDetected: true, installed: true }, codex: { cliDetected: true, installed: false }, ...defaultOtherAgentStatuses() },
    };
    const { actions, setAgentIntegrationAutoResume } = makeAgentIntegrationActions(status);
    const { wrapper } = await openDialog(makeController(), undefined, actions);

    const sw = agentIntegrationSection(wrapper).find('[role="switch"]');
    expect(sw.attributes("aria-checked")).toBe("true");
    await sw.trigger("click");

    expect(setAgentIntegrationAutoResume).toHaveBeenCalledWith(false);
  });

  it("失敗を伝える文言をそのまま表示する", async () => {
    const status: AgentIntegrationStatusResult = {
      autoResumeEnabled: true,
      agents: { claude: { cliDetected: true, installed: false }, codex: { cliDetected: true, installed: false }, ...defaultOtherAgentStatuses() },
    };
    const { actions } = makeAgentIntegrationActions(status);
    actions.installAgentIntegration = vi.fn(async () => ({ ok: false, message: "設定ファイルを解釈できませんでした" }));
    const { wrapper } = await openDialog(makeController(), undefined, actions);

    const buttons = agentIntegrationSection(wrapper).findAll("button.settings-btn");
    await buttons[0]!.trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(agentIntegrationSection(wrapper).text()).toContain("設定ファイルを解釈できませんでした");
  });

  it("ActionDispatcher が provide されていなくても他の設定操作は壊れない（握りつぶす設計）", async () => {
    const { wrapper } = await openDialog();
    expect(agentIntegrationSection(wrapper).text()).toContain("確認中");
    // 通知の switch はそのまま押せる（他の節に影響しない。AC-I5）。
    await notifySwitches(wrapper)[0]!.trigger("click");
    expect(useNotificationsStore(pinia).prefs.toast).toBe(false);
  });
});

// 20260923-other-agents-session-resume（AC-I1〜AC-I4）。
describe("SettingsDialog — 節「エージェント連携」の6エージェント追加分", () => {
  it("6エージェントとも行が現れ、導入・解除の操作ができる", async () => {
    const status: AgentIntegrationStatusResult = {
      autoResumeEnabled: true,
      agents: {
        claude: { cliDetected: false, installed: false },
        codex: { cliDetected: false, installed: false },
        cursor: { cliDetected: true, installed: false },
        copilot: { cliDetected: true, installed: true },
        devin: { cliDetected: false, installed: false },
        droid: { cliDetected: true, installed: false },
        grok: { cliDetected: true, installed: false },
        qwen: { cliDetected: true, installed: false },
      },
    };
    const { actions, installAgentIntegration, uninstallAgentIntegration } = makeAgentIntegrationActions(status);
    const { wrapper } = await openDialog(makeController(), undefined, actions);

    const section = agentIntegrationSection(wrapper);
    for (const label of ["Cursor Agent CLI", "GitHub Copilot CLI", "Devin CLI", "Droid", "Grok CLI", "Qwen Code"]) {
      expect(section.text()).toContain(label);
    }

    const rows = section.findAll("li.agent-integration-row");
    expect(rows).toHaveLength(8); // claude・codex + 6

    // Copilot（3行目。claude・codex に続く）は導入済みなので「解除」ボタン
    const copilotButton = rows[3]!.find("button.settings-btn");
    expect(copilotButton.text()).toBe("解除");
    await copilotButton.trigger("click");
    await wrapper.vm.$nextTick();
    expect(uninstallAgentIntegration).toHaveBeenCalledWith("copilot");

    // Grok（6行目）は未導入なので「導入」ボタン
    const grokButton = rows[6]!.find("button.settings-btn");
    expect(grokButton.text()).toBe("導入");
    await grokButton.trigger("click");
    await wrapper.vm.$nextTick();
    expect(installAgentIntegration).toHaveBeenCalledWith("grok");
  });

  it("他の設定項目のテンプレート・操作性に影響しない（AC-I4）", async () => {
    const status: AgentIntegrationStatusResult = {
      autoResumeEnabled: true,
      agents: { claude: { cliDetected: false, installed: false }, codex: { cliDetected: false, installed: false }, ...defaultOtherAgentStatuses() },
    };
    const { actions } = makeAgentIntegrationActions(status);
    const { wrapper } = await openDialog(makeController(), undefined, actions);
    // 通知の switch（別の節）は影響を受けずそのまま押せる。
    await notifySwitches(wrapper)[0]!.trigger("click");
    expect(useNotificationsStore(pinia).prefs.toast).toBe(false);
  });
});

describe("SettingsDialog — 表示の節（AC6・AC7・AC-I2）", () => {
  const symbolsSwitch = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    w.get('section[aria-labelledby="settings-display"] [role="switch"]');

  it("記号表示の switch は既定で「入」", async () => {
    const { wrapper } = await openDialog();
    expect(symbolsSwitch(wrapper).attributes("aria-checked")).toBe("true");
  });

  it("押すと「切」になって保存され、もう一度押すと戻る（確定ボタンは無い）", async () => {
    const { wrapper } = await openDialog();
    await symbolsSwitch(wrapper).trigger("click");
    expect(useSettingsStore(pinia).statusSymbols).toBe(false);
    expect(symbolsSwitch(wrapper).attributes("aria-checked")).toBe("false");
    expect(useSettingsStore(createPinia()).statusSymbols, "再読み込みしても残る").toBe(false);
    await symbolsSwitch(wrapper).trigger("click");
    expect(useSettingsStore(pinia).statusSymbols).toBe(true);
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);
  });
});

// 20260922-appearance-settings-rest T5（design「振る舞いの詳細」US4）。
describe("SettingsDialog — 表示の節 — pane の枠・隙間の太さ／エージェント名表示（AC9〜AC12・AC-I1〜AC-I4）", () => {
  const displaySection = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    w.get('section[aria-labelledby="settings-display"]');
  const frameRadios = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    displaySection(w).findAll('input[type="radio"][name="settings-pane-frame-thickness"]');
  const checkedFrameRadio = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    frameRadios(w).filter((r) => (r.element as HTMLInputElement).checked);
  const radioValue = (r: ReturnType<typeof frameRadios>[number]): string => (r.element as HTMLInputElement).value;
  // 表示の節の switch は2つ（記号表示・エージェント名表示）。**並び順（何番目か）には頼らない**
  // ——`symbolsSwitch`（先頭固定）と違い、この節は switch が今回 1→2 に増えた実績があり、今後も
  // 増えうる。並び替え・追加があっても無言で違うボタンを拾わないよう、文言で絞る（taskcheck の指摘）。
  const agentNameSwitch = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    displaySection(w)
      .findAll('[role="switch"]')
      .find((sw) => sw.text().includes("エージェント名"))!;

  it("枠の太さは既定で選ばれ、選ぶと保存されて再読み込みしても残る（AC9）", async () => {
    const { wrapper } = await openDialog();
    expect(checkedFrameRadio(wrapper).map(radioValue)).toEqual(["default"]);

    const thick = frameRadios(wrapper).find((r) => radioValue(r) === "thick")!;
    await thick.trigger("change");
    expect(useSettingsStore(pinia).paneFrameThickness).toBe("thick");
    expect(readPrefs()["paneFrameThickness"]).toBe("thick");
    expect(useSettingsStore(createPinia()).paneFrameThickness, "再読み込みしても残る").toBe("thick");
    await wrapper.vm.$nextTick();
    expect(checkedFrameRadio(wrapper).map(radioValue)).toEqual(["thick"]); // 常にちょうど1つ
  });

  it("エージェント名表示の switch は既定で「切」（AC10）", async () => {
    const { wrapper } = await openDialog();
    expect(agentNameSwitch(wrapper).attributes("aria-checked")).toBe("false");
  });

  it("押すと「入」になって保存され、もう一度押すと戻る（確定ボタンは無い。AC-I2）", async () => {
    const { wrapper } = await openDialog();
    await agentNameSwitch(wrapper).trigger("click");
    expect(useSettingsStore(pinia).paneAgentNameVisible).toBe(true);
    expect(agentNameSwitch(wrapper).attributes("aria-checked")).toBe("true");
    expect(useSettingsStore(createPinia()).paneAgentNameVisible, "再読み込みしても残る").toBe(true);
    await agentNameSwitch(wrapper).trigger("click");
    expect(useSettingsStore(pinia).paneAgentNameVisible).toBe(false);
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);
  });

  it("枠の太さ・エージェント名表示のどちらも、開閉の概念を持たない常設の部品（AC-I1）", async () => {
    const { wrapper } = await openDialog();
    // ダイアログの外の状態（`view.openDialog` 等）を変えずに、いつでも存在・操作できる
    // （個別の開閉フラグや別ダイアログを持たない）ことを、部品が最初から見えていることで確かめる。
    expect(frameRadios(wrapper).length).toBeGreaterThan(0);
    expect(agentNameSwitch(wrapper).exists()).toBe(true);
  });

  it("選んでもフォーカスは選んだ部品に留まる（AC-I4）", async () => {
    const { wrapper } = await openDialog();
    const thick = frameRadios(wrapper).find((r) => radioValue(r) === "thick")!;
    (thick.element as HTMLInputElement).focus();
    await thick.trigger("change");
    expect(document.activeElement).toBe(thick.element);

    const sw = agentNameSwitch(wrapper);
    (sw.element as HTMLButtonElement).focus();
    await sw.trigger("click");
    expect(document.activeElement).toBe(sw.element);
  });

  it("矢印キー（radio）・Enter/Space（switch）という既存の操作方法で操作できる（AC-I3）", async () => {
    const { wrapper } = await openDialog();
    // ネイティブの radio/button の既定の操作方法をそのまま使っているだけ（独自の keydown 処理を
    // 足していない）ことを、type 属性・role 属性の実物で確かめる（実際のキー操作は jsdom/happy-dom
    // ではネイティブのフォーカス移動・活性化を再現しないため、E2E 側で実際の Tab/Enter を確かめる）。
    for (const r of frameRadios(wrapper)) expect(r.attributes("type")).toBe("radio");
    expect(agentNameSwitch(wrapper).element.tagName).toBe("BUTTON");
    expect(agentNameSwitch(wrapper).attributes("type")).toBe("button");
  });
});

describe("SettingsDialog — 表示の節 — tab バーの位置・右端エントリ・pane の外周（20260922-tabbar-pane-appearance。PR #12 から取り込み）", () => {
  const displaySection = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    w.get('section[aria-labelledby="settings-display"]');
  const positionSelect = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    displaySection(w).get("select") as unknown as { element: HTMLSelectElement };
  const outerBordersSwitch = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    displaySection(w)
      .findAll('[role="switch"]')
      .find((sw) => sw.text().includes("外周"))!;
  const addEntryButton = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    displaySection(w).get("[data-add-entry]");
  const removeEntryButtons = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    displaySection(w).findAll("[data-remove-entry]");

  it("位置は既定で「上」、選ぶと保存されて再読み込みしても残る（AC1 相当）", async () => {
    const { wrapper } = await openDialog();
    expect(positionSelect(wrapper).element.value).toBe("top");

    positionSelect(wrapper).element.value = "bottom";
    await positionSelect(wrapper).element.dispatchEvent(new Event("change"));
    expect(useSettingsStore(pinia).tabBarPosition).toBe("bottom");
    expect(readPrefs()["tabBarPosition"]).toBe("bottom");
    expect(useSettingsStore(createPinia()).tabBarPosition, "再読み込みしても残る").toBe("bottom");
  });

  it("外周の枠の switch は既定で「切」。押すと「入」になって保存される", async () => {
    const { wrapper } = await openDialog();
    expect(outerBordersSwitch(wrapper).attributes("aria-checked")).toBe("false");
    await outerBordersSwitch(wrapper).trigger("click");
    expect(useSettingsStore(pinia).paneOuterBorders).toBe(true);
    expect(outerBordersSwitch(wrapper).attributes("aria-checked")).toBe("true");
    expect(useSettingsStore(createPinia()).paneOuterBorders, "再読み込みしても残る").toBe(true);
  });

  it("右端エントリを追加・削除でき、削除すると増減が反映される", async () => {
    const { wrapper } = await openDialog();
    expect(removeEntryButtons(wrapper)).toHaveLength(0);

    await addEntryButton(wrapper).trigger("click"); // 既定の種類（先頭＝拡大の状態）
    expect(useSettingsStore(pinia).tabBarRight).toEqual([{ kind: "zoom" }]);
    await wrapper.vm.$nextTick();
    expect(removeEntryButtons(wrapper)).toHaveLength(1);

    await removeEntryButtons(wrapper)[0]!.trigger("click");
    expect(useSettingsStore(pinia).tabBarRight).toEqual([]);
    await wrapper.vm.$nextTick();
    expect(removeEntryButtons(wrapper)).toHaveLength(0);
  });

  it("上限（16件）に達すると［追加］が無効になる", async () => {
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    for (let i = 0; i < 16; i++) settings.addTabBarRightEntry("zoom");
    await wrapper.vm.$nextTick();
    expect((addEntryButton(wrapper).element as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("SettingsDialog — 端末の節（AC9・AC-I2）", () => {
  it("既定は「自動」が選ばれ、デスクトップではサーバの上限の行数を添える", async () => {
    const { wrapper } = await openDialog();
    const checked = checkedRadio(wrapper);
    expect(checked).toHaveLength(1);
    expect(radioLabel(checked[0]!)).toBe("自動（この端末では 5,000 行）");
    // 選択肢はサーバの上限（既定 5,000）以下だけ。
    expect(radios(wrapper).map(radioLabel)).toEqual(["自動（この端末では 5,000 行）", "1,000 行", "2,000 行", "5,000 行"]);
  });

  // モバイルの利用者が「自動＝何行か」を知る手段がほかに無い。
  it("モバイルでは「自動」に 1,000 行と添える", async () => {
    const { wrapper } = await openDialog(makeController(), "mobile");
    expect(radioLabel(checkedRadio(wrapper)[0]!)).toBe("自動（この端末では 1,000 行）");
  });

  // テストの側で `.checked` を入れない——入れると「その行が選ばれる」が自分の入れた状態を読むだけになる。
  // 選ばれて見えるのは部品の `:checked`（保存した値から決まる）であることを見る。
  it("行を選ぶと保存され、その行が選ばれる（確定ボタンは無い）", async () => {
    const { wrapper } = await openDialog();
    await radios(wrapper).find((r) => radioLabel(r) === "2,000 行")!.trigger("change");
    expect(useSettingsStore(pinia).scrollback).toBe(2000);
    expect(useSettingsStore(createPinia()).scrollback, "再読み込みしても残る").toBe(2000);
    expect(checkedRadio(wrapper).map(radioLabel)).toEqual(["2,000 行"]);

    await radios(wrapper)[0]!.trigger("change");
    expect(useSettingsStore(pinia).scrollback).toBe("auto");
    expect(checkedRadio(wrapper).map(radioLabel)).toEqual(["自動（この端末では 5,000 行）"]);
  });

  // 実物の App は起動時にこのダイアログを取り付け（`App.vue`）、そのときの `limits` は既定の 5,000。本当の上限は後から
  // snapshot で届く——**開いた後の変化に追従すること**が本番の道（decisions D5 が computed を選んだ理由）。
  it("取り付けた後にサーバの上限が届くと、「自動」の行数・選択肢・選ばれている行が追従する", async () => {
    useSettingsStore(pinia).setScrollback(10000);
    const { wrapper } = await openDialog();
    expect(checkedRadio(wrapper).map(radioLabel), "上限 5,000 で押さえた行").toEqual(["5,000 行"]);

    useSessionStore(pinia).limits = { scrollbackLines: 10000 };
    await wrapper.vm.$nextTick();
    expect(radios(wrapper).map(radioLabel)).toEqual(["自動（この端末では 10,000 行）", "1,000 行", "2,000 行", "5,000 行", "10,000 行"]);
    expect(checkedRadio(wrapper).map(radioLabel), "上限が上がれば保存値そのものの行").toEqual(["10,000 行"]);
  });

  it("設定の値が外から変わると、選ばれている行も移る", async () => {
    const { wrapper } = await openDialog();
    useSettingsStore(pinia).setScrollback(1000);
    await wrapper.vm.$nextTick();
    expect(checkedRadio(wrapper).map(radioLabel)).toEqual(["1,000 行"]);
  });

  it("サーバの上限を超える値は選択肢に出さない", async () => {
    useSessionStore(pinia).limits = { scrollbackLines: 3000 };
    const { wrapper } = await openDialog();
    expect(radios(wrapper).map(radioLabel)).toEqual(["自動（この端末では 3,000 行）", "1,000 行", "2,000 行", "3,000 行"]);
  });

  // D5：ダイアログでは**いつもちょうど 1 つ**の行が選ばれている。
  it("保存値がサーバの上限を超えていたら、押さえた値（＝上限）の行が選ばれる（保存値は書き換えない）", async () => {
    useSettingsStore(pinia).setScrollback(10000);
    const { wrapper } = await openDialog();
    expect(checkedRadio(wrapper).map(radioLabel)).toEqual(["5,000 行"]);
    expect(useSettingsStore(pinia).scrollback).toBe(10000);
  });

  it("上限以下で段階に無い保存値は、選択肢に足されて選ばれる", async () => {
    useSessionStore(pinia).limits = { scrollbackLines: 10000 };
    useSettingsStore(pinia).setScrollback(3000);
    const { wrapper } = await openDialog();
    expect(checkedRadio(wrapper).map(radioLabel)).toEqual(["3,000 行"]);
  });
});

describe("SettingsDialog — 閉じても押した結果は残る（AC-I1）", () => {
  // モバイルには Esc キーが無く、ダイアログが画面いっぱいだと背景のタップの余地も無い（review ラウンド1）。
  it("「閉じる」で閉じても、押した結果は残る（確定ボタンではない）", async () => {
    const { wrapper, view } = await openDialog();
    await wrapper.get('section[aria-labelledby="settings-display"] [role="switch"]').trigger("click");
    const close = wrapper.findAll("button").find((b) => b.text() === "閉じる")!;
    expect(close.attributes("type")).toBe("button");
    await close.trigger("click");
    expect(view.dialogContext).toBeNull();
    expect(useSettingsStore(pinia).statusSymbols).toBe(false);
  });

  it("背景のクリックで閉じても、表示の節と端末の節の変更は残る", async () => {
    const { wrapper, view } = await openDialog();
    await wrapper.get('section[aria-labelledby="settings-display"] [role="switch"]').trigger("click");
    await radios(wrapper).find((r) => radioLabel(r) === "1,000 行")!.trigger("change");
    await wrapper.get("dialog").trigger("click");
    expect(view.dialogContext).toBeNull();
    expect(useSettingsStore(pinia).statusSymbols).toBe(false);
    expect(useSettingsStore(pinia).scrollback).toBe(1000);
  });
});

// 新しく開く場所（20260921-new-terminal-cwd の design D8）。
describe("SettingsDialog — 端末の節 — 新しく開く場所（AC4・AC10・AC-I1・AC-I2）", () => {
  const cwdRadios = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    w.findAll('input[type="radio"][name="settings-new-cwd"]');
  const checkedCwd = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    cwdRadios(w)
      .filter((r) => (r.element as HTMLInputElement).checked)
      .map(radioLabel);
  const pathField = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    w.get<HTMLInputElement>('input[type="text"][aria-label="指定した場所のパス"]');

  it("端末の節に 4 つの方針が並び、既定は「引き継ぐ」（AC4）", async () => {
    const { wrapper } = await openDialog();
    const section = wrapper.get('section[aria-labelledby="settings-terminal"]');
    expect(section.findAll('input[name="settings-new-cwd"]')).toHaveLength(4);
    expect(cwdRadios(wrapper).map(radioLabel)).toEqual([
      "引き継ぐ（いま見ている pane の場所）",
      "ホーム",
      "サーバを起動した場所",
      "指定した場所",
    ]);
    expect(checkedCwd(wrapper)).toEqual(["引き継ぐ（いま見ている pane の場所）"]);
  });

  it("方針は選んだ時点で保存され、その行が選ばれる（確定ボタンは無い）", async () => {
    const { wrapper } = await openDialog();
    await cwdRadios(wrapper)[1]!.trigger("change");
    expect(useSettingsStore(pinia).newCwdPolicy).toBe("home");
    expect(useSettingsStore(createPinia()).newCwdPolicy, "再読み込みしても残る").toBe("home");
    expect(checkedCwd(wrapper)).toEqual(["ホーム"]);
  });

  it("パスの入力欄は「指定した場所」を選んでいる間だけ使える", async () => {
    const { wrapper } = await openDialog();
    expect(pathField(wrapper).element.disabled).toBe(true);
    await cwdRadios(wrapper)[3]!.trigger("change");
    expect(pathField(wrapper).element.disabled).toBe(false);
    await cwdRadios(wrapper)[2]!.trigger("change");
    expect(pathField(wrapper).element.disabled).toBe(true);
  });

  /** 打つ（`input` だけを起こす）。`setValue` は `change` も起こすので、打っている途中の再現には使わない。 */
  async function typeInto(field: ReturnType<typeof pathField>, value: string): Promise<void> {
    field.element.value = value;
    await field.trigger("input");
  }

  // AC-I2：打ちかけの途中の値で開いてしまわない。
  it("パスは打っている途中（input・Enter 以外のキー）では保存せず、入れ終えたとき（change）に保存する", async () => {
    useSettingsStore(pinia).setNewCwdPolicy("path");
    const { wrapper } = await openDialog();
    const field = pathField(wrapper);
    await typeInto(field, "~/wo");
    await field.trigger("keydown", { key: "o" });
    expect(useSettingsStore(pinia).newCwdPath, "打っている途中").toBe("");
    await typeInto(field, "~/work");
    await field.trigger("change");
    expect(useSettingsStore(pinia).newCwdPath).toBe("~/work");
    expect(useSettingsStore(createPinia()).newCwdPath, "再読み込みしても残る").toBe("~/work");
  });

  it("Enter でも保存する。ただし IME の変換を確定する Enter では保存しない", async () => {
    useSettingsStore(pinia).setNewCwdPolicy("path");
    const { wrapper } = await openDialog();
    const field = pathField(wrapper);
    await typeInto(field, "~/ドキュメント");
    await field.trigger("keydown", { key: "Enter", isComposing: true });
    await field.trigger("keydown", { key: "Enter", keyCode: 229 }); // Safari は確定の keydown で isComposing が false
    expect(useSettingsStore(pinia).newCwdPath, "変換の確定では保存しない").toBe("");
    await field.trigger("keydown", { key: "Enter" });
    expect(useSettingsStore(pinia).newCwdPath).toBe("~/ドキュメント");
  });

  it("同じ値なら保存し直さない", async () => {
    const store = useSettingsStore(pinia);
    store.setNewCwdPolicy("path");
    store.setNewCwdPath("~/same");
    const saved: unknown[] = [];
    store.$onAction(({ name, args }) => {
      if (name === "setNewCwdPath") saved.push(args[0]);
    });
    const { wrapper } = await openDialog();
    await pathField(wrapper).trigger("change");
    await pathField(wrapper).trigger("keydown", { key: "Enter" });
    expect(saved).toEqual([]);
  });

  // 閉じる操作は取り消しではない（design D8 の「離れたとき」。decisions D8）。Chromium は閉じてフォーカスが外れると `change` を立てるが、
  // happy-dom は立てないので、ここで通るのは閉じる側で確定しているから。
  it.each([
    ["Esc", (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => w.get("dialog").trigger("cancel")],
    ["閉じる", (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => w.findAll("button").find((b) => b.text() === "閉じる")!.trigger("click")],
    ["背景", (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => w.get("dialog").trigger("click")],
  ])("打ちかけのまま閉じても（%s）、入れた値は保存される（AC-I1）", async (_label, close) => {
    useSettingsStore(pinia).setNewCwdPolicy("path");
    useSettingsStore(pinia).setNewCwdPath("~/saved");
    const { wrapper, view } = await openDialog();
    await typeInto(pathField(wrapper), "~/typed");
    await close(wrapper);
    expect(view.dialogContext).toBeNull();
    expect(useSettingsStore(pinia).newCwdPath).toBe("~/typed");
  });

  // 開いている間にほかの状態で描き直されても、打ちかけの文字を保存値で上書きしない（`:value` の一方向の結び付けだと上書きされる）。
  it("開いている間に描き直されても、打ちかけの文字は消えない", async () => {
    useSettingsStore(pinia).setNewCwdPolicy("path");
    useSettingsStore(pinia).setNewCwdPath("~/saved");
    const { wrapper } = await openDialog();
    await typeInto(pathField(wrapper), "~/half");
    useNotificationsStore(pinia).soundBlocked = true; // 通知の節の注記が変わる＝ダイアログが描き直される
    await wrapper.vm.$nextTick();
    expect(pathField(wrapper).element.value).toBe("~/half");
  });

  it("開き直すと、入力欄は保存した値から始まる", async () => {
    useSettingsStore(pinia).setNewCwdPolicy("path");
    const { wrapper, view } = await openDialog();
    await typeInto(pathField(wrapper), "~/one");
    await wrapper.get("dialog").trigger("cancel");
    useSettingsStore(pinia).setNewCwdPath("~/changed-elsewhere");
    view.openDialogWithContext({ kind: "settings" });
    await wrapper.vm.$nextTick();
    expect(pathField(wrapper).element.value).toBe("~/changed-elsewhere");
  });

  it("入力欄に名前と注記が付いている（読み上げでパスの欄と分かる）", async () => {
    const { wrapper } = await openDialog();
    const field = pathField(wrapper);
    const noteId = field.attributes("aria-describedby")!;
    expect(wrapper.get(`#${noteId}`).text()).toContain("絶対パスか ~/ で始まるパス");
  });

  it("閉じても選んだ方針と入れたパスは残る（AC-I1）", async () => {
    const { wrapper, view } = await openDialog();
    await cwdRadios(wrapper)[3]!.trigger("change");
    await typeInto(pathField(wrapper), "~/p");
    await pathField(wrapper).trigger("change");
    await wrapper.findAll("button").find((b) => b.text() === "閉じる")!.trigger("click");
    expect(view.dialogContext).toBeNull();
    expect(useSettingsStore(pinia).newCwdPolicy).toBe("path");
    expect(useSettingsStore(pinia).newCwdPath).toBe("~/p");
  });
});

// シェルの場所を追う（Windows。20260928-windows-pane-cwd の D-6）。
describe("SettingsDialog — 端末の節 — シェルの場所を追う（AC6）", () => {
  const trackingSwitch = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    w
      .get('section[aria-labelledby="settings-terminal"]')
      .findAll('[role="switch"]')
      .find((sw) => sw.text().includes("シェルの場所を追う（Windows）"))!;

  it("端末の節に switch があり、既定は「入」。説明に「新しく開く pane から効く」と書く", async () => {
    const { wrapper } = await openDialog();
    const sw = trackingSwitch(wrapper);
    expect(sw.attributes("aria-checked")).toBe("true");
    expect(sw.text()).toContain("入");
    const note = document.getElementById(sw.attributes("aria-describedby")!)!;
    expect(note.textContent).toContain("新しく開く pane から効きます");
  });

  it("押すと「切」になって共有の設定に保存され、もう一度押すと戻る（確定ボタンは無い）", async () => {
    const { wrapper } = await openDialog();
    await trackingSwitch(wrapper).trigger("click");
    expect(useSettingsStore(pinia).shellCwdTracking).toBe(false);
    expect(readPrefs()["shellCwdTracking"]).toBe(false);
    expect(trackingSwitch(wrapper).attributes("aria-checked")).toBe("false");
    expect(useSettingsStore(createPinia()).shellCwdTracking, "再読み込みしても残る").toBe(false);
    await trackingSwitch(wrapper).trigger("click");
    expect(useSettingsStore(pinia).shellCwdTracking).toBe(true);
    expect(readPrefs()["shellCwdTracking"]).toBe(true);
  });

  it("保存値が切なら「切」で開く", async () => {
    localStorage.setItem("soda.prefs.v1", JSON.stringify({ shellCwdTracking: false }));
    pinia = createPinia();
    const { wrapper } = await openDialog();
    expect(trackingSwitch(wrapper).attributes("aria-checked")).toBe("false");
  });
});

// 20260926-pane-frame-auto-mode（design「振る舞いの詳細」設定画面）。
describe("SettingsDialog — 表示の節 — pane の枠の表示・隙間（AC6・AC-I1〜AC-I4）", () => {
  const displaySection = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    w.get('section[aria-labelledby="settings-display"]');
  const bordersRadios = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    displaySection(w).findAll('input[type="radio"][name="settings-pane-borders"]');
  const checkedBorders = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    bordersRadios(w)
      .filter((r) => (r.element as HTMLInputElement).checked)
      .map((r) => (r.element as HTMLInputElement).value);
  const gapsSwitch = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) =>
    displaySection(w)
      .findAll('[role="switch"]')
      .find((sw) => sw.text().includes("隙間を空ける"))!;

  it("「表示」節に 3 値のラジオ（同じ name の 1 群）と説明があり、既定は「常に」（AC-I1・AC-I3）", async () => {
    const { wrapper } = await openDialog();
    expect(bordersRadios(wrapper).map((r) => (r.element as HTMLInputElement).value)).toEqual(["always", "auto", "off"]);
    expect(checkedBorders(wrapper)).toEqual(["always"]);
    const fieldset = bordersRadios(wrapper)[0]!.element.closest("fieldset")!;
    expect(fieldset.querySelector("legend")!.textContent).toBe("pane の枠の表示");
    const note = document.getElementById(fieldset.getAttribute("aria-describedby")!)!;
    expect(note.textContent).toContain("右クリック");
    expect(note.textContent).toContain("Tab");
  });

  it("選ぶとその場で反映・保存され、フォーカスはそのラジオに留まる。閉じても値は残る（AC6・AC-I1・AC-I2・AC-I4）", async () => {
    const { wrapper, view } = await openDialog();
    // 値ごとに選ぶ（選んだラジオの値がそのまま渡ることを確かめる。taskcheck T5）。
    for (const value of ["off", "always", "auto"]) {
      const radio = bordersRadios(wrapper).find((r) => (r.element as HTMLInputElement).value === value)!;
      (radio.element as HTMLInputElement).focus();
      await radio.trigger("change");
      expect(useSettingsStore(pinia).paneBorders, value).toBe(value);
      expect(readPrefs()["paneBorders"], value).toBe(value);
      await wrapper.vm.$nextTick();
      expect(checkedBorders(wrapper), value).toEqual([value]);
      expect(document.activeElement, value).toBe(radio.element);
    }
    view.closeDialog();
    await wrapper.vm.$nextTick();
    expect(useSettingsStore(pinia).paneBorders, "閉じても取り消されない").toBe("auto");
    expect(useSettingsStore(createPinia()).paneBorders, "再読み込みしても残る").toBe("auto");
  });

  it("隙間の switch は button（Space/Enter で押せる）で既定「入」。押すと「切」になり保存され、フォーカスは留まる（AC6・AC-I2〜AC-I4）", async () => {
    const { wrapper } = await openDialog();
    const sw = gapsSwitch(wrapper);
    expect(sw.element.tagName).toBe("BUTTON");
    expect(document.getElementById(sw.attributes("aria-describedby")!)!.textContent).toContain("隙間を切ったとき");
    expect(sw.attributes("aria-checked")).toBe("true");
    (sw.element as HTMLButtonElement).focus();
    await sw.trigger("click");
    expect(useSettingsStore(pinia).paneGaps).toBe(false);
    expect(sw.attributes("aria-checked")).toBe("false");
    expect(readPrefs()["paneGaps"]).toBe(false);
    expect(document.activeElement).toBe(sw.element);
    await sw.trigger("click");
    expect(useSettingsStore(pinia).paneGaps, "押し直すと元に戻る").toBe(true);
  });
});

// 20260921-theme-settings：テーマの節（design D4・decisions D11。AC1・AC5〜AC7・AC-I2・AC-I4）。
describe("SettingsDialog — テーマの節", () => {
  const themeSection = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => w.get('section[aria-labelledby="settings-theme"]');
  const selects = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => themeSection(w).findAll("select");

  it("「テーマ」の選択肢は 17 個（暗い 10・明るい 7 の 2 群）で、dracula に「（既定）」。いまの値が選ばれている", async () => {
    const { wrapper } = await openDialog();
    const [main] = selects(wrapper);
    const groups = main!.findAll("optgroup");
    expect(groups.map((g) => g.attributes("label"))).toEqual(["暗いテーマ", "明るいテーマ"]);
    expect(groups.map((g) => g.findAll("option").length)).toEqual([10, 7]);
    expect(main!.findAll("option").map((o) => o.attributes("value")).sort()).toEqual([...THEME_NAMES].sort());
    expect(main!.find('option[value="dracula"]').text()).toBe("Dracula（既定）");
    expect((main!.element as HTMLSelectElement).value).toBe("dracula");
    // 自動の切替が切の間は、明るいとき・暗いときの欄は出さない。
    expect(selects(wrapper)).toHaveLength(1);
    expect(themeSection(wrapper).get("#settings-theme-note").text()).toBe("いま使っているテーマ：Dracula");
  });

  it("選んだ時点で反映・保存し（確定ボタンは無い）、フォーカスは選んだ部品に残る（AC-I2・AC-I4）", async () => {
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    const main = selects(wrapper)[0]!;
    (main.element as HTMLSelectElement).focus();
    await main.setValue("gruvbox-light");
    expect(settings.theme).toBe("gruvbox-light");
    expect(readPrefs()["theme"]).toBe("gruvbox-light");
    expect(document.activeElement).toBe(main.element);
    expect(themeSection(wrapper).get("#settings-theme-note").text()).toBe("いま使っているテーマ：Gruvbox Light");
  });

  it("「OS の明暗に合わせる」を入れると明るいとき・暗いときが出て、既定は 1 つのテーマの対（AC5・AC6・AC7）", async () => {
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    settings.setTheme("tokyo-night");
    await wrapper.vm.$nextTick();
    const sw = themeSection(wrapper).get('[role="switch"]');
    expect(sw.attributes("aria-checked")).toBe("false");
    await sw.trigger("click");
    expect(settings.themeAuto).toBe(true);
    expect(sw.attributes("aria-checked")).toBe("true");
    const [, light, dark] = selects(wrapper);
    expect(light!.find('option[value=""]').text()).toBe("既定（Tokyo Night Day）");
    expect(dark!.find('option[value=""]').text()).toBe("既定（Tokyo Night）");
    expect((light!.element as HTMLSelectElement).value).toBe("");
    // 明るいとき・暗いときは 17 のどれからでも選べる（明るいときに暗いテーマも）。
    expect(light!.findAll("option[value]").filter((o) => o.attributes("value") !== "")).toHaveLength(17);
    settings.systemDark = false;
    await wrapper.vm.$nextTick();
    expect(themeSection(wrapper).get("#settings-theme-note").text()).toBe("いま使っているテーマ：Tokyo Night Day（OS の設定が明るいため）");
    expect(themeSection(wrapper).text()).toContain("「テーマ」でほかのテーマを選ぶと、合わせるのをやめてそのテーマにします");
  });

  it("明るいとき・暗いときを選ぶと保存し、「既定」を選ぶと null に戻る。自動の切替中に 1 つのテーマを選ぶと切れる（AC6・AC7）", async () => {
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    await themeSection(wrapper).get('[role="switch"]').trigger("click");
    const [, light, dark] = selects(wrapper);
    await light!.setValue("one-light");
    expect(settings.themeLight).toBe("one-light");
    expect(readPrefs()["themeLight"]).toBe("one-light");
    await dark!.setValue("vesper");
    expect(settings.themeDark).toBe("vesper");
    await light!.setValue("");
    expect(settings.themeLight).toBeNull();
    expect(readPrefs()["themeLight"]).toBeNull();
    await selects(wrapper)[0]!.setValue("nord");
    expect(settings.theme).toBe("nord");
    expect(settings.themeAuto).toBe(false);
    await wrapper.vm.$nextTick();
    expect(selects(wrapper)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 20260922-theme-custom-overrides：色の個別の上書き（AC1・AC5・AC6・AC7・AC12・AC-I1〜I5）
// ---------------------------------------------------------------------------------------------------------------------

describe("SettingsDialog — 色の個別の上書き", () => {
  const themeSection = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => w.get('section[aria-labelledby="settings-theme"]');
  const overridesDetails = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => themeSection(w).get("details.settings-theme-overrides");
  const rows = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => overridesDetails(w).findAll(".theme-override-row");
  const input = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"], key: string, bucket: "light" | "dark") =>
    overridesDetails(w).get<HTMLInputElement>(`[data-override-input="${bucket}:${key}"]`);
  const status = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => overridesDetails(w).get('[role="status"]');

  it("折りたたみ（既定は閉じている）に、19 個の CSS 変数それぞれ、ラベル・説明・明るいとき／暗いときの入力欄がある（AC1・AC12・AC-I1）", async () => {
    const { wrapper } = await openDialog();
    const details = overridesDetails(wrapper);
    expect(details.attributes("open")).toBeUndefined();
    expect(rows(wrapper)).toHaveLength(19);
    const first = rows(wrapper)[0]!;
    expect(first.get("code").text()).toBe("--soda-bg");
    expect(first.text()).toContain("画面地の背景");
    expect(first.findAll(".theme-override-input")).toHaveLength(2);
    expect(first.findAll(".theme-override-bucket-label").map((s) => s.text())).toEqual(["明るいとき", "暗いとき"]);
  });

  it("妥当な色を確定すると、即座に反映・保存される（確定ボタンは無い。AC2・AC-I2）", async () => {
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    const field = input(wrapper, "--soda-accent", "light");
    await field.setValue("#a6e3a1");
    await field.trigger("change");
    expect(settings.themeOverrides).toEqual({ light: { "--soda-accent": "#a6e3a1" }, dark: {} });
    expect(readPrefs()["themeOverrides"]).toEqual({ light: { "--soda-accent": "#a6e3a1" } });
    expect(status(wrapper).text()).toContain("を #a6e3a1 にしました");
  });

  it("Enter でも確定する（IME 変換中は確定しない）", async () => {
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    const field = input(wrapper, "--soda-accent", "dark");
    // `setValue` は change も立てる（`typeInto` と同じ理由で input だけにする。打ちかけを作る）。
    field.element.value = "#ff0000";
    await field.trigger("input");
    await field.trigger("keydown", { key: "Enter", isComposing: true });
    expect(settings.themeOverrides.dark, "変換の確定では反映しない").toEqual({});
    await field.trigger("keydown", { key: "Enter", keyCode: 229 }); // Safari は確定の keydown で isComposing が false
    expect(settings.themeOverrides.dark).toEqual({});
    await field.trigger("keydown", { key: "Enter" });
    expect(settings.themeOverrides.dark).toEqual({ "--soda-accent": "#ff0000" });
  });

  it("無効な値は理由を示して拒否し、元の値（未入力なら空）へ戻す。反映も保存もしない（AC5）", async () => {
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    const field = input(wrapper, "--soda-accent", "light");
    await field.setValue("notacolor");
    await field.trigger("change");
    expect(settings.themeOverrides.light).toEqual({});
    expect(readPrefs()).not.toHaveProperty("themeOverrides");
    expect(status(wrapper).text()).toContain("「強調の色（フォーカスの枠等）」（明るいとき）：notacolor は色として読めません");
    expect((field.element as HTMLInputElement).value).toBe(""); // 元は未入力
  });

  it("空欄で確定すると、既定へ戻す（無効値としては扱わない）", async () => {
    useSettingsStore(pinia).setThemeOverride("light", "--soda-accent", "#a6e3a1"); // 開く前に設定（開くたびに保存値から始める）
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    const field = input(wrapper, "--soda-accent", "light");
    expect((field.element as HTMLInputElement).value).toBe("#a6e3a1");
    field.element.value = "";
    await field.trigger("input");
    await field.trigger("change");
    expect(settings.themeOverrides.light).toEqual({});
    expect(readPrefs()).not.toHaveProperty("themeOverrides");
  });

  it("色ごとに「既定に戻す」ボタンがあり、上書き中だけ出る。押すとその 1 色だけ外れ、フォーカスは同じ行の入力欄へ（AC6・AC-I4）", async () => {
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    settings.setThemeOverride("light", "--soda-accent", "#a6e3a1");
    settings.setThemeOverride("light", "--soda-bg", "#eff1f5");
    await wrapper.vm.$nextTick();
    const row = rows(wrapper)[7]!; // --soda-accent の行
    const resetBtn = row.findAll("button").find((b) => b.text() === "既定に戻す")!;
    await resetBtn.trigger("click");
    expect(settings.themeOverrides.light).toEqual({ "--soda-bg": "#eff1f5" }); // ほかは残る
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(input(wrapper, "--soda-accent", "light").element);
    expect(row.findAll("button").some((b) => b.text() === "既定に戻す")).toBe(false); // ボタン自体が消える
  });

  it("すべての上書きを既定に戻すボタンは確認を挟み、やめると何も変わらず、戻すとすべて消える（AC7・AC-I2）", async () => {
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    settings.setThemeOverride("light", "--soda-accent", "#a6e3a1");
    settings.setThemeOverride("dark", "--soda-bg", "#000000");
    await wrapper.vm.$nextTick();
    const details = overridesDetails(wrapper);
    await details.get("[data-reset-all-overrides]").trigger("click");
    expect(document.activeElement).toBe(details.get("[data-confirm-no-overrides]").element); // 安全側
    await details.get("[data-confirm-no-overrides]").trigger("click");
    expect(settings.themeOverrides).toEqual({ light: { "--soda-accent": "#a6e3a1" }, dark: { "--soda-bg": "#000000" } });
    expect(document.activeElement).toBe(details.get("[data-reset-all-overrides]").element);

    await details.get("[data-reset-all-overrides]").trigger("click");
    await details.get("[data-confirm-yes-overrides]").trigger("click");
    expect(settings.themeOverrides).toEqual({ light: {}, dark: {} });
    expect(readPrefs()).not.toHaveProperty("themeOverrides");
    expect(status(wrapper).text()).toContain("すべての色の上書きを既定へ戻しました");
  });

  it("確認の中の Esc は確認を閉じるだけで、親（設定画面）へ届かない（KeySettings の同じ確認と同じ形）", async () => {
    const { wrapper } = await openDialog();
    let leaked = 0;
    document.addEventListener("keydown", () => (leaked += 1));
    const details = overridesDetails(wrapper);
    await details.get("[data-reset-all-overrides]").trigger("click");
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    details.get("[data-confirm-no-overrides]").element.dispatchEvent(ev);
    await wrapper.vm.$nextTick();
    expect(ev.defaultPrevented).toBe(true);
    expect(leaked).toBe(0);
    expect(details.find("[data-confirm-yes-overrides]").exists()).toBe(false); // 確認は閉じる
    expect(document.activeElement).toBe(details.get("[data-reset-all-overrides]").element);
  });

  it("キーボードだけで通せる：折りたたみを開く→入力欄へ Tab→値を入れて確定→リセットのボタンへ Tab→Enter（AC-I3）", async () => {
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    const summary = overridesDetails(wrapper).get("summary");
    (summary.element as HTMLElement).focus();
    await summary.trigger("click"); // <details> を開く（標準の Enter/Space・クリック相当）
    const field = input(wrapper, "--soda-bg", "light");
    (field.element as HTMLElement).focus();
    await field.setValue("#eff1f5");
    await field.trigger("keydown", { key: "Enter" });
    expect(settings.themeOverrides.light).toEqual({ "--soda-bg": "#eff1f5" });
    // その入力欄のすぐ次に、同じ色の「既定に戻す」ボタンがある（DOM 順）。
    const row = rows(wrapper)[0]!;
    const resetBtn = row.findAll("button").find((b) => b.text() === "既定に戻す")!;
    (resetBtn.element as HTMLElement).focus();
    await resetBtn.trigger("keydown", { key: "Enter" });
    await resetBtn.trigger("click"); // happy-dom は Enter で click を合成しないので、明示する
    expect(settings.themeOverrides.light).toEqual({});
  });

  it("開き直すと、前回の結果の文・確認は持ち越さない", async () => {
    const { wrapper, view } = await openDialog();
    const settings = useSettingsStore(pinia);
    const field = input(wrapper, "--soda-accent", "light");
    await field.setValue("notacolor");
    await field.trigger("change");
    expect(status(wrapper).text()).not.toBe("");
    settings.setThemeOverride("dark", "--soda-bg", "#000000");
    await wrapper.vm.$nextTick();
    await overridesDetails(wrapper).get("[data-reset-all-overrides]").trigger("click");
    view.closeDialog();
    await wrapper.vm.$nextTick();
    view.openDialogWithContext({ kind: "settings" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(status(wrapper).text()).toBe("");
    expect(overridesDetails(wrapper).find("[data-confirm-no-overrides]").exists()).toBe(false); // 確認は出ていない
  });

  // AC-I5（既存操作を妨げないか）：この入力欄は `pathDraft` 等ほかの設定の入力欄と同じ、素の `<input>` で、独自の
  // keydown ハンドラを持たない。prefix・直接のキーに奪われないのは、`main.ts` の window の keydown listener が
  // `view.openDialog` を見て**ダイアログが開いている間は何もしない**という既存の配線（本 work では触っていない）に
  // よるもので、この配線はコンポーネント単体のテスト（`main.ts` を結線しない）では検証できない。実物のブラウザでの
  // 確認は E2E（T5）で行う。
});

describe("SettingsDialog — テーマの節（名前付けと値の束縛）", () => {
  const themeSection = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => w.get('section[aria-labelledby="settings-theme"]');
  const selects = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]) => themeSection(w).findAll("select");

  it("3 つの選択肢は <label> で名前が付き、「テーマ」は自動の切替の注記といまのテーマの注記に結び付く", async () => {
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    settings.setThemeAuto(true);
    await wrapper.vm.$nextTick();
    const names = selects(wrapper).map((sel) => sel.element.closest("label")?.querySelector("span")?.textContent);
    expect(names).toEqual(["テーマ", "明るいとき", "暗いとき"]);
    const describedBy = selects(wrapper)[0]!.attributes("aria-describedby")!.split(" ");
    expect(describedBy).toEqual(["settings-theme-auto-note", "settings-theme-note"]);
    for (const id of describedBy) expect(themeSection(wrapper).find(`#${id}`).exists(), id).toBe(true);
    expect(themeSection(wrapper).get("#settings-theme-note").attributes("aria-live")).toBe("polite");
  });

  it("自動の切替の注記と欄は切り替えの下に出る（押した切り替えの位置がずれない）。押してもフォーカスは切り替えに残る", async () => {
    const { wrapper } = await openDialog();
    const sw = themeSection(wrapper).get('[role="switch"]');
    (sw.element as HTMLButtonElement).focus();
    await sw.trigger("click");
    const note = themeSection(wrapper).get("#settings-theme-auto-note");
    // 切り替えより後ろ（DOM の順）にある。
    expect(sw.element.compareDocumentPosition(note.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.activeElement).toBe(sw.element);
  });

  it("明るいとき・暗いときの選ばれた値は store に追従する（保存値・null に戻したとき）", async () => {
    const { wrapper } = await openDialog();
    const settings = useSettingsStore(pinia);
    settings.setThemeLight("one-light");
    settings.setThemeDark("vesper");
    settings.setThemeAuto(true);
    await wrapper.vm.$nextTick();
    const [, light, dark] = selects(wrapper);
    expect((light!.element as HTMLSelectElement).value).toBe("one-light");
    expect((dark!.element as HTMLSelectElement).value).toBe("vesper");
    settings.setThemeLight(null);
    await wrapper.vm.$nextTick();
    expect((light!.element as HTMLSelectElement).value).toBe("");
  });
});

// 20260921-keybinding-customization：節「キー」の取り込み待ちの間は、ネイティブの cancel（Esc）で設定画面を閉じない（AC-I5）。
describe("SettingsDialog — 節「キー」の取り込み待ちと Esc（AC-I1・AC-I5）", () => {
  const nativeCancel = (w: Awaited<ReturnType<typeof openDialog>>["wrapper"]): Event => {
    const ev = new Event("cancel", { cancelable: true });
    w.find("dialog").element.dispatchEvent(ev);
    return ev;
  };

  it("取り込み待ちの間にネイティブの cancel が来ても、設定画面を閉じない。取り込みを終えれば、いつもどおり閉じる", async () => {
    const { wrapper, view } = await openDialog();
    await wrapper.find("[data-prefix-change]").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".keys-capture").exists()).toBe(true);
    const ev = nativeCancel(wrapper);
    await wrapper.vm.$nextTick();
    expect(ev.defaultPrevented).toBe(true); // 既定の close は止める
    expect(view.openDialog).toBe("settings"); // 閉じない
    expect(wrapper.find(".keys-capture").exists()).toBe(true); // 取り込み待ちのまま（Esc の取り消しは取り込みの部品の keydown が受ける）

    // Esc の keydown で取り込みを取り消したあとは、cancel でいつもどおり閉じる
    await wrapper.find(".keys-capture").trigger("keydown", { key: "Escape" });
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".keys-capture").exists()).toBe(false);
    expect(view.openDialog).toBe("settings"); // Esc 1 回で閉じない
    await new Promise((resolve) => setTimeout(resolve, 0)); // 利用者が次に押した Esc（次のタスク）
    nativeCancel(wrapper);
    await wrapper.vm.$nextTick();
    expect(view.openDialog).toBeNull();
  });

  it("Esc の keydown で取り込みを取り消した直後に cancel が来ても（Firefox・Safari で起きうる順序）、設定画面は閉じない", async () => {
    const { wrapper, view } = await openDialog();
    await wrapper.find("[data-prefix-change]").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    await wrapper.find(".keys-capture").trigger("keydown", { key: "Escape" });
    const ev = nativeCancel(wrapper); // 同じタスクの中で、keydown の既定動作として来る
    await wrapper.vm.$nextTick();
    expect(ev.defaultPrevented).toBe(true);
    expect(view.openDialog).toBe("settings"); // 閉じない
    // 次のタスク以降（利用者が次に押した Esc）は、いつもどおり閉じる
    await new Promise((resolve) => setTimeout(resolve, 0));
    nativeCancel(wrapper);
    await wrapper.vm.$nextTick();
    expect(view.openDialog).toBeNull();
  });

  it("取り込み待ちでなければ、cancel（Esc）で閉じる（既存の挙動）", async () => {
    const { wrapper, view } = await openDialog();
    nativeCancel(wrapper);
    await wrapper.vm.$nextTick();
    expect(view.openDialog).toBeNull();
  });
});

// 20260921-keybinding-customization：設定画面から節「キー」へ端末の種類が渡る（D11。`:kind="kind"` の結線）。
describe("SettingsDialog — 節「キー」への端末の種類（モバイルの一言）", () => {
  it("モバイルのときだけ、節「キー」に画面のキーボードでは取り込めない旨の一言が出る", async () => {
    const mobile = await openDialog(makeController(), "mobile");
    expect(mobile.wrapper.find(".keys-mobile-note").exists()).toBe(true);
    expect(mobile.wrapper.find(".keys-mobile-note").text()).toContain("画面のキーボードでは割り当てを取り込めません");
    mobile.wrapper.unmount();
    document.body.innerHTML = "";
    const desktop = await openDialog();
    expect(desktop.wrapper.find(".keys-mobile-note").exists()).toBe(false);
  });
});

// 20260926-settings-onboarding の AC6：はじめの案内を設定画面から開き直す。
describe("SettingsDialog — はじめの案内を開く", () => {
  it("［はじめの案内を開く］で案内に切り替わり、設定画面は閉じる", async () => {
    const { wrapper, view } = await openDialog();
    const btn = wrapper.get("[data-open-onboarding]");
    expect(btn.element.tagName).toBe("BUTTON");
    await btn.trigger("click");
    expect(view.openDialog).toBe("onboarding");
    expect((wrapper.get("dialog").element as HTMLDialogElement).open).toBe(false);
  });

  it("打ちかけの「指定した場所」は、案内へ切り替える前に保存する（閉じる経路と同じ）", async () => {
    useSettingsStore(pinia).setNewCwdPolicy("path");
    useSettingsStore(pinia).setNewCwdPath("~/saved");
    const { wrapper } = await openDialog();
    const field = wrapper.get<HTMLInputElement>('input[type="text"][aria-label="指定した場所のパス"]');
    field.element.value = "~/typed";
    await field.trigger("input");
    await wrapper.get("[data-open-onboarding]").trigger("click");
    expect(useSettingsStore(pinia).newCwdPath).toBe("~/typed");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 20261004-settings-side-menu：左のサイドメニュー（節の一覧）。位置は happy-dom では全部 0 なので、見出しの位置・`<dialog>` の高さを差し替える。
// 式そのものは `settings/sectionSpy.test.ts`。ここは「DOM から項目を作る・印が移る」の結線。

type Opened = Awaited<ReturnType<typeof openDialog>>;
const menuButtons = (w: Opened["wrapper"]) => w.findAll("nav.settings-menu button");
const currentLabels = (w: Opened["wrapper"]) => menuButtons(w).filter((b) => b.attributes("aria-current") === "true").map((b) => b.text());

/** 開く前に、DOM の節に手を入れられるようにして開く（`before` は開く前に呼ばれる）。 */
async function openWithMenu(before?: (w: ReturnType<typeof mount>) => void) {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  const controller = makeController();
  const view = useViewStore(pinia);
  const wrapper = mount(SettingsDialog, {
    global: { plugins: [pinia], provide: { [NotificationControllerKey as symbol]: controller.c } },
    attachTo: document.body,
  });
  before?.(wrapper);
  view.openDialogWithContext({ kind: "settings" });
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();
  return { wrapper, view, controller };
}

/** 節の見出しの位置（`<dialog>` の先頭からの位置。`scrollTop` を引いた分が `getBoundingClientRect().top`）。 */
function stubLayout(wrapper: Opened["wrapper"], tops: Record<string, number>, view: { clientHeight: number; scrollHeight: number }) {
  const dialog = wrapper.get("dialog").element as HTMLDialogElement;
  Object.defineProperty(dialog, "clientHeight", { configurable: true, get: () => view.clientHeight });
  Object.defineProperty(dialog, "scrollHeight", { configurable: true, get: () => view.scrollHeight });
  return vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const top = this.id in tops ? (tops[this.id] as number) - dialog.scrollTop : 0;
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
}

const HEADING_TOPS = {
  "settings-notify": 0,
  "settings-theme": 400,
  "settings-display": 800,
  "settings-terminal": 1200,
  "settings-agent-integration": 1600,
  "settings-keys": 2000,
};

describe("SettingsDialog — サイドメニュー（20261004-settings-side-menu）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("<nav> に名前があり、項目は画面の節の見出しから作られる（6 つ・同じ順・同じ文言。見出しを書き換えるとメニューも変わる）", async () => {
    const { wrapper } = await openWithMenu(() => {
      document.getElementById("settings-theme")!.textContent = "色合い";
    });
    expect(wrapper.get("nav.settings-menu").attributes("aria-label")).toBe("設定の節");
    expect(menuButtons(wrapper).map((b) => b.text())).toEqual(["通知", "色合い", "表示", "端末", "エージェント連携", "キー"]);
    expect(wrapper.find("nav.settings-menu").element.parentElement!.classList.contains("settings-menu-col")).toBe(true);
  });

  it("開くたびに作り直す（見出しの文言を変えて開き直すと反映される）", async () => {
    const { wrapper, view } = await openWithMenu();
    view.closeDialog();
    await wrapper.vm.$nextTick();
    document.getElementById("settings-terminal")!.textContent = "ターミナル";
    view.openDialogWithContext({ kind: "settings" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(menuButtons(wrapper).map((b) => b.text())[3]).toBe("ターミナル");
  });

  it("拾った見出しにプログラムからフォーカスできるよう tabindex=-1 が付く（節「キー」の見出しにも）", async () => {
    await openWithMenu();
    for (const id of Object.keys(HEADING_TOPS)) expect(document.getElementById(id)!.getAttribute("tabindex"), id).toBe("-1");
  });

  it("今の節の項目だけ aria-current=true と tabindex=0（開いた直後は先頭）", async () => {
    const { wrapper } = await openWithMenu();
    expect(currentLabels(wrapper)).toEqual(["通知"]);
    expect(menuButtons(wrapper).map((b) => b.attributes("tabindex"))).toEqual(["0", "-1", "-1", "-1", "-1", "-1"]);
    expect(menuButtons(wrapper).filter((b) => b.attributes("aria-current") === undefined)).toHaveLength(5);
  });

  it("開いた直後のフォーカスは 1 つ目の switch のまま", async () => {
    const { wrapper } = await openWithMenu();
    expect(document.activeElement).toBe(switches(wrapper)[0]!.element);
  });

  it("スクロールの位置で印が移る", async () => {
    const { wrapper } = await openWithMenu();
    stubLayout(wrapper, HEADING_TOPS, { clientHeight: 500, scrollHeight: 2600 });
    (document.activeElement as HTMLElement).blur(); // フォーカスのある節が選んだ節として残らないように
    const dialog = wrapper.get("dialog");
    (dialog.element as HTMLElement).scrollTop = 700;
    await dialog.trigger("scroll");
    await wrapper.vm.$nextTick();
    expect(currentLabels(wrapper)).toEqual(["テーマ"]);
    (dialog.element as HTMLElement).scrollTop = 2100;
    await dialog.trigger("scroll");
    await wrapper.vm.$nextTick();
    expect(currentLabels(wrapper)).toEqual(["キー"]);
  });

  it("本文の中にフォーカスが入ると、その節が今の節になる（選んだ節）", async () => {
    const { wrapper } = await openWithMenu();
    stubLayout(wrapper, HEADING_TOPS, { clientHeight: 500, scrollHeight: 2600 });
    // 表示の節の最初の switch へ。見出しは見える範囲に無い（scrollTop 0 で 800）が、フォーカスの部品の位置は 0 → 見える。
    const displaySwitch = wrapper.get('section[aria-labelledby="settings-display"] [role="switch"]').element as HTMLElement;
    displaySwitch.focus();
    displaySwitch.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(currentLabels(wrapper)).toEqual(["表示"]);
  });

  it("wheel でスクロールの位置の決まりに戻る（選んだ節を外す。見出しが見えていても外れる）", async () => {
    const { wrapper } = await openWithMenu();
    stubLayout(wrapper, HEADING_TOPS, { clientHeight: 500, scrollHeight: 2600 });
    // テーマの見出し（400）は見える範囲（0〜500）にあるので、選んだ節は位置だけでは外れない。位置だけで決めると先頭（通知）。
    const themeControl = wrapper.get('section[aria-labelledby="settings-theme"] :is(input, select, button)').element as HTMLElement;
    themeControl.focus();
    themeControl.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(currentLabels(wrapper)).toEqual(["テーマ"]);
    await wrapper.get("dialog").trigger("wheel");
    await wrapper.vm.$nextTick();
    expect(currentLabels(wrapper), "wheel で選んだ節を外す → 位置で決まる").toEqual(["通知"]);
  });

  /** テーマの節の部品にフォーカスして、選んだ節をテーマにする（見出し 400 は見える範囲。位置だけなら先頭の通知）。 */
  async function chooseTheme(wrapper: Opened["wrapper"]) {
    const control = wrapper.get('section[aria-labelledby="settings-theme"] :is(input, select, button)').element as HTMLElement;
    control.focus();
    control.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(currentLabels(wrapper)).toEqual(["テーマ"]);
  }

  it("touchmove でも選んだ節を外す。ただしメニューの中で、メニューがスクロールできるときは外さない", async () => {
    const { wrapper } = await openWithMenu();
    stubLayout(wrapper, HEADING_TOPS, { clientHeight: 500, scrollHeight: 2600 });
    const nav = wrapper.get("nav.settings-menu");
    // メニューがスクロールできない → メニューの上でも外す。
    await chooseTheme(wrapper);
    await nav.trigger("touchmove");
    await wrapper.vm.$nextTick();
    expect(currentLabels(wrapper)).toEqual(["通知"]);
    // メニューがスクロールできる → メニューの上では外さない。本文の上では外す。
    Object.defineProperty(nav.element, "scrollHeight", { configurable: true, get: () => 900 });
    Object.defineProperty(nav.element, "clientHeight", { configurable: true, get: () => 300 });
    await chooseTheme(wrapper);
    await nav.trigger("touchmove");
    await wrapper.vm.$nextTick();
    expect(currentLabels(wrapper), "メニューの中だけがスクロールする").toEqual(["テーマ"]);
    await wrapper.get("dialog").trigger("touchmove");
    await wrapper.vm.$nextTick();
    expect(currentLabels(wrapper)).toEqual(["通知"]);
  });

  it("計算は 1 回の描画につき 1 回にまとめる（scroll を続けて起こしても requestAnimationFrame は 1 つ）", async () => {
    const { wrapper } = await openWithMenu();
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => queue.push(cb));
    await wrapper.get("dialog").trigger("scroll");
    await wrapper.get("dialog").trigger("scroll");
    await wrapper.get("dialog").trigger("scroll");
    expect(queue).toHaveLength(1);
    queue.shift()!(0);
    await wrapper.get("dialog").trigger("scroll");
    expect(queue, "実行した後は、また 1 つ予約できる").toHaveLength(1);
  });

  it("閉じると今の節・選んだ節を戻す（次に開いたときは最初の節から）。予約済みの計算も取り消す", async () => {
    const { wrapper, view } = await openWithMenu();
    stubLayout(wrapper, HEADING_TOPS, { clientHeight: 500, scrollHeight: 2600 });
    await chooseTheme(wrapper);
    const cancelled: number[] = [];
    vi.stubGlobal("requestAnimationFrame", () => 42);
    vi.stubGlobal("cancelAnimationFrame", (h: number) => void cancelled.push(h));
    await wrapper.get("dialog").trigger("scroll"); // 予約した状態で閉じる
    view.closeDialog();
    await wrapper.vm.$nextTick();
    expect(currentLabels(wrapper)).toEqual(["通知"]);
    expect(cancelled).toEqual([42]);
  });

  it("見出しの無い節は飛ばす", async () => {
    const { wrapper } = await openWithMenu(() => {
      document.getElementById("settings-terminal")!.remove();
    });
    expect(menuButtons(wrapper).map((b) => b.text())).toEqual(["通知", "テーマ", "表示", "エージェント連携", "キー"]);
  });

  it("節が 1 つも拾えなければメニューを出さない", async () => {
    const { wrapper } = await openWithMenu(() => {
      for (const sec of document.querySelectorAll(".settings-body > section")) sec.removeAttribute("aria-labelledby");
    });
    expect(wrapper.find("nav.settings-menu").exists()).toBe(false);
  });

  it("開いたとき、見えている高さを --settings-view-h として <dialog> に入れる", async () => {
    const { wrapper } = await openWithMenu(() => {
      Object.defineProperty(document.querySelector("dialog")!, "clientHeight", { configurable: true, get: () => 432 });
    });
    expect((wrapper.get("dialog").element as HTMLElement).style.getPropertyValue("--settings-view-h")).toBe("432px");
  });

  describe("移る・メニューの中のキー", () => {
    const stubbed = async () => {
      const o = await openWithMenu();
      stubLayout(o.wrapper, HEADING_TOPS, { clientHeight: 500, scrollHeight: 2600 });
      return o;
    };
    const focusItem = async (w: Opened["wrapper"], i: number) => {
      const el = menuButtons(w)[i]!.element as HTMLElement;
      el.focus();
      el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await w.vm.$nextTick();
    };
    const key = async (w: Opened["wrapper"], k: string) => {
      const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
      (document.activeElement as HTMLElement).dispatchEvent(ev);
      await w.vm.$nextTick();
      return ev;
    };
    const stops = (w: Opened["wrapper"]) => menuButtons(w).map((b) => b.attributes("tabindex"));

    it("項目を押すと、その節の見出しが題名の行のすぐ下に来る位置へスクロールし、見出しにフォーカスが移る（最初の部品ではない）", async () => {
      const { wrapper } = await stubbed();
      await menuButtons(wrapper)[2]!.trigger("click");
      expect((wrapper.get("dialog").element as HTMLElement).scrollTop).toBe(792); // 800 − 余白 8（題名の行は 0 のテスト環境）
      expect(document.activeElement).toBe(document.getElementById("settings-display"));
      expect(currentLabels(wrapper)).toEqual(["表示"]);
    });

    it("最初の節は 0、最後の節は 1992（2000 − 余白 8）へ", async () => {
      const { wrapper } = await stubbed();
      await menuButtons(wrapper)[5]!.trigger("click");
      expect((wrapper.get("dialog").element as HTMLElement).scrollTop).toBe(1992);
      await menuButtons(wrapper)[0]!.trigger("click");
      expect((wrapper.get("dialog").element as HTMLElement).scrollTop).toBe(0);
      expect(document.activeElement).toBe(document.getElementById("settings-notify"));
    });

    it("移った後も、選んだ節が今の節のまま（スクロールで位置がずれても、見出しが見えている間）", async () => {
      const { wrapper } = await stubbed();
      // 見出しへのフォーカス（→ focusin で選んだ節になる）に頼らず、go 自身が選んだ節を入れることを見る。
      // 末尾の節が 1 画面に収まる高さ（最大 1500）。移った先（1500）の位置だけで決めると、いちばん下の「キー」になってしまう。
      stubLayout(wrapper, HEADING_TOPS, { clientHeight: 500, scrollHeight: 2000 });
      vi.spyOn(document.getElementById("settings-agent-integration")!, "focus").mockImplementation(() => {});
      await menuButtons(wrapper)[4]!.trigger("click");
      await wrapper.get("dialog").trigger("scroll");
      await wrapper.vm.$nextTick();
      expect(currentLabels(wrapper)).toEqual(["エージェント連携"]);
    });

    it("go は表示の位置とフォーカスだけを変える（設定の値は変わらない）", async () => {
      const { wrapper } = await stubbed();
      const before = JSON.stringify(useNotificationsStore(pinia).prefs);
      await menuButtons(wrapper)[0]!.trigger("click");
      await menuButtons(wrapper)[3]!.trigger("click");
      expect(JSON.stringify(useNotificationsStore(pinia).prefs)).toBe(before);
    });

    it("矢印で次・前の項目へフォーカスが移り、端で止まる。Home／End で最初・最後へ", async () => {
      const { wrapper } = await stubbed();
      await focusItem(wrapper, 0);
      expect((await key(wrapper, "ArrowUp")).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(menuButtons(wrapper)[0]!.element);
      await key(wrapper, "ArrowDown");
      await key(wrapper, "ArrowDown");
      expect(document.activeElement).toBe(menuButtons(wrapper)[2]!.element);
      await key(wrapper, "End");
      expect(document.activeElement).toBe(menuButtons(wrapper)[5]!.element);
      await key(wrapper, "ArrowDown");
      expect(document.activeElement, "端で止まる").toBe(menuButtons(wrapper)[5]!.element);
      await key(wrapper, "Home");
      expect(document.activeElement).toBe(menuButtons(wrapper)[0]!.element);
    });

    it("矢印で動いても、フォーカスだけでは印（aria-current）は動かない。ボタンの click で移る", async () => {
      const { wrapper } = await stubbed();
      await focusItem(wrapper, 0);
      await key(wrapper, "ArrowDown");
      expect(currentLabels(wrapper)).toEqual(["通知"]);
      await (document.activeElement as HTMLElement).click();
      await wrapper.vm.$nextTick();
      expect(currentLabels(wrapper)).toEqual(["テーマ"]);
    });

    it("Tab の停止位置: フォーカスが無い間は今の節の項目だけ。メニューにフォーカスがある間は、フォーカスのある項目だけ。出たら今の節へ戻る", async () => {
      const { wrapper } = await stubbed();
      expect(stops(wrapper)).toEqual(["0", "-1", "-1", "-1", "-1", "-1"]);
      await focusItem(wrapper, 0);
      await key(wrapper, "ArrowDown");
      await key(wrapper, "ArrowDown");
      await key(wrapper, "ArrowDown");
      expect(stops(wrapper)).toEqual(["-1", "-1", "-1", "0", "-1", "-1"]);
      const out = switches(wrapper)[0]!.element as HTMLElement;
      menuButtons(wrapper)[3]!.element.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: out }));
      await wrapper.vm.$nextTick();
      expect(stops(wrapper), "メニューの外へ出たら、今の節（通知）へ戻る").toEqual(["0", "-1", "-1", "-1", "-1", "-1"]);
    });

    it("メニューにフォーカスがある間に閉じても、開き直したときの停止位置は今の節へ戻っている", async () => {
      const { wrapper, view } = await stubbed();
      await focusItem(wrapper, 0);
      await key(wrapper, "ArrowDown");
      await key(wrapper, "ArrowDown");
      expect(stops(wrapper)[2]).toBe("0");
      view.closeDialog(); // focusout を伴わない閉じ方
      await wrapper.vm.$nextTick();
      expect(stops(wrapper)).toEqual(["0", "-1", "-1", "-1", "-1", "-1"]);
    });

    it("メニューの項目の間の移動では、停止位置は戻らない", async () => {
      const { wrapper } = await stubbed();
      await focusItem(wrapper, 1);
      menuButtons(wrapper)[1]!.element.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: menuButtons(wrapper)[2]!.element }),
      );
      await wrapper.vm.$nextTick();
      expect(stops(wrapper)[1]).toBe("0");
    });

    it("修飾キー付きの矢印は取り合わない", async () => {
      const { wrapper } = await stubbed();
      await focusItem(wrapper, 0);
      const ev = new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true });
      document.activeElement!.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(menuButtons(wrapper)[0]!.element);
    });
  });

  describe("Alt+PageDown／Alt+PageUp・幅の変化", () => {
    const stubbed = async (before?: Parameters<typeof openWithMenu>[0]) => {
      const o = await openWithMenu(before);
      stubLayout(o.wrapper, HEADING_TOPS, { clientHeight: 500, scrollHeight: 2600 });
      return o;
    };
    const altKey = async (w: Opened["wrapper"], k: string, init: KeyboardEventInit = {}, target: Element = document.activeElement!) => {
      const ev = new KeyboardEvent("keydown", { key: k, altKey: true, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(ev);
      await w.vm.$nextTick();
      return ev;
    };

    it("Alt+PageDown／PageUp で次・前の節へ移る（preventDefault される）。移った先の見出しにフォーカスが移る", async () => {
      const { wrapper } = await stubbed();
      const ev = await altKey(wrapper, "PageDown");
      expect(ev.defaultPrevented).toBe(true);
      expect(currentLabels(wrapper)).toEqual(["テーマ"]);
      expect(document.activeElement).toBe(document.getElementById("settings-theme"));
      await altKey(wrapper, "PageDown");
      await altKey(wrapper, "PageDown");
      expect(currentLabels(wrapper)).toEqual(["端末"]);
      await altKey(wrapper, "PageUp");
      expect(currentLabels(wrapper)).toEqual(["表示"]);
    });

    it("5 回で 6 節（末尾の節が 1 画面に収まっていても 1 つずつ進む）。端では何もしないが preventDefault はする", async () => {
      const { wrapper } = await openWithMenu();
      stubLayout(wrapper, HEADING_TOPS, { clientHeight: 500, scrollHeight: 2000 });
      for (let n = 0; n < 5; n++) await altKey(wrapper, "PageDown");
      expect(currentLabels(wrapper)).toEqual(["キー"]);
      const ev = await altKey(wrapper, "PageDown");
      expect(ev.defaultPrevented).toBe(true);
      expect(currentLabels(wrapper)).toEqual(["キー"]);
      for (let n = 0; n < 5; n++) await altKey(wrapper, "PageUp");
      expect(currentLabels(wrapper)).toEqual(["通知"]);
      expect((await altKey(wrapper, "PageUp")).defaultPrevented).toBe(true);
      expect(currentLabels(wrapper)).toEqual(["通知"]);
    });

    it("伝播を止める（上の層・端末へ漏らさない）", async () => {
      const { wrapper } = await stubbed();
      const seen = vi.fn();
      document.addEventListener("keydown", seen);
      await altKey(wrapper, "PageDown");
      document.removeEventListener("keydown", seen);
      expect(seen).not.toHaveBeenCalled();
    });

    it("ほかの修飾キーが付いたとき・Alt が無いときは取り合わない", async () => {
      const { wrapper } = await stubbed();
      for (const init of [{ ctrlKey: true }, { shiftKey: true }, { metaKey: true }, { altKey: false }, { isComposing: true }]) {
        const ev = await altKey(wrapper, "PageDown", init);
        expect(ev.defaultPrevented, JSON.stringify(init)).toBe(false);
      }
      expect(currentLabels(wrapper)).toEqual(["通知"]);
    });

    it("節が 1 つも拾えないときは何もしない", async () => {
      const { wrapper } = await openWithMenu(() => {
        for (const sec of document.querySelectorAll(".settings-body > section")) sec.removeAttribute("aria-labelledby");
      });
      const ev = await altKey(wrapper, "PageDown");
      expect(ev.defaultPrevented, "ブラウザの既定（<select> の値の変更など）は止める").toBe(true);
      expect((wrapper.get("dialog").element as HTMLElement).scrollTop).toBe(0);
      expect(wrapper.find("nav.settings-menu").exists()).toBe(false);
    });

    it("キーの取り込み待ちの間は移らない（取り込みの部品が先に受ける）", async () => {
      const { wrapper } = await stubbed();
      const dialog = wrapper.get("dialog").element as HTMLElement;
      (wrapper.get(".keys-prefix button").element as HTMLElement).click(); // prefix の［変更］
      await wrapper.vm.$nextTick();
      await new Promise((r) => setTimeout(r, 0));
      const capture = document.querySelector<HTMLElement>(".keys-capture")!;
      expect(capture).not.toBeNull();
      expect(currentLabels(wrapper), "取り込みの部品は節「キー」の中").toEqual(["キー"]);
      const ev = await altKey(wrapper, "PageDown", {}, capture);
      expect(ev.defaultPrevented, "取り込みの部品が受けた").toBe(true);
      expect(currentLabels(wrapper), "最後の節でなくても動かないことを、PageUp でも確かめる").toEqual(["キー"]);
      await altKey(wrapper, "PageUp", {}, capture);
      expect(currentLabels(wrapper)).toEqual(["キー"]);
      expect(dialog.scrollTop).toBe(0);
    });

    describe("幅が 768px をまたぐ", () => {
      const fake = () => {
        const listeners: ((ev: { matches: boolean }) => void)[] = [];
        const mql = {
          matches: false,
          addEventListener: vi.fn((_t: string, fn: (ev: { matches: boolean }) => void) => void listeners.push(fn)),
          removeEventListener: vi.fn((_t: string, fn: (ev: { matches: boolean }) => void) => void listeners.splice(listeners.indexOf(fn), 1)),
        };
        vi.spyOn(window, "matchMedia").mockReturnValue(mql as unknown as MediaQueryList);
        return { listeners, mql };
      };

      it("メニューが消えるとき、メニューにフォーカスがあれば今の節の見出しへ移す。出るときは何もしない", async () => {
        const f = fake();
        const { wrapper } = await stubbed();
        const item = menuButtons(wrapper)[3]!.element as HTMLElement;
        item.focus();
        item.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
        await wrapper.vm.$nextTick();
        f.listeners.forEach((fn) => fn({ matches: false })); // 広がる → 何もしない
        expect(document.activeElement).toBe(item);
        f.listeners.forEach((fn) => fn({ matches: true })); // 狭くなる → 今の節（通知）の見出しへ
        await wrapper.vm.$nextTick();
        expect(document.activeElement).toBe(document.getElementById("settings-notify"));
      });

      it("開閉を繰り返しても、開いたまま開き直しても、リスナーは二重にならない", async () => {
        const f = fake();
        const { wrapper, view } = await stubbed();
        const tick = async () => {
          await wrapper.vm.$nextTick();
          await wrapper.vm.$nextTick();
        };
        view.closeDialog();
        await tick();
        expect(f.listeners).toHaveLength(0);
        view.openDialogWithContext({ kind: "settings" });
        await tick();
        expect(f.listeners).toHaveLength(1);
        view.openDialogWithContext({ kind: "settings" }); // 開いたまま、別の文脈の値で開き直す
        await tick();
        expect(f.listeners, "前の監視を外してから登録し直す").toHaveLength(1);
      });

      it("メニューにフォーカスが無ければフォーカスは動かない。閉じるとリスナーを外す", async () => {
        const f = fake();
        const { wrapper, view } = await stubbed();
        const sw = switches(wrapper)[1]!.element as HTMLElement;
        sw.focus();
        f.listeners.forEach((fn) => fn({ matches: true }));
        expect(document.activeElement).toBe(sw);
        expect(f.mql.addEventListener).toHaveBeenCalledTimes(1);
        view.closeDialog();
        await wrapper.vm.$nextTick();
        expect(f.mql.removeEventListener).toHaveBeenCalledTimes(1);
        expect(f.listeners).toHaveLength(0);
      });
    });
  });
});
