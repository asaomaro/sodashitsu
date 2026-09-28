import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceKindKey, NotificationControllerKey } from "../injection.js";
import type { NotificationController } from "../notify/NotificationController.js";
import type { DesktopPermission } from "../notify/ports.js";
import { useNotificationsStore } from "../store/notifications.js";
import { useOnboardingStore } from "../store/onboarding.js";
import { useSettingsStore } from "../store/settings.js";
import { readPrefs, useViewStore } from "../store/view.js";
import OnboardingDialog from "./OnboardingDialog.vue";
import SettingsDialog from "./SettingsDialog.vue";

let pinia: Pinia;

beforeEach(() => {
  localStorage.clear();
  // happy-dom の navigator.webdriver は true（自動操作の扱い＝起動時の案内を出さない。D11）。人が使うブラウザを再現する。
  vi.spyOn(navigator, "webdriver", "get").mockReturnValue(false);
  // `happy-dom` の `<dialog>` は showModal/close を持たない場合があるので、必要な面だけ生やす（`SettingsDialog.test.ts` と同じ）。
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
  vi.restoreAllMocks();
});

interface ControllerOpts {
  permission?: DesktopPermission;
  requestResult?: DesktopPermission;
}

/** `SettingsDialog.test.ts` の偽物と同じ形。**許可の値は外で変わる**（求めたあとは答えの値になる）。 */
function makeController(opts: ControllerOpts = {}) {
  let permission: DesktopPermission = opts.permission ?? "default";
  const requestDesktopPermission = vi.fn(async () => {
    permission = opts.requestResult ?? "granted";
    return permission;
  });
  const unlockSound = vi.fn();
  const markHintAnswered = vi.fn();
  const c = {
    desktopPermission: () => permission,
    requestDesktopPermission,
    unlockSound,
    markHintAnswered,
  } as unknown as NotificationController;
  return {
    c,
    requestDesktopPermission,
    unlockSound,
    markHintAnswered,
    setPermission: (p: DesktopPermission) => void (permission = p),
  };
}

function mountDialog(controller: ReturnType<typeof makeController>, kind?: "desktop" | "mobile") {
  const provide: Record<symbol, unknown> = { [NotificationControllerKey as symbol]: controller.c };
  if (kind) provide[DeviceKindKey as symbol] = kind;
  return mount(OnboardingDialog, {
    global: { plugins: [pinia], provide },
    attachTo: document.body,
  });
}

/** 起動時の localStorage を整えてからストアを作り、ダイアログを置く（`main.ts` と同じ順序）。 */
function boot(
  storage: Record<string, string> = {},
  controllerOpts: ControllerOpts = {},
  kind?: "desktop" | "mobile",
) {
  for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
  pinia = createPinia();
  setActivePinia(pinia);
  const onboarding = useOnboardingStore(pinia);
  const view = useViewStore(pinia);
  const controller = makeController(controllerOpts);
  const wrapper = mountDialog(controller, kind);
  return { wrapper, onboarding, view, controller };
}

async function flush(wrapper: ReturnType<typeof boot>["wrapper"]): Promise<void> {
  for (let i = 0; i < 4; i++) await wrapper.vm.$nextTick();
}

async function bootOpened(
  storage: Record<string, string> = {},
  controllerOpts: ControllerOpts = {},
  kind?: "desktop" | "mobile",
) {
  const b = boot(storage, controllerOpts, kind);
  b.view.onConnectionState("open");
  await flush(b.wrapper);
  return b;
}

const dialog = (w: ReturnType<typeof boot>["wrapper"]) =>
  w.get("dialog").element as HTMLDialogElement;

