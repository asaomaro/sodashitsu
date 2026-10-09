# graph-first PR2「グラフの上の端末の窓」設計・タスクの点検

対象: `feature/graph-first-2`（origin/main + 文書、b4b27b3）。`design.md` 追補 02（W1〜W11）、`tasks.md` T13a〜T13g、`requirements.md` AC-T1〜T6。
文書とコードは変えていない。コードは読んだだけで、実機・Playwright は流していない。確かめた範囲は「読んで分かること」まで。
パスは `packages/` からの相対。行番号は b4b27b3 時点。

## 先に結論

- 追補 02「いまの作り」の事実は、細部を除いて合っている（細部は末尾の C を参照）。
- 直さないと作れない点が 4 つ。うち 3 つは、キーと層の置き方についてで、設計の文面どおりに作ると AC-T3 が成り立たない。
  - **A1** prefix の後の `Esc` は予約済みで、新しい操作に割り当てられない。
  - **A2** PR1b のキーの絞り（`setDomKeyFilter`）は、xterm の textarea にフォーカスがあるときは働かない。W7 の「絞りに足す」は、そのままでは効かない。
  - **A3** 窓の層を `GraphCanvas` の中に置くと、窓で打った `Esc` と prefix が、グラフに食われる。
  - **A4** 購読と LRU の扱いが W3/W4 で足りない。窓を閉じると空か古い端末が残り、窓の途中で端末が捨てられることもある。
- W1（直結で大きさを決める）は、サーバの作りからは成り立つ。ただし AC-T4 の「閉じると基本画面の大きさへ戻る」は、基本画面に出ていない tab の pane では成り立たない（B1）。W10 の「選ぶ」が、他のクライアントの大きさを動かす（B2）。
- 守りのファイル（`focusDrop.ts`・`engageGuard.ts`）は、変えずに済む。条件は「要素を動かす同じ作業の中で、フォーカスを付け直す」こと（B4）。
- PR2 は分けたほうがよい（B8）。

## 重さの区分

- A = 直さないと実装できない
- B = 直したほうがよい
- C = 記録だけ

---

## A: 直さないと実装できない

### A1. prefix の後の `Esc` は、新しい操作にできない（W7・T13e・AC-T3）

- 根拠:
  - `client-core/src/keys/KeyRouter.ts:146` は、prefix の後のキーが `PREFIX_CANCEL_CHORD`（`"esc"`。`chord.ts:65`）なら、割り当て表（`prefixMap`）を引く前に prefix を取り消す。
  - `client-core/src/keys/keymap.ts:29` の `RESERVED_AFTER_PREFIX` が、`Esc` を「prefix の取り消しに使うので、prefix の後のキーにできません」と拒否する。設定の「キー」の取り込みも落とす。
- 起きること: `graphFocusSurface` の既定を `prefix+esc` にすると、解決した表に入らない。入れても `KeyRouter` が先に取り消しとして食うので、働かない。
- 直し方の案:
  - 別の既定キーにする。`bindings.ts` の既定の一覧（`defaults`）に無い `prefix+m`・`prefix+u`・`prefix+f` などが空いている。実装時に表で再確認する。
  - または既存の `open_graph`（`prefix+a`、`bindings.ts:82-87`）を使う。窓にフォーカスがあるときの `openGraph` は「グラフの面へフォーカスを戻す」と読み替える。今は画面を閉じる（基本画面へ切り替える）トグルなので、窓の中で意味を変える利点と混乱の両方がある。
  - どちらでも `requirements.md` AC-T3 と W7 の文面を直す。
- 新しい操作を足すときに触る場所（T13e に書く）:
  - `bindings.ts` の `ACTIONS`。個数を固定する試験 `bindings.test.ts:45-46`（63）がある。
  - `actions.ts` の `Action`。
  - 端末版の `ActionDispatcher`。「端末版は知らせだけ」の扱い。
  - `docs/tui-parity.md`・`docs/herdr-parity.md`。
  - キー一覧・ヘルプ。

### A2. キーの絞りは、xterm の textarea にフォーカスがある間は働かない（W7・T13e）

- 根拠:
  - 絞りの `domKeyFilter` を見るのは `KeyInputController.handleDomKey` だけ（`keys/KeyInputController.ts:143-165`）。
  - xterm の textarea にフォーカスがあるときは、`main.ts:511-516` の `window` の keydown が先に何もせず戻る（`xterm-helper-textarea` を除外）。
  - 端末のキーは `attach` → `handleTerminalKey` → `resolveTerminalKey` → `dispatch(decision, paneId)` を通る（`KeyInputController.ts:137-139, 224-278`）。この道には絞りが無い。
