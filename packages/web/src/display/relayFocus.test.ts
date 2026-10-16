import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parkFocusAfterRelay, parkFocusOffTerminal } from "./relayFocus.js";

function page(): { tab: HTMLButtonElement; xterm: HTMLTextAreaElement; embedded: HTMLTextAreaElement } {
  document.body.innerHTML = `
    <div class="tab-bar"><button role="tab" aria-selected="true" id="tab">t</button></div>
    <div class="terminal-pane"><div class="xterm"><textarea id="x"></textarea></div></div>
    <div data-plugin-view tabindex="-1"><div data-native-component><div class="xterm"><textarea id="e"></textarea></div></div></div>`;
  return {
    tab: document.getElementById("tab") as HTMLButtonElement,
    xterm: document.getElementById("x") as HTMLTextAreaElement,
    embedded: document.getElementById("e") as HTMLTextAreaElement,
  };
}

describe("relayFocus（中継で切り替えたあと、端末へフォーカスを移さない）", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("端末がフォーカスを持っていたら、選ばれているタブへ移す", () => {
    const p = page();
    p.xterm.focus();
    expect(parkFocusOffTerminal()).toBe(true);
    expect(document.activeElement).toBe(p.tab);
  });
  it("端末でなければ動かさない", () => {
    const p = page();
    p.tab.focus();
    expect(parkFocusOffTerminal()).toBe(false);
    expect(document.activeElement).toBe(p.tab);
  });
  it("アプリの画面が埋め込んだ端末は、アプリの一部として動かさない", () => {
    const p = page();
    p.embedded.focus();
    expect(parkFocusOffTerminal()).toBe(false);
    expect(document.activeElement).toBe(p.embedded);
  });
  it("遅れて端末にフォーカスが来ても、少しの間は移し直す（描画のあと・応答のあと）", () => {
    const p = page();
    parkFocusAfterRelay();
    vi.advanceTimersByTime(10);
    p.xterm.focus(); // 切り替えの結果、端末の watch が focus() を呼ぶ
    vi.advanceTimersByTime(60);
    expect(document.activeElement).toBe(p.tab);
    p.xterm.focus();
    vi.advanceTimersByTime(300);
    expect(document.activeElement).toBe(p.tab);
  });
  it("タブ行が隠れていれば、アプリ画面の根へ移す", () => {
    const p = page();
    p.tab.remove();
    p.xterm.focus();
    parkFocusOffTerminal();
    expect(document.activeElement).toBe(document.querySelector("[data-plugin-view]"));
  });
});