describe("OnboardingDialog — 起動時に開く（AC1・AC2・AC5）", () => {
  it("痕跡の無いブラウザでは、接続が open になってから開く（それまでは開かない）", async () => {
    const { wrapper, view } = boot();
    await flush(wrapper);
    expect(view.openDialog).toBeNull();
    expect(dialog(wrapper).open).toBe(false);

    view.onConnectionState("open");
    await flush(wrapper);
    expect(view.openDialog).toBe("onboarding");
    expect(dialog(wrapper).open).toBe(true);
  });

  it("置かれた時点で接続がすでに open なら（ログインし直した後に本体が描かれた等）、すぐ開く", async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    useOnboardingStore(pinia);
    const view = useViewStore(pinia);
    view.onConnectionState("open");
    const wrapper = mountDialog(makeController());
    await flush(wrapper);
    expect(view.openDialog).toBe("onboarding");
  });

  it("既存の利用者のブラウザでは開かず、保存値も変えない", async () => {
    const prefs = JSON.stringify({ theme: "nord" });
    const { wrapper, view } = boot({ "soda.prefs.v1": prefs });
    view.onConnectionState("open");
    await flush(wrapper);
    expect(view.openDialog).toBeNull();
    expect(dialog(wrapper).open).toBe(false);
    expect(localStorage.getItem("soda.prefs.v1")).toBe(prefs);
  });

  it("ほかのダイアログが開いている間は待ち、閉じたら開く", async () => {
    const { wrapper, view } = boot();
    view.openDialogWithContext({ kind: "help" });
    view.onConnectionState("open");
    await flush(wrapper);
    expect(view.openDialog).toBe("help");

    view.closeDialog();
    await flush(wrapper);
    expect(view.openDialog).toBe("onboarding");
  });

  it("1 回の読み込みで起動時に開くのは 1 回だけ（再接続しても開き直さない）", async () => {
    const { wrapper, view, onboarding } = await bootOpened();
    expect(onboarding.startupOpened).toBe(true);
    await wrapper.get("[data-onboarding-skip]").trigger("click");
    view.onConnectionState("connecting");
    view.onConnectionState("open");
    await flush(wrapper);
    expect(view.openDialog).toBeNull();
  });

  it("閉じないまま（案内済みにならないまま）再接続しても、2 回目は開かない", async () => {
    const { wrapper, view, onboarding } = await bootOpened();
    // 開いたまま別の経路で閉じた（案内済みにはしていない）
    view.closeDialog();
    await flush(wrapper);
    expect(onboarding.pendingAtStartup).toBe(true);
    view.onConnectionState("connecting");
    view.onConnectionState("open");
    await flush(wrapper);
    expect(view.openDialog).toBeNull();
  });
});

describe("OnboardingDialog — スキップ・Esc・背景（AC4・AC5・AC-I1・AC-I2）", () => {
  it("［スキップ］で閉じ、案内済みだけを保存する（ほかの保存値は書かない）", async () => {
    const { wrapper, view } = await bootOpened();
    await wrapper.get("[data-onboarding-skip]").trigger("click");
    expect(view.openDialog).toBeNull();
    expect(dialog(wrapper).open).toBe(false);
    expect(readPrefs()).toEqual({ onboarding: false });
  });

  it("Esc（ネイティブの cancel）はスキップと同じで、既定の close は止める", async () => {
    const { wrapper, view } = await bootOpened();
    const ev = new Event("cancel", { cancelable: true });
    dialog(wrapper).dispatchEvent(ev);
    await flush(wrapper);
    expect(ev.defaultPrevented).toBe(true);
    expect(view.openDialog).toBeNull();
    expect(readPrefs()).toEqual({ onboarding: false });
  });

  it("背景（ダイアログ自身）のクリックでは閉じない", async () => {
    const { wrapper, view } = await bootOpened();
    await wrapper.get("dialog").trigger("click");
    expect(view.openDialog).toBe("onboarding");
    expect(readPrefs()).toEqual({});
  });

  it("スキップのあと、次の起動では開かない（AC5）", async () => {
    const first = await bootOpened();
    await first.wrapper.get("[data-onboarding-skip]").trigger("click");
    first.wrapper.unmount();

    const second = boot();
    second.view.onConnectionState("open");
    await flush(second.wrapper);
    expect(second.view.openDialog).toBeNull();
  });
});