- 起きること: 窓の端末で `prefix`+`x`（pane を閉じる）や `prefix`+`v`（分割）を押すと、見えない基本画面の構成が変わる。W7 が避けたい状態がそのまま起きる。`graphScreenKeys.ts` の関数は、そのままでは使えない。
- 直し方の案:
  - `KeyInputController` に、端末の道用の絞り `setTerminalKeyFilter((paneId, decision) => boolean)` を足す。窓に載っている pane のときだけ、絞りを掛ける。窓に載っている pane の集合は `terminalHost` が持つ。
  - 食った `enterMode` は、`handleDomKey` と同じくルーターのモードを戻す（`:159-161`）。戻さないと copy/resize モードに居残る。
  - `send`（prefix の二度押し）は、端末の道では `paneId` を持つので窓の pane へ正しく届く。DOM の道とは逆に「通す」でよい。
  - `graphScreenKeys.ts` とは別の関数（例: `isAllowedInTerminalWindow`）にし、`never` で全 `Action` を網羅する switch にする。
- 「pane への操作は通し、構成を変える操作は通さない」の線引きは、`Action` の定義（`actions.ts:47-98`）から決められる。ただし**もう 1 つの軸が要る**: その操作が、**`view.focusedPaneId` を別の pane へ動かすか**。
  - 理由: `copy`・`editScrollback`・`showSubagents` などは `view.focusedPaneId`（`focus.focusedPaneId()`）を対象にする。窓の pane と一致するのは、W10 で選んだ直後だけ。
  - `goto`・`nextNotification`・`workspaceIndex`・`workspaceDelta` は PR1b の絞りで通っている。窓にフォーカスがあるままこれを通すと、フォーカスは窓の textarea にあり、選択は別の pane になる。そのあとの `copy` などが、別の pane に効く。
  - 案: 窓では、選択を動かす操作は食う。または通したうえで、動かした直後にフォーカスをグラフの面へ移す。
- 線引きの案（実装時に `decisions.md` へ表にする。判断が要るのは `?` の行）:

| 操作（`Action.type`） | 窓にフォーカスがあるとき |
| :- | :- |
| 通常の入力（`pass`）・`consume`・`send` | 通す |
| `copy`・`enterMode` copy・`exitMode`・`pasteImage` | 通す |
| `editScrollback`・`showSubagents` | 通す? 対象は `view.focusedPaneId`。W10 の後なら窓の pane |
| `help`・`settings`・`toggleSidebar*`・`reloadConfig`・`detach`・`stopServer`・`openNotificationHistory` | 通す |
| `openGraph` | 画面を閉じるので、W11 の閉じる道を通す。または A1 の案のとおり読み替える |
| `goto`・`nextNotification`・`workspaceIndex`・`workspaceDelta` | 選択が動く。食う、またはフォーカスを面へ |
| `split`・`focusDir`・`swap`・`cyclePane`・`closePane`・`zoom`・`renamePane`・`lastPane`・`agentDelta`・`focusAgentIndex`・`navigate`（paneDir） | 食う |
| tab・workspace・worktree・`moveTab`・`moveWorkspace`・`swapWithFocused` 系 | 食う |
| `enterMode` resize・navigate・`resizeBy` | 食う（レイアウトが変わる） |
| `displayMenu`・`focusDisplay` | 食う（W9。面は基本画面の中で、`inert`） |
| `runCommand` | 要判断（独自コマンドの popup を、フォーカス中の pane に出す） |

- 「スクロール・検索・貼り付け」は `Action` ではない（W7 の文が混同している）。
  - スクロールは xterm の既定のキー、検索は `copy` の `searchStart`、貼り付けは `isManualPasteShortcut`（`KeyInputController.ts:~226`）と `pasteImage`。
  - 表は `Action` の型で作る。

### A3. 窓の層を `GraphCanvas` の中に置くと、`Esc` と prefix がグラフに食われる（W7・部品・AC-T3）

