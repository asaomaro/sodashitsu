# サブエージェントの状態不明を見分ける表示

Base8e29af85。変更は表示だけで、unknownをworkingへ推定したり、件数や取得経路を変更しない。

Webは既存StateIconへoptional variant=subagentを追加。記号表示ONの子unknownだけ丸囲みの?、親の既存字形・working/idle・記号OFFを維持する。色/形/大きさはStateIcon内のみで定義し、呼出側CSSには複製しない。1emの箱をborder-boxで保ち、aria/titleの状態不明を残す。

TUIは同じ子unknownだけASCIIの(?)。結合丸文字やemojiの欠字/幅依存を避ける。glyphForのoptional variantで親/記号OFFを維持し、説明行のindentは実glyphセル幅+1で揃える。元の状態語は増やさない。

## 固定source検証

- Node24.22.2、専用worktreeのoffline依存/生成物のみ。
- 関連4suite237tests成功（unit.txt）。Web/TUI型検査ともexit0（typecheck.txt）。親各状態、子working/idle/unknown、記号OFF、aria/title、実TUI gridを確認。
- Vite+Chromiumの自作隔離fixtureで実Sidebar/StateIcon/PaneStatuslineを描画。子unknownは?と1px丸枠、width=height13.5938px。idleは○、workingは◐、親は元の○/枠無し。設定OFF後は?を消しaria状態不明維持。説明行font13.6px維持、pageerror0。browser.json/browser.pngを保存し画像を目視した。
- 製品4sourceだけをbase8e29へ戻した負例: 新11cases失敗（negative-unit.txt）、実browserも?待機で失敗（negative-browser.txt）。sourceをbyte-exact復元（restore.json）し、237testsと実browserを再成功。
- source固定後のruntime変更なし。全体CIは重複実行しない。実ユーザーpane/設定/Windows/sr-pc/clipboard/モデルを操作していない。Chromeでのevaluateはこの自作fixture内だけ。

表示のみの小変更なのでtaskcheck個別実施ではなく、rootまたはUI担当による差分全体の独立reviewを最終条件とする。子行の順番変更は別担当の別commitであり、このcommitでは扱わない。