describe("OnboardingDialog — フォーカス（AC-I3・AC-I4・AC-I5）", () => {
  it("開いている間に外され（ログイン画面へ切り替わる等）、置き直されたら、案内を描き直す", async () => {
    const b = await bootOpened();
    const controller = b.controller;
    b.wrapper.unmount();
    expect(b.view.openDialog).toBe("onboarding");
    const again = mountDialog(controller);
    await flush(again);
    expect(dialog(again).open).toBe(true);
    await again.get("[data-onboarding-skip]").trigger("click");
    expect(b.view.openDialog).toBeNull();
  });

  it("開いたら見出しへフォーカスし、見出しは Tab の順には入らない（tabindex=-1）", async () => {
    const { wrapper } = await bootOpened();
    const title = wrapper.get("#onboarding-title");
    expect(document.activeElement).toBe(title.element);
    expect(title.attributes("tabindex")).toBe("-1");
    expect(dialog(wrapper).getAttribute("aria-labelledby")).toBe("onboarding-title");
  });

  it("閉じたら開く前の pane へ戻す（view.closeDialog）", async () => {
    const b = boot();
    b.view.focusPane("p1");
    b.view.onConnectionState("open");
    await flush(b.wrapper);
    expect(b.view.preDialogFocusPaneId).toBe("p1");
    await b.wrapper.get("[data-onboarding-skip]").trigger("click");
    expect(b.view.focusedPaneId).toBe("p1");
    expect(b.view.openDialog).toBeNull();
  });

  it("開いている間は view.openDialog が埋まる（KeyRouter が dialog モードになり、端末・prefix へ届かない）", async () => {
    const { view } = await bootOpened();
    expect(view.openDialog).toBe("onboarding");
  });
});

// ---- T3：選択と確定の反映（AC3・AC9・AC-I2） ----

/** 既存の利用者の画面で、設定画面から開き直したのと同じ開き方（起動時の判定を通さない）。 */
async function openManually(
  storage: Record<string, string> = {},
  controllerOpts: ControllerOpts = {},
  kind?: "desktop" | "mobile",
) {
  const b = boot(storage, controllerOpts, kind);
  b.view.openDialogWithContext({ kind: "onboarding" });
  await flush(b.wrapper);
  return b;
}

type Booted = Awaited<ReturnType<typeof bootOpened>>;
const themeSelect = (b: Booted) => b.wrapper.get("[data-onboarding-theme]");
const presetRadio = (b: Booted, value: string) =>
  b.wrapper.get(`input[name="onboarding-preset"][value="${value}"]`);
const notifyBox = (b: Booted, key: "toast" | "desktop" | "sound") =>
  b.wrapper.get(`input[data-notify="${key}"]`);
const confirmBtn = (b: Booted) => b.wrapper.get("[data-onboarding-confirm]");

describe("OnboardingDialog — 選択の初期値（AC3・AC6）", () => {
  it("初回は既定（テーマは既定・プリセットは使わない・通知はトーストだけ）", async () => {
    const b = await bootOpened();
    expect((themeSelect(b).element as HTMLSelectElement).value).toBe("dracula");
    expect((presetRadio(b, "none").element as HTMLInputElement).checked).toBe(true);
    expect(
      (["toast", "desktop", "sound"] as const).map(
        (k) => (notifyBox(b, k).element as HTMLInputElement).checked,
      ),
    ).toEqual([true, false, false]);
  });

  it("開き直すと、現在の設定から始める（前回の選びかけを持ち越さない）", async () => {
    const b = await openManually({ "soda.prefs.v1": JSON.stringify({ theme: "nord" }) });
    expect((themeSelect(b).element as HTMLSelectElement).value).toBe("nord");
    await themeSelect(b).setValue("gruvbox");
    await b.wrapper.get("[data-onboarding-skip]").trigger("click");
    b.view.openDialogWithContext({ kind: "onboarding" });
    await flush(b.wrapper);
    expect((themeSelect(b).element as HTMLSelectElement).value).toBe("nord");
  });
});