- 根拠:
  - `components/graph/GraphCanvas.vue:2103-2105` の根の要素に、`@keydown.capture="onKeydownCapture"` と `@keydown="onKeydown"` が付いている。
  - capture の `onKeydownCapture`（`:1950-1978`）は、prefix のキーを `stopPropagation` で止めて、グラフ自身の prefix を構える。祖先の capture は、対象（textarea）の listener より先に走るので、xterm の `attachCustomKeyEventHandler` に prefix が届かない。prefix の二度押しや、prefix の後の操作が、窓の pane に効かない。
  - `onKeydown`（`:1990-1996`）は、`Escape` を `isTextField` の判定より**前に**見て `escape()` を呼ぶ。`escape()`（`:2020-2076`）は、最後に `view.closeGraph()` する。
- 起きること: 窓の中で `Esc`（エージェントの取り消しなど）を打つと、グラフの画面が閉じて、基本画面へ切り替わる。AC-T3「`Esc` は pane に届く」が破れる。
- 直し方の案:
  - 窓の層を `screens/GraphScreen.vue` の `GraphCanvas` の**兄弟**に置く（現状 `GraphScreen.vue` は `GraphCanvas` 1 つだけ）。設計の「面の拡大縮小・移動の外」を、DOM の上でもそうする。
  - 層の位置は、グラフの面（`.graph-view`）の箱を基準にする。`inert`・`visibility` は、画面の切り替え（`App.vue:69-72`）のもので、層は `GraphScreen` の中にあるので、グラフの画面と一緒に隠れる。
  - 層を中に置く場合は、2 つのハンドラで、`ev.target` が窓の中なら戻る。
  - T13c に「層は `GraphCanvas` の外」と書き、T13g の E2E に「窓で `Esc` を打ってもグラフが閉じない」を入れる。

### A4. 購読と LRU の扱いが W3/W4 で足りない（W3・W4・T13a・T13b）

- 根拠 1: 閉じたあとの購読。
  - 「閉じたら、やめる」（W4）と、`TerminalRegistry` の作り（`TerminalRegistry.ts:~100-117, 176-195`）が合わない。
  - 購読を予約する `unsubscribed` に入るのは、`acquire` で新しく作ったときと `markAllUnsubscribed`（再接続）だけ。`takePendingSubscriptions` で一度取り出すと戻らない。
  - 窓のために `pane.subscribe` → 閉じて `pane.unsubscribe` したあと、entry は LRU に残る。その pane の tab が基本画面に出ても `unsubscribed` に無いので、購読し直されない。古い中身のまま止まる。
- 根拠 2: LRU の対象。
  - 端末が捨てられない保証は `visible` の集合だけで、出し入れするのは `TerminalPane.vue` の `acquire`/`release` だけ（`TerminalRegistry.ts:~120-160`）。
  - 基本画面に載っていない pane（別の tab）を窓が使うと、`visible` に入らない。`evictIfNeeded`（容量 24 を超えると古い順に `dispose`）が、窓の使っている端末を捨てる。
  - `dispose` は要素ごと `term.dispose()` する。
- 根拠 3: 再接続のあとの購読。
  - `markAllUnsubscribed` のあと、購読し直すのは `ViewSync.commit`（`term/ViewSync.ts:~85-100`）が、表示中の pane を `takePendingSubscriptions` に渡す道だけ。窓だけの pane（別の tab）は含まれない。T13b に「再接続のあと、直結し直す」はあるが、購読し直しが無い。
- 直し方の案:
  - `terminalHost` が `acquire`/`release` を数える（基本画面と窓の 2 者）。`visible` の出し入れは、そこに集める。`isVisible`（通知の既読の判断）の意味も、「窓だけでも見えている扱いか」を決める。
  - 購読は、**entry が生きている間は外さない**。基本画面の裏に回った tab の端末と同じ扱いで、新しい仕組みが要らない。閉じたときの `unsubscribe` は書かない。W4 のその文を直す。
  - 窓で使う口として、`registry.takePendingSubscriptions([paneId])` を呼んで `pane.subscribe`（`scrollbackLines` は `entry.scrollback`）を送る関数を足す。
  - 再接続は `ViewSync.onViewEstablished`（`ViewSync.ts:~140`）か、`onConnectionOpened` に窓の再購読と再直結をつなぐ。

---

## B: 直したほうがよい

### B1. AC-T4「閉じると基本画面の大きさへ戻る」は、場合によっては成り立たない

