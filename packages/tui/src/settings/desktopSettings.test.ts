import { expect, it, vi } from "vitest";
import { desktopSettingsSection } from "./desktopSettings.js";
const permissions = {
  enabled: false,
  allowInput: false,
  allowClipboard: false,
  allowDisplayResize: false,
};
it("loads dedicated permissions and applies toggles without writing shared preferences", async () => {
  const state = { permissions, supported: true, canConfigure: true },
    changed = vi.fn();
  const port = {
    get: vi.fn(async () => state),
    set: vi.fn(async (p) => ({ ...state, permissions: p })),
  };
  const section = desktopSettingsSection(port, changed);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  section.items().find((i) => i.label === "画面共有を許可")!.activate!();
  await vi.waitFor(() => expect(port.set).toHaveBeenCalledWith({ ...permissions, enabled: true }));
  await vi.waitFor(()=>expect(section.items().find(i=>i.label.startsWith("管理者権限"))!.disabled).toBe(false));
  section.items().find(i=>i.label.startsWith("管理者権限"))!.activate!();
  await vi.waitFor(()=>expect(port.set).toHaveBeenLastCalledWith({...permissions,enabled:true,allowElevated:true}));
});
it("edits a separately approved file root without changing other desktop permissions", async () => {
  const state = { permissions, supported: true, canConfigure: true },
    changed = vi.fn(),
    port = {
      get: vi.fn(async () => state),
      set: vi.fn(async (p) => ({ ...state, permissions: p })),
    };
  const section = desktopSettingsSection(port, changed);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  const edit = section.items().find((i) => i.label === "ファイル共有フォルダ")!.activate!();
  expect(typeof edit).toBe("object");
  if (typeof edit === "object" && edit.kind === "edit") edit.commit(" /tmp/generated-files ");
  await vi.waitFor(() =>
    expect(port.set).toHaveBeenCalledWith({ ...permissions, fileRoot: "/tmp/generated-files" }),
  );
});

it.each(["linux-portal","macos-sck"] as const)("offers native %s clipboard permission independently from input",async nativePlatform=>{
 const state={nativePlatform,permissions,supported:true,canConfigure:true},changed=vi.fn(),port={get:vi.fn(async()=>state),set:vi.fn(async(p)=>({...state,permissions:p}))};
 const section=desktopSettingsSection(port,changed);await vi.waitFor(()=>expect(changed).toHaveBeenCalled());
 expect(section.items().some(i=>i.label.startsWith("管理者権限"))).toBe(false);
 section.items().find(i=>i.label==="クリップボードを許可")!.activate!();
 await vi.waitFor(()=>expect(port.set).toHaveBeenCalledWith({...permissions,allowClipboard:true}));
});

it.each(["linux-portal","macos-sck"] as const)("offers system audio for native %s",async nativePlatform=>{
 const state={nativePlatform,permissions,supported:true,canConfigure:true},changed=vi.fn(),port={get:vi.fn(async()=>state),set:vi.fn(async(p)=>({...state,permissions:p}))};
 const section=desktopSettingsSection(port,changed);await vi.waitFor(()=>expect(changed).toHaveBeenCalled());const item=section.items().find(i=>i.label==="システム音声の送信を許可");
 expect(item).toBeDefined();item!.activate!();await vi.waitFor(()=>expect(port.set).toHaveBeenCalledWith({...permissions,allowSystemAudio:true}));
});
it("offers Portal virtual permission without showing it for macOS",async()=>{
 for(const nativePlatform of ["linux-portal","macos-sck"] as const){const state={nativePlatform,permissions,supported:true,canConfigure:true},changed=vi.fn(),port={get:vi.fn(async()=>state),set:vi.fn(async(p)=>({...state,permissions:p}))},section=desktopSettingsSection(port,changed);await vi.waitFor(()=>expect(changed).toHaveBeenCalled());const item=section.items().find(i=>i.label==="OS Portalによる一時仮想画面の作成を許可");if(nativePlatform==="macos-sck")expect(item).toBeUndefined();else{item!.activate!();await vi.waitFor(()=>expect(port.set).toHaveBeenCalledWith({...permissions,allowVirtualDisplay:true}));}}
});
it("offers physical display resize only for macOS native",async()=>{
 for(const nativePlatform of ["linux-portal","macos-sck"] as const){const state={nativePlatform,permissions,supported:true,canConfigure:true},changed=vi.fn(),port={get:vi.fn(async()=>state),set:vi.fn(async(p)=>({...state,permissions:p}))},section=desktopSettingsSection(port,changed);await vi.waitFor(()=>expect(changed).toHaveBeenCalled());const item=section.items().find(i=>i.label==="解像度変更を許可");if(nativePlatform==="linux-portal")expect(item).toBeUndefined();else{expect(item).toBeDefined();item!.activate!();await vi.waitFor(()=>expect(port.set).toHaveBeenCalledWith({...permissions,allowDisplayResize:true}));}}
});
it('clears protected microphone consent when ordinary microphone permission is revoked',async()=>{const on={...permissions,enabled:true,allowElevated:true,allowMicrophone:true,microphoneEndpoint:'fixed-virtual-render',allowProtectedMicrophone:true},state={permissions:on,supported:true,canConfigure:true},changed=vi.fn(),port={get:vi.fn(async()=>state),set:vi.fn(async(p)=>({...state,permissions:p}))};const section=desktopSettingsSection(port,changed);await vi.waitFor(()=>expect(changed).toHaveBeenCalled());expect(section.items().find(i=>i.label.startsWith('管理者画面中のマイク転送'))!.disabled).toBe(false);section.items().find(i=>i.label.startsWith('接続元からのマイク転送'))!.activate!();await vi.waitFor(()=>expect(port.set).toHaveBeenLastCalledWith({...on,allowMicrophone:false,allowProtectedMicrophone:false}));});

it('shows the preparation command and server lifetime while retaining the existing toggles only',async()=>{const on={...permissions,enabled:true,allowElevated:true,allowUnlock:true},state={permissions:on,supported:true,canConfigure:true,setupMessage:'powershell.exe -NoProfile -File "C:\\Soda\\prepare-desktop-helper.ps1" を実行し、共有設定を保存し直してください。'},changed=vi.fn(),port={get:vi.fn(async()=>state),set:vi.fn(async(p)=>({...state,permissions:p}))},section=desktopSettingsSection(port,changed);await vi.waitFor(()=>expect(changed).toHaveBeenCalled());const labels=section.items().map(i=>i.label).join('\n');expect(labels).toContain(state.setupMessage);expect(labels).toContain('操舵室サーバーの稼働中');expect(labels).toContain('サーバー停止で終了');expect(labels).not.toContain('保護サービス');expect(labels).not.toContain('Windows専用サービス');section.items().find(i=>i.label==='操舵室サーバー稼働中のロック解除を許可')!.activate!();await vi.waitFor(()=>expect(port.set).toHaveBeenLastCalledWith({...on,allowUnlock:false}));});