describe("OnboardingDialog — 確定の反映（AC3・AC-I2）", () => {
  it("置いたあとで設定が変わっても、開いた時点の値を基準にする（何も変えずに確定しても自動の切替を外さない）", async () => {
    const b = boot({ "soda.prefs.v1": JSON.stringify({ theme: "dracula" }) });
    const settings = useSettingsStore(pinia);
    settings.setTheme("nord");
    settings.setThemeAuto(true);
    b.view.openDialogWithContext({ kind: "onboarding" });
    await flush(b.wrapper);
    await confirmBtn(b).trigger("click");
    expect(readPrefs()).toEqual({ theme: "nord", themeAuto: true, onboarding: false });
  });

  it("何も変えずに確定すると、案内済みのほかは保存値を変えない（自動の切替も外さない）", async () => {
    const prefs = {
      theme: "nord",
      themeAuto: true,
      notify: { toast: false, desktop: false, sound: true },
    };
    const b = await openManually({ "soda.prefs.v1": JSON.stringify(prefs) });
    await confirmBtn(b).trigger("click");
    expect(readPrefs()).toEqual({ ...prefs, onboarding: false });
    expect(b.view.openDialog).toBeNull();
  });

  it("テーマを選んで確定すると、設定画面で選んだのと同じ保存値になり、その場で効く", async () => {
    const b = await bootOpened();
    await themeSelect(b).setValue("nord");
    await confirmBtn(b).trigger("click");
    const settings = useSettingsStore(pinia);
    expect(settings.theme).toBe("nord");
    expect(settings.effectiveTheme).toBe("nord");
    expect(readPrefs()).toEqual({ theme: "nord", themeAuto: false, onboarding: false });
  });

  it("OS の明暗に合わせている間は注記を添え、同じテーマを選び直して確定すると合わせるのをやめてそのテーマにする", async () => {
    const b = await openManually({
      "soda.prefs.v1": JSON.stringify({ theme: "dracula", themeAuto: true }),
    });
    const select = themeSelect(b);
    expect(select.attributes("aria-describedby")).toBe("onboarding-theme-auto-note");
    expect(b.wrapper.get("#onboarding-theme-auto-note").text()).toContain(
      "OS の明暗に合わせています",
    );
    await select.setValue("dracula");
    await confirmBtn(b).trigger("click");
    expect(readPrefs()).toEqual({ theme: "dracula", themeAuto: false, onboarding: false });
  });

  it("合わせていないときに同じテーマを選び直しても、保存値は増えない", async () => {
    const b = await bootOpened();
    await themeSelect(b).setValue("dracula");
    await confirmBtn(b).trigger("click");
    expect(readPrefs()).toEqual({ onboarding: false });
  });

  it("前に開いたときの選び直しを持ち越さない（開き直して触らずに確定すれば、合わせたまま）", async () => {
    const b = await openManually({
      "soda.prefs.v1": JSON.stringify({ theme: "dracula", themeAuto: true }),
    });
    await themeSelect(b).setValue("dracula");
    await b.wrapper.get("[data-onboarding-skip]").trigger("click");
    b.view.openDialogWithContext({ kind: "onboarding" });
    await flush(b.wrapper);
    await confirmBtn(b).trigger("click");
    expect(readPrefs()).toEqual({ theme: "dracula", themeAuto: true, onboarding: false });
  });

  it("合わせていないときは注記を出さない", async () => {
    const b = await bootOpened();
    expect(b.wrapper.find("#onboarding-theme-auto-note").exists()).toBe(false);
    expect(themeSelect(b).attributes("aria-describedby")).toBeUndefined();
  });

  it("キーのプリセットを選んで確定すると、設定画面の［足す］と同じ割り当てが保存される", async () => {
    const b = await bootOpened();
    await presetRadio(b, "tmux").setValue(true);
    await confirmBtn(b).trigger("click");
    const got = readPrefs()["keys"];
    expect(useSettingsStore(pinia).keymap.bindingsOf("split_vertical")).toContain("prefix+%");

    // 同じ一式を設定画面の経路（`applyRecommended` → `replaceKeyPrefs`）で足した保存値と一致する
    localStorage.clear();
    const other = createPinia();
    const s2 = useSettingsStore(other);
    const { applyRecommended } = await import("@sodashitsu/client-core");
    const { KEY_PRESETS } = await import("@sodashitsu/client-core");
    const preset = KEY_PRESETS.find((p) => p.id === "tmux")!;
    s2.replaceKeyPrefs(applyRecommended(s2.keymap, s2.keyPrefs, preset.bindings).prefs);
    expect(got).toEqual(readPrefs()["keys"]);
    expect(got).toBeDefined();
  });

  it("プリセットで足せなかった分があれば、件数をトーストで知らせる", async () => {
    const b = await bootOpened();
    // tmux 風の prefix+% を、先に別の操作へ割り当てておく
    useSettingsStore(pinia).setKeyBindings("new_tab", ["prefix+%"]);
    await presetRadio(b, "tmux").setValue(true);
    await confirmBtn(b).trigger("click");
    expect(b.view.toasts.map((t) => t.message).join("\n")).toMatch(/tmux 風のうち \d+ 個は/);
  });

  it("「使わない」ならキーの割り当てに触らない", async () => {
    const b = await bootOpened();
    await confirmBtn(b).trigger("click");
    expect(readPrefs()["keys"]).toBeUndefined();
  });

  it("トースト・音を変えて確定すると通知の保存値になり、音を入れたら自動再生を解除する", async () => {
    const b = await bootOpened();
    await notifyBox(b, "toast").setValue(false);
    await notifyBox(b, "sound").setValue(true);
    await confirmBtn(b).trigger("click");
    expect(readPrefs()["notify"]).toEqual({ toast: false, desktop: false, sound: true });
    expect(useNotificationsStore(pinia).prefs).toEqual({
      toast: false,
      desktop: false,
      sound: true,
    });
    expect(b.controller.unlockSound).toHaveBeenCalledTimes(1);
  });

  it("スキップすると、選びかけた内容（テーマ・プリセット・通知）を何も反映しない（AC4）", async () => {
    const b = await bootOpened();
    await themeSelect(b).setValue("nord");
    await presetRadio(b, "tmux").setValue(true);
    await notifyBox(b, "sound").setValue(true);
    await b.wrapper.get("[data-onboarding-skip]").trigger("click");
    expect(readPrefs()).toEqual({ onboarding: false });
    expect(useSettingsStore(pinia).theme).toBe("dracula");
    expect(b.controller.unlockSound).not.toHaveBeenCalled();
    expect(b.controller.requestDesktopPermission).not.toHaveBeenCalled();
  });
});