- 根拠:
  - `server/src/clients/SizeAuthority.ts` の `releaseAttachment`（`:~170-176`）は、pane の tab の権限者がいれば `applyOwnerSize` で戻す。権限者がいなければ「そのまま」。
  - `applyOwnerSize`（`:~208-215`）は、権限者の `client.view` がその tab のときだけ働く。権限者の view が別の tab なら何もしない。
  - W4 の目的は「基本画面に出ていない tab の pane」なので、窓を閉じたあと、その pane は**窓の大きさのまま**残る。W5 で窓の中身を別の pane に替える（detach）ときも同じ。順序で変わる。view が先に動けば戻らない。
  - 戻るのは、その tab を次に誰かが見て `client.view` を送ったとき（`onViewChanged`）。
  - `docs/sodactl.md:200` の「権限者のブラウザの大きさへ戻る」は、同じ限りで書かれている。
- 直し方の案（どれか 1 つ）:
  - AC-T4 を「基本画面の大きさがあれば戻る。無ければ窓の大きさのまま」に直す。E2E もそれで書く。
  - サーバ側: `attach` の前の大きさを覚えておき、`releaseAttachment` で権限者がいなければ、それに戻す。`SizeAuthority.ts` を触る。`sodactl pane attach` にも効く（文書の更新が要る）。
- 関連: 閉じる前に view が動く順序（B2）を決めておく。

### B2. W10「選ぶ」は、他のクライアントの大きさを動かす。PR1b の「PTY の大きさが変わらない」とも合わせる必要がある

- 根拠:
  - `components/graph/GraphCanvas.vue:1853-1863` の `selectLikeSidebar` は、`view.setView(workspace, tab)` と `view.focusPane` と `pane.focus` の RPC。サイドバーの `focusPane`（`Sidebar.vue:~382-388`）と同じ。
  - `setView` で基本画面（隠れて残っている）の表示 tab が替わり、`PaneLayout` が新しい tab の `client.view` を送る。
  - `pane.focus` の RPC（`server/src/surface/methods/pane.ts:~48-56`）と、入力の INPUT フレーム（`ws/WsGateway.ts:144`）が `noteInteraction` で、その tab のサイズ権限を取る。
  - 権限を取ると、`applyOwnerSize`（`SizeAuthority.ts:~208`）が、このブラウザの `client.view`（その tab の、隠れた基本画面の葉の大きさ）を、**その tab の他の pane**に当てる。窓の pane は直結中なので飛ばされる。
- 起きること:
  - 窓を開く、または窓に入力するだけで、別の tab を端末版や別のブラウザが見ていれば、その権限を奪う。その tab の他の pane の大きさが動く。
  - 奪われた側は、`onViewChanged`（`SizeAuthority.ts:~108`）で、権限者がいるので大きさを当てられない。以後、自分の端末をリサイズしても pane に反映されない（操作すれば取り戻す）。
  - AC-S7（`requirements.md:67`）は「切り替えで `client.view` を送らない」で、選ぶことは含まない。サイドバーで選んでも同じなので、PR1b の約束とは矛盾しない。ただし T13b の「窓を開いていない pane の大きさは変わらない」とは**別の話**で、E2E の書き方に注意が要る。
- 直し方の案:
  - W10 に、副作用を書く（選ぶと、サイドバーの行を押したのと同じく、その tab の権限を取る）。
  - 順序は「`pane.attach` → 選ぶ」にする。逆だと、窓の pane が、一度基本画面の葉の大きさに当たってから、窓の大きさになる（SIGWINCH が 2 回）。
  - T13g の E2E に、「別のクライアントが同じ tab を見ているとき、窓を開いても、他の pane の大きさが動くのは、サイドバーで選んだときだけ」を、実測値で入れる。
  - 動かしたくないなら、窓を開くときは `view.focusPane` と `pane.focus` だけにする。ただし権限は、`pane.focus` と入力でも取るので、入力した時点で同じ。
  - 設計の決めどころとして書いておく。

### B3. `pane.attach_changed` がブラウザに配線されていない。窓が奪われたことに気づけない（W2・T13b）

- 根拠:
  - `client-core` と `web` のどちらにも、`pane.attach_changed` を使うコードが無い。`protocol/src/events.ts:110-113` に「ブラウザは今は使わない」と書かれている。端末版も同じ（`tui/src/model/SessionModel.ts:254`）。
  - `Connection.ts:365-376` は、未知のイベントを `store.applyEvent` に渡すだけ。
- 起きること:
  - W2 は、開くときの `pane_attached` しか扱わない。窓を開いたあとに `sodactl pane attach --takeover` で奪われると、窓は自分が所有者のつもりで、以後の `pane.attach_resize` は `not_attached` で断られる（`.catch` で捨てられる）。
  - 同じ pane を基本画面で見ている別のブラウザは、窓の大きさの桁行になった端末を、そのまま出す（権限者なら `terminal-pane-scaled` にならない。`TerminalPane.vue:~113`、判定は tab の権限だけ）。AC-T4「表示が壊れない」を満たすには、「直結中」の印と縮小が要る。
  - 端末版には印が無い。これは既存の `pane attach` と同じ状態で、記録だけでよい。
