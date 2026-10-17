# 実Windowsウィンドウの遠隔リサイズ案（未実装）

再開時点のユーザー確認待ち: Windows手動リサイズの配信追従だけか、Sodaから実ウィンドウを変更する機能か。CDPのviewport emulationは後者の代用にしない。

## 最小構成

- Windows Node bridgeの子プロセスとして固定PowerShell/C# helperを起動。追加TCP listenerは作らず、stdin/stdoutの固定JSONのみで通信。
- CDP targetとHWNDの公式な直接対応付けは、現在の経路では確認できていない。タイトル一致だけの自動選択は禁止。同名複数窓・タイトル更新で誤操作するため、ローカル側で対象HWNDを追加明示選択する。
- 選択HWND・PID・実行ファイル・プロセス作成時刻・windowの寿命を1接続へ束縛。破棄とhandle再利用を考慮し、別窓へ自動切替しない。remoteからHWND/PID/API名を受け取らない。
- ローカルの追加許可 `--allow-window-resize` とSodaの明示操作許可の両方が必要。認証・Origin・一回限り招待の現在の接続を流用し、閲覧専用や別viewerへ許可しない。
- 初版は通常状態の窓への、上限付き物理outerサイズのプリセットまたは幅/高さ入力に限る。最大化・最小化・フルスクリーンは拒否し、自動復元しない。
- SetWindowPosのSWP_NOMOVE / SWP_NOZORDER / SWP_NOACTIVATEで位置・重なり・フォーカスを変えない。DPI awareness contextを統一し、実測した寸法を返す。
- 要求連打を集約し、解除/切断で未実行要求を破棄。helperのtimeout/異常終了ではresize機能を止め、別窓へfallbackしない。

## 寸法の境界

Windows DPI、VSCode zoom、CSS viewport、JPEG縮小は異なる。Sodaの表示幅をそのままWindows pixel幅と解釈しない。GetWindowRectはDPI仮想化と不可視枠がある。client/DIP指定を後で足す場合はGetDpiForWindow/AdjustWindowRectExForDpiとcustom frameの差を検証する。

## 必要な検証

- 同名2窓、対象終了・再起動、HWND再利用、タイトル/PJ変更で誤対象を操作しない。
- ローカル許可なし、閲覧専用、別viewer、token失効、切断後は変更不可。
- DPI 100/125/150/200%、異なるDPIのモニター間移動、VSCode zoom、最大化/最小化。
- リサイズ後の実canvas画素・CSS座標・クリック・スクロール・最終画像。
- 位置・前後関係・フォーカス不変、上限、連打、解除時の破棄、helper timeout。

nativeフォルダー選択ダイアログは、この追加では共有できない。元と同じnative UIまで扱うにはWindows capture/入力を別途設計する。簡易ダイアログへ設定を変更することは自動では行わない。

## 公式資料

- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumwindows
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowthreadprocessid
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-adjustwindowrectexfordpi
- https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-reference
- https://www.electronjs.org/docs/latest/api/base-window

独立調査: resume_resize_design。Windows操作・設定変更・実装はしていない。