describe("OnboardingDialog — OS 通知と案内（AC9）", () => {
  it("許可の状態は開くたびに読み直す（置いたあとで拒否に変わっていれば押せない）", async () => {
    const b = boot({}, { permission: "default" });
    b.controller.setPermission("denied");
    b.view.onConnectionState("open");
    await flush(b.wrapper);
    expect((notifyBox(b, "desktop").element as HTMLInputElement).disabled).toBe(true);
  });

  it("保存が「入」でも許可が無ければ選択は外れて見え、何も変えずに確定しても保存値は変えない", async () => {
    const prefs = { notify: { toast: true, desktop: true, sound: false } };
    const b = await openManually(
      { "soda.prefs.v1": JSON.stringify(prefs) },
      { permission: "denied" },
    );
    expect((notifyBox(b, "desktop").element as HTMLInputElement).checked).toBe(false);
    await confirmBtn(b).trigger("click");
    expect(readPrefs()).toEqual({ ...prefs, onboarding: false });
  });

  it("許可がまだなら、確定の操作の中で許可を求め、許可されたら入れる", async () => {
    const b = await bootOpened({}, { permission: "default", requestResult: "granted" });
    await notifyBox(b, "desktop").setValue(true);
    await confirmBtn(b).trigger("click");
    expect(b.controller.requestDesktopPermission).toHaveBeenCalledTimes(1);
    await flush(b.wrapper);
    expect(useNotificationsStore(pinia).prefs.desktop).toBe(true);
    expect(b.view.openDialog).toBeNull();
  });

  it.each([
    ["denied", /ブラウザで拒否されたため.*サイトの設定で許可/],
    ["default", /許可されなかったため.*もう一度許可を求められます/],
  ] as const)(
    "許可の答えが %s なら入れず、答えに合わせた理由をトーストで知らせる",
    async (answer, message) => {
      const b = await bootOpened({}, { permission: "default", requestResult: answer });
      await notifyBox(b, "desktop").setValue(true);
      await confirmBtn(b).trigger("click");
      await flush(b.wrapper);
      expect(useNotificationsStore(pinia).prefs.desktop).toBe(false);
      expect(b.view.toasts.map((t) => t.message).join("\n")).toMatch(message);
    },
  );

  it("すでに許可されていれば、求めずに入れる", async () => {
    const b = await bootOpened({}, { permission: "granted" });
    await notifyBox(b, "desktop").setValue(true);
    await confirmBtn(b).trigger("click");
    expect(b.controller.requestDesktopPermission).not.toHaveBeenCalled();
    expect(useNotificationsStore(pinia).prefs.desktop).toBe(true);
  });

  it("入れていた OS 通知を外して確定すると切る", async () => {
    const b = await openManually(
      { "soda.prefs.v1": JSON.stringify({ notify: { toast: true, desktop: true, sound: false } }) },
      { permission: "granted" },
    );
    expect((notifyBox(b, "desktop").element as HTMLInputElement).checked).toBe(true);
    await notifyBox(b, "desktop").setValue(false);
    await confirmBtn(b).trigger("click");
    expect(useNotificationsStore(pinia).prefs.desktop).toBe(false);
  });

  it.each([
    ["denied", /拒否されています/],
    ["unsupported", /この環境では使えません/],
  ] as const)("許可が %s なら OS 通知の選択を押せず、理由を添える", async (permission, note) => {
    const b = await bootOpened({}, { permission });
    const box = notifyBox(b, "desktop");
    expect((box.element as HTMLInputElement).disabled).toBe(true);
    expect(box.attributes("aria-describedby")).toBe("onboarding-desktop-note");
    expect(b.wrapper.get("#onboarding-desktop-note").text()).toMatch(note);
  });

  it("音を鳴らせない環境では音の選択を押せない", async () => {
    const b = boot();
    useNotificationsStore(pinia).soundUsable = false;
    b.view.onConnectionState("open");
    await flush(b.wrapper);
    expect((notifyBox(b, "sound").element as HTMLInputElement).disabled).toBe(true);
  });

  it("確定すると OS 通知の案内に答えた扱いにする。スキップでは触らない", async () => {
    const confirmed = await bootOpened();
    await confirmBtn(confirmed).trigger("click");
    expect(confirmed.controller.markHintAnswered).toHaveBeenCalledTimes(1);
    confirmed.wrapper.unmount();

    localStorage.clear();
    const skipped = await bootOpened();
    await skipped.wrapper.get("[data-onboarding-skip]").trigger("click");
    expect(skipped.controller.markHintAnswered).not.toHaveBeenCalled();
  });
});