- 直し方の案:
  - `StoreAdapter`・session store に pane ごとの直結の所有者（自分の clientId と比べる）を持つ。窓は、奪われたら W2 の表示（［引き取って開く］・［閉じる］）に替わる。
  - `TerminalPane` の縮小の条件に「他のクライアントが直結している」を足す。AC-T4 の「壊れない」は、「縮小して全体が見える」のように、観測できる文にする。
  - T13b に、`attach_changed` の配線と、奪われたときの窓の動きを書く。

### B4. 要素を動かすと、フォーカスが `body` に落ちる。守りのファイルは変えずに済むが、条件がある（W3・T13a・T13e・AC-T6）

- 根拠:
  - `display/focusDrop.ts`: 画面にスクリプトの面の枠が 1 つ以上あるあいだ、25ms ごと（と `focusout`）に、`activeElement` が `body` なら戻す。戻せたときは遮断器に数える。15 回/3 秒で全部の枠を止める（`:36-45, 73-91`）。
  - フォーカスのある要素を DOM の別の親へ動かす（`appendChild`）と、フォーカスは `body` に落ちる。これは `TerminalPane` の付け外しが、すでに抱えている性質。
  - 窓の開閉で毎回起きる。戻し先は `rememberedOrigin()`（フォーカスのあった textarea）や `focusSelectedTerminal()`（`main.ts:576-579`、`registry.focus(view.focusedPaneId)`）。
- 起きること:
  - 窓の端末から基本画面へ戻すときのように、移し先が `inert` でなければ、見回りが戻して**数える**。T13g の E2E「窓の開閉を 20 回くり返しても、フォーカスの脱落が数えられない」は、そのままでは成り立たない。1 回ごとに 1 つ数えうる。速くくり返せば遮断器が働いて、スクリプトの面を止める。
  - 移し先が `inert` の基本画面なら、`focus()` が効かず `moved=false` で数えない。害は無い。
- 守りのファイルを変えずに済む条件:
  - 要素を動かした**同じ作業の中**で、フォーカスを付け直す（または、フォーカスを面のノードへ移す）。見回りの `setTimeout(0)`・25ms に、`body` を見せない。`GraphCanvas.vue:1650-1656` の「同じ作業の中で行う（D45）」と同じ流儀。
  - 窓の DOM に `[data-display-frame]`・`.display-frame-cover`・`.display-engage` を付けない（`focusOrigin.ts:~20` の除外の対象になる）。
  - 見回りの戻し先（`rememberedOrigin`）は、窓の textarea になりうる。窓を閉じて要素を `inert` の基本画面へ戻したあとの戻しは、失敗して何も起きる。安全だが、無駄な見回りが続く。
- 観測の手段:
  - `restoredAt` は非公開で、E2E から数が読めない。「数えられない」の代わりに、「遮断器が働かない（枠が止まらない）」「知らせ（トースト）が出ない」「`document.activeElement` が `body` のまま残らない」を、確かめる基準にする。AC-T6 の確かめようの無さの解消（B9）。

### B5. 窓の本体が、`TerminalPane.vue` の役目のうち、何を引き継ぐかが書かれていない（T13a・T13c）

`TerminalPane.vue` が今持っていて、窓の本体が同じに働かせる必要があるもの:

