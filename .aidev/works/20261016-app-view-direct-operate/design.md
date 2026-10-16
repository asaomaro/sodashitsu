# 20261016-app-view-direct-operate: design

## 判定（A）
- `PluginView`（メイン画面を置く唯一の部品）が `DisplaySurface` → `DisplayFrame` に `main` を渡す。`DisplayFrame` は `direct = main && script形式 && isExtensionDisplay(info)` で決める。`isExtensionDisplay` は #163 の `fromExtension`（`DisplayInfo.source` が `extension`）を export したもの。pane のプログラムの面は `source` が付かないので、同じ名前でも `direct` にならない。`PluginView` 側も source で面を引く（従来どおり）。
- `direct` のとき: 覆いを出さない。枠が接続したら `engageNow()`（枠へフォーカス）。`FocusGuard` は direct 型: 枠がフォーカスを持てば自動で操作中、「取った」（steal）にしない（サーバへ報告しない）。枠でない場所を押す・フォーカスが移れば操作中は終わる（印と［操作を終える］は従来どおり）。

## Esc（B）
- `render` に `direct: true` を添える。枠（`script.html`）は direct のとき `Esc` を取り次がない・`preventDefault` もしない（アプリが使える）。親も direct の `key: escape` は捨てる（二重）。

## prefix の中継（B）
- 枠: `render.relayKeys`（prefix の chord）を direct のときだけ渡す。`script.html` の window capture（読み込み時＝作者より先）で、本物の（isTrusted）keydown が prefix に合えば `preventDefault`＋`stopImmediatePropagation`（アプリには渡さない）して `{type:"key", key:"prefix"}`。以後「待ち」状態: 修飾キーだけの keydown は素通し、それ以外の本物の keydown は飲み込んで `{type:"prefix-key", input:{key,code,ctrl,alt,shift,meta}}` を送る。待ちは親の `{type:"prefix-state", pending}` で続く・終わる（3 秒の保険の時計つき）。
- 親: `display/prefixRelay.ts` の `PrefixRelay`。専用の `KeyRouter`（実物とは別の状態。キーの対応表は実物と同じ `settings.keymap`）を持ち、`prefix` で prefix を入れ、`prefix-key` を router の prefix モードのときだけ `handle` に渡す。結果の `action` が許可表（`tabDelta`・`tabIndex`・`workspaceDelta`・`workspaceIndex`）にあるものだけ `DisplayHost.runRelayedAction` で実行。`send`（prefix 二度押しの送出）・`pass`・他の action は捨てる。番号選択（`selectNumbers`）は router の内部で `workspace` の番号待ちとして進み、`pane`・`agent` の番号は action が許可表に無いので捨てる。
- 上限: 1 秒の窓で、受ける知らせ 30 件・実行する操作 5 件まで。超えたら捨てる。
- 偽れる前提: 知らせの形（key は短い文字列、修飾は真偽）を検査。許可表の操作しか動かない＝偽っても「タブ・ワークスペースの切り替え」止まり。

## フォーカス（B-1）
- 中継で実行した操作のあと、`parkFocus()`（`display/relayFocus.ts`）: 次の描画と短い間のあと、`document.activeElement` が端末（xterm の入力欄）なら、現在のタブ行のタブ（`[role=tab][aria-selected=true]`）へ移す。無ければ（タブ行が隠れている）アプリ画面の根（`[data-plugin-view]`）、それも無ければ blur。
- 行き先がアプリのタブなら、そちらのメイン画面が A で操作中になる（端末ではないので問題ない）。

## 限界（B-2）
- 枠が固まる（応答しない）と中継も止まる。キーボードでは抜けられない。出口: タブ行をマウスで押す／10 秒応答が無ければ閉じる（既存）。
- 枠の中身（信用する拡張）は、prefix と同じキーを自分のショートカットに使えない（Sodashitsu が先に受ける）。

## モバイル
- `PluginView mobile` も同じ部品なので A は同じ。中継は実キーボードの keydown が来たときだけ働く（来なければ何も起きない）。対象外とはしない。