// ---- T4：主要な操作の入口の説明とモバイル（AC7・AC10） ----

describe("OnboardingDialog — 主要な操作の入口（AC7）", () => {
  it("prefix・キー一覧・設定のキーを現在の割り当てで書く（既定）", async () => {
    const b = await bootOpened();
    const keys = b.wrapper.get("[data-onboarding-keys]").text();
    expect(keys).toContain("ctrl+b");
    expect(keys).toContain("ctrl+b ? でキー一覧");
    expect(keys).toContain("ctrl+b s で設定");
  });

  it("割り当てを変えると、その割り当てで書く", async () => {
    const b = boot();
    const settings = useSettingsStore(pinia);
    settings.setKeyPrefix("ctrl+a");
    settings.setKeyBindings("help", ["ctrl+alt+h"]);
    b.view.onConnectionState("open");
    await flush(b.wrapper);
    const keys = b.wrapper.get("[data-onboarding-keys]").text();
    expect(keys).toContain("ctrl+a で prefix");
    expect(keys).toContain("ctrl+alt+h でキー一覧");
    expect(keys).toContain("ctrl+a s で設定");
  });

  it("割り当てが無い操作は、キーを書かずにサイドバーのメニューの経路を書く", async () => {
    const b = boot();
    const settings = useSettingsStore(pinia);
    settings.setKeyBindings("help", []);
    settings.setKeyBindings("settings", []);
    b.view.onConnectionState("open");
    await flush(b.wrapper);
    const keys = b.wrapper.get("[data-onboarding-keys]").text();
    expect(keys).toContain("サイドバーの［メニュー］→「キー割り当て」 でキー一覧");
    expect(keys).toContain("サイドバーの［メニュー］→「設定」 で設定");
  });

  it("デスクトップではマウスの操作（サイドバーのクリック・境界のドラッグ・右クリックのメニュー）を書く", async () => {
    const b = await bootOpened();
    const mouse = b.wrapper.get("[data-onboarding-mouse]").text();
    expect(mouse).toContain("サイドバーのクリック");
    expect(mouse).toContain("境界のドラッグ");
    expect(mouse).toContain("右クリックでメニュー");
  });

  it("エージェント連携は設定にあることと、この案内を設定から開き直せることを書く", async () => {
    const b = await bootOpened();
    const text = b.wrapper.get("dialog").text();
    expect(text).toContain("設定の「エージェント連携」");
    expect(text).toContain("この案内も設定から開き直せます");
  });
});