- `mousedown.capture` で `view.focusPane`（`:78-80`）。これが無いと、窓を押しても `view.focusedPaneId` が替わらず、A2 の「対象 pane」がずれる。
- ファイルのドロップ（`dragenter/over/leave/drop`、`FileTransfer`。`:82-110`）。T13e に「ファイルのドロップ」はあるが、土台が無い。
- `status:'failed'` の pane の表示（`:116`）。窓も同じ理由を出し、`pane.attach` はしない。
- `tabIndex` を選んでいる pane だけ 0 にする（`syncTabStop`）。窓の中の端末は、窓の Tab の順に入れるかを決める。
- 見た目: 権限が無いときの縮小の条件。窓の pane は直結なので、サイズは窓が決める。縮小は不要。
- 既読の印（`:48-55`）。窓を開いたことで既読にするかは、通知の仕様に関わる（A4 の `isVisible` と一緒に決める）。
- `registry.hasSizeAuthority(paneId)`（`main.ts:271-273`）。`TerminalRegistry.ts:309` は、フォーカスの報告（`CSI I`/`CSI O`、DECSET 1004）を、**tab の権限者でなければ送らない**。窓の pane が別の tab で、このブラウザが権限者でなければ、窓の中でアプリがフォーカスの報告を受けられない。W1 では「直結の所有者もその pane の大きさの権限者」なので、`hasSizeAuthority` に「自分が直結している pane」を足す。
- 初めての描画のセル寸法: 新しく作った端末は、レンダラが描くまで `getCellSize` が既定の 9×18 を返す（`term/measure.ts:~35-42`）。窓を開いた直後の `pane.attach` の桁行が、一度ずれる。描画後に測り直す（`ViewSync` が `ResizeObserver` で何度も測るのと同じ）。

### B6. 閉じるとき・基本画面へ切り替えるときの順序（W3・W11・T13f）

- 根拠:
  - `GraphCanvas.vue:1650-1656` は、閉じるとき `view.screen === "base"` なら `registry.focus(view.focusedPaneId)` を呼ぶ。このとき要素がまだ窓にあれば、窓の端末にフォーカスが入り、直後に `visibility: hidden` で消える。
  - ［基本画面で開く］は、`setView` で基本画面の tab を替えてから要素を返さないと、`TerminalPane`（その tab の pane）がまだ無く、W3 の `release` の道に入る。その後の `onMounted` が `acquire` する順になれば問題ない。逆だと窓の要素が宙に浮く。
- 直し方の案:
  - `terminalHost` の状態を reactive にして、`TerminalPane` が `watch` する。窓が要素を手放したら、載せる。
  - 「窓を閉じる（要素を返す）→ 画面の切り替え → フォーカス」の順を T13f に書く。
  - 画面の切り替えを watch する場合、`pre` のフラッシュ（既定）で窓を閉じ、描画の前に要素が基本画面へ戻るようにする。

### B7. AC-T5 と W11 が合っていない

- 根拠: AC-T5 は「pane が閉じられた・**別の空間へ移った**とき窓が閉じる」。W11 の閉じる条件に「別の空間へ移った」は無い。設計 D8（空間は表示の絞り込み）では、pane の id と PTY は動かないので、窓を閉じる必要が無い。
- 直し方の案: AC-T5 から「別の空間へ移った」を外す。PR4（囲いをまたぐ移動）で改めて決めるなら、そう書く。窓の位置はグラフの面の上の層にあり、表示している空間（`[` `]`）を替えても動かない、も W6 に足す。

### B8. PR2 を分ける（W5・全体）

- 理由:
  - 危険の大部分（T13a の要素の移動、T13b の直結、T13e のキー）は、窓が 1 つでも同じに存在する。
  - 3 つの窓・留め・「押すたびに中身を替える」（W5）・窓ごとの位置の記憶（W6）は、危険を増やさずに複雑さだけを足す。特に W5 の「別のノードを押すと中身が替わる」は、ノードを押すたびに `detach`・`attach`・購読・選択・B1/B2 の大きさの動きを起こす。
  - W5 の「窓の位置はスロットのものか、pane のものか」も、書かれていない。中身が替わったとき、位置が飛ぶかどうか。
- 案:
  - PR2a: 窓 1 つ。ノードを押すと、同じ窓の中身が替わる。留めなし、記憶なし。T13a・T13b・T13e の核と、T13c の窓の部品の最小（動かす・大きさ・閉じる）。
  - PR2b: 3 つの窓・留め・位置と大きさの記憶・8 つの縁と角のキーボード操作。
  - AC-T2 は、a で「動かせ、大きさを変えられ、閉じられる。基本画面で開く」、b で「留める・上限」と分ける。
  - 少なくとも T13f を**独立点検あり**にする（直結が残る道、再接続、画面の切り替えは、状態を持つ。`AGENTS.md` の「壊れやすいもの」に当たる）。
  - 窓の最小の大きさ（FLOAT_MIN 240×120 px ≒ 26×6 セル、`display/floatGeometry.ts:17-18`）が、PTY の桁行を直接決める。エージェントの画面が崩れる小ささになる。桁行（例: 40×10）の下限を、窓の部品に持たせる。

### B9. 確かめようのない基準

- AC-T4「基本画面の別のブラウザが見ていても、表示が壊れない」: 何が「壊れない」か決まっていない（B3 の縮小・印のように観測できる文に）。
- AC-T6「守りを窓が壊さない」・T13g「脱落が数えられない」: 数を読む口が無い（B4）。遮断器が働かない・トーストが出ない・フォーカスが `body` に残らない、を基準にする。
- AC-T4 は「今の『操作を引き取る』仕組み（`pane control`）と同じ決まり」と書く。設計は `pane attach` と同じ所有者の仕組みで、`pane control` も同じ所有者を使うので矛盾はしない。文言は「pane の直結」に合わせたほうがよい。

---

## C: 記録だけ

### C1. 追補 02「いまの作り」と、コードの照合

| 記述 | 結果 |
| :- | :- |
| `TerminalRegistry` が pane ごとに `entry`（`term`・`element`）を 1 つ持つ | 合っている（`TerminalRegistry.ts:20-33, 98-117`）。 |
| `TerminalPane.vue` が要素を自分の中に載せる | 合っている（`:47-52`）。付け外しはすでに tab の切り替えごとに起きる（`:55-60`）。 |
| サイズ権限は、`client.view` で決まる | ほぼ合っている。`client.view` は全クライアントが送り、サーバは権限者のものだけ当てる（`SizeAuthority.ts:~108-122`）。 |
| 直結の仕様（所有者・`takeover`・`pane_attached`・`attach_changed`） | 合っている（`SizeAuthority.ts:~135-180`）。切断で外れ、`onClientGone` で解放する。 |
| API の名前 | `resizeAttached` は内部名で、通信の名前は `pane.attach_resize`（`surface/methods/attach.ts:32`）。文書に「通信は `pane.attach_resize`」と添えるとよい。 |
| 基本画面は大きさを保ったまま見えなくしてある | 合っている（`App.vue:63-72`、`app-screen-hidden` と `inert`）。 |
| `floatGeometry` の関数 | 名前と純粋さは合っている（`clampFloatRect`・`moveFloatRect`・`resizeFloatRect`・`keyAdjustFloatRect`・`raiseFloat`）。 |
| `graphScreenKeys.ts` の絞り | 合っているが、効く範囲は DOM の道だけ（A2）。 |
| `engageGuard`・`focusDrop.ts` | 合っている。実際の働きは B4。 |

### C2. (2) への答え（W1）

- `pane.attach` は、`client.view` で見えている pane にも同時にできる。サーバは、`attachments` の所有者と `client.view` を独立に扱い、`applyOwnerSize` が直結中の pane を飛ばすだけ（`SizeAuthority.ts:~208-215`）。
- 直結中の INPUT・OUTPUT・スクロールバックは、ふつうに働く。INPUT は WS のフレームで、誰でも書ける。OUTPUT は購読で届く。スクロールバックは、クライアントの xterm が持つ。直結は大きさだけを持つ（`attach.ts:12-13`）。
- 抜けたとき: tab の権限者がいて、その view が pane の tab なら権限者の大きさへ。そうでなければ**そのまま**（B1）。
- 別のブラウザ・別のタブ: それぞれ別の `clientId`。後から `pane.attach` すると `pane_attached`（W2 の画面）。見ているだけのクライアントの端末は、サイズの通知（`pane.size_changed`）で窓の大きさになる。権限者の別のブラウザは縮小されず、はみ出す（B3）。端末版と `sodactl pane attach` は、今の直結と同じ状態で、「直結中」の印は無い。
- 再接続・`soda handoff`・サーバの再起動: 直結はサーバのメモリだけにあり（`attachments`）、切断で外れる。接続し直すと新しい `clientId` になるので、窓は**必ず自分で直結し直す**（T13b にある）。直し直すときに、別の所有者がいれば W2 の表示になる。購読の張り直しも要る（A4）。`handoffSmoke.ts:428-435` は、handoff のあとの `pane.attach` を確かめている。

### C3. (3) への答え（W3）

- DOM の中で xterm の要素を動かすのは、新しい危険ではない。`TerminalPane` が、tab の切り替えのたびに `element.remove()` と `appendChild` をしている。
- `RendererPool`（`term/RendererPool.ts`）:
  - WebGL は端末を**作るときに** 1 回取る（`TerminalRegistry.ts:~203`）。`release` は `dispose` と `onContextLoss` のときだけ。
  - 表示から外れても手放さない。窓の追加で WebGL の消費は増えない。上限は 12、LRU の容量は 24 で、数が違う。
  - `RendererPool.ts` の `release` の注釈「表示から外れたとき」は、実際の動きと違う。