/** 画面幅（1 列の画面）の判定だけを差し替える。`(pointer: coarse)` 等ほかの問い合わせは一致しない。 */
function mockNarrowViewport(): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (q: string) =>
      ({
        matches: q.includes("max-width"),
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

describe("OnboardingDialog — モバイル（AC10・D9）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1 列の画面では、マウスとキーの説明の代わりに上のバーの［設定］を案内し、画面上の［この設定ではじめる］で閉じる", async () => {
    mockNarrowViewport();
    const b = await bootOpened({}, {}, "mobile");
    expect(b.wrapper.find("[data-onboarding-keys]").exists()).toBe(false);
    expect(b.wrapper.find("[data-onboarding-mouse]").exists()).toBe(false);
    expect(b.wrapper.get("[data-onboarding-intro]").text()).toContain("［設定］");
    expect(b.wrapper.find("[data-onboarding-presets]").exists()).toBe(false);
    expect(b.wrapper.find("[data-onboarding-theme]").exists()).toBe(true);
    await confirmBtn(b).trigger("click");
    expect(b.view.openDialog).toBeNull();
    expect(readPrefs()["keys"]).toBeUndefined();
  });

  it("1 列の画面でも画面上の［スキップ］で閉じ、何も反映しない", async () => {
    mockNarrowViewport();
    const b = await bootOpened({}, {}, "mobile");
    await themeSelect(b).setValue("nord");
    await b.wrapper.get("[data-onboarding-skip]").trigger("click");
    expect(b.view.openDialog).toBeNull();
    expect(readPrefs()).toEqual({ onboarding: false });
  });

  it("狭くしたデスクトップの窓（1 列の画面・指の操作ではない）では、上のバーを案内し、プリセットは出す", async () => {
    mockNarrowViewport();
    const b = await bootOpened({}, {}, "desktop");
    expect(b.wrapper.find("[data-onboarding-mouse]").exists()).toBe(false);
    expect(b.wrapper.get("[data-onboarding-intro]").text()).toContain("［設定］");
    expect(b.wrapper.find("[data-onboarding-presets]").exists()).toBe(true);
  });

  it("幅の広いタブレット（指の操作・1 列ではない）では、サイドバーの説明を出し、プリセットは出さない", async () => {
    const b = await bootOpened({}, {}, "mobile");
    expect(b.wrapper.find("[data-onboarding-mouse]").exists()).toBe(true);
    expect(b.wrapper.find("[data-onboarding-presets]").exists()).toBe(false);
  });

  it("デスクトップではキーの説明とプリセットを出す", async () => {
    const b = await bootOpened({}, {}, "desktop");
    expect(b.wrapper.find("[data-onboarding-keys]").exists()).toBe(true);
    expect(b.wrapper.find("[data-onboarding-presets]").exists()).toBe(true);
  });
});

// ---- T5：設定画面から開き直す（AC6） ----

describe("OnboardingDialog — 設定画面から開き直す（AC6）", () => {
  it("既存の利用者でも設定画面から開け、スキップすれば設定は何も変わらない", async () => {
    const prefs = { theme: "nord", notify: { toast: false, desktop: false, sound: true } };
    const b = boot({ "soda.prefs.v1": JSON.stringify(prefs) });
    const settingsWrapper = mount(SettingsDialog, {
      global: {
        plugins: [pinia],
        provide: { [NotificationControllerKey as symbol]: b.controller.c },
      },
      attachTo: document.body,
    });
    b.view.onConnectionState("open");
    b.view.openDialogWithContext({ kind: "settings" });
    await flush(b.wrapper);
    await settingsWrapper.get("[data-open-onboarding]").trigger("click");
    await flush(b.wrapper);
    expect(b.view.openDialog).toBe("onboarding");
    expect(dialog(b.wrapper).open).toBe(true);
    expect((themeSelect(b).element as HTMLSelectElement).value).toBe("nord");
    expect((notifyBox(b, "sound").element as HTMLInputElement).checked).toBe(true);

    await b.wrapper.get("[data-onboarding-skip]").trigger("click");
    expect(readPrefs()).toEqual({ ...prefs, onboarding: false });
    settingsWrapper.unmount();
    // 設定画面（1200 行を超える SFC と節「キー」）を実際に置くので重い。高負荷の共有マシンで既定 5 秒に入ることがある（test ラウンド 3）。
  }, 15_000);
});