- `IntersectionObserver`・`ResizeObserver`:
  - xterm の描画の見え隠れは、内部の `IntersectionObserver` が要素の付け外しに追従する。
  - リサイズは xterm 自身は観測しない。サーバの `pane.size_changed` が `term.resize` を呼ぶ（`TerminalRegistry.ts:~178-183`）。窓の大きさの観測と `pane.attach_resize` は、窓が自分で持つ（`ViewSync.commit` の道は使えない）。
- 基本画面が `inert`／`visibility: hidden` の間の `TerminalPane`: `TerminalPane` は `mountPoint` と `entry` を持ち、要素を動かしたあとは持たない設計。`onBeforeUnmount` が `entry.element.remove()` を無条件に呼ぶ（`:55-60`）。窓に渡したあとも `entry` を持っていると、窓から要素を剥がす。「持たない」状態を明示する。
- 窓と基本画面の両方に出せない帰結: 基本画面へ切り替える瞬間は、窓を閉じて要素を返す（W11）。切り替えの間、要素が一度も DOM の外で残らない順にする（B6）。

### C4. (4) 補足

- `view.keysCaptured`（`store/view.ts:421`）は、デスクトップのグラフの画面を含まない。窓のキーが止まることは無い。ダイアログが開いていれば止まる（正しい）。
- `Esc` 単体（prefix なし）は `pass` で xterm に届く。`GraphCanvas` に食われなければ AC-T3 の「`Esc` は pane に届く」は成り立つ（A3）。
- 新しい操作を足すと、「設定 → キー」のキー一覧・競合の判定・取り込みにも出る。`graphFocusSurface` は端末版では「知らせだけ」の扱いか、端末版では出さないかを決める（`docs/tui-parity.md`）。

### C5. (5) への答え（スクリプトの面の守り）

- `focusDrop.ts` と `engageGuard.ts` と `frameRegistry.ts` は、変えずに済む。条件は B4（要素を動かす作業の中でフォーカスを付け直す・窓の DOM に除外のクラスを付けない）。
- `engageGuard` は、［操作する］のボタン（`[data-display-engage]`）の箱の動きだけを見る。基本画面は隠れているので、箱は見えない。窓に面を出さない（W9）ので、窓の開閉・移動で、現れる・動く判定は起きない。
- `displayHost.focusTerminal`（`main.ts:563-575`）は `focusPaneIfShown` で「その pane の tab が今見ている tab」のときだけ動く。窓の pane が別の tab なら効かない。窓の中で `focusTerminal` を使う道は、無い（面を出さない）。使うなら `registry.focus(paneId)` を直接。
- 見回りの戻し先は、スクリプトの面があるあいだ、窓の textarea になりうる。「余白を押して外しても端末へ戻る」（`focusDrop.ts:8`）の既存の限界が、窓にも及ぶ。グラフの面は `tabindex=-1` で、押せばフォーカスを受けるので、通常は `body` にならない。

### C6. (6) への答え（W4・W10 と PR1b の約束）

- 別の tab の pane を選ぶと、基本画面の `client.view` が替わる（B2）。ほかの pane の大きさが動くのは、**その tab の pane** で、そのブラウザが権限者になる（または、すでになっている）ときだけ。サイドバーで選んだときと同じで、PR1b の約束と矛盾しない。ただし T13b の E2E（「窓を開いていない pane の大きさは変わらない」）は、「選ばない」窓の開き方か、別の tab を選ばない範囲に限る。
- 「サイドバーで選んでも、基本画面へ切り替わらない」とは整合する（画面の切り替えは `view.screen` で、`setView` は tab の表示だけ）。

### C7. (7) への答え

- 窓を 3 つ、留め付き（W5）は、PR2 のうち一番、複雑さだけを足す部分。分けることを勧める（B8）。

### C8. そのほか

- W5 の「4 つ目を開こうとすると、いちばん古い、留めていない窓が替わる」: 「いちばん古い」は、開いた順か、前面に出した順か。`raiseFloat` の順（重なりの順）を使うのが自然だが、書かれていない。
- W6 の「pane ごとに位置と大きさを覚える」は、`localStorage` に pane id（UUID なので機種をまたいで衝突しない）で持つなら、無くなった pane の掃除（T13c にある）が要る。マシンの切り替えで、前のマシンの pane の窓を閉じる（`registry.disposeAll()`、`TerminalRegistry.ts:~318`）順序も、T13f に書く。
