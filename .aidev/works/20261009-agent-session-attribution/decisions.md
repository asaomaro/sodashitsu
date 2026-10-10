# decisions: agent-session-attribution

## D1 誰の報告か: pid を足し、前面のエージェントのプロセスと照合する（AC1・AC3・AC6）

- フックのスクリプト（`packages/server/assets/agent-hook-report.cjs`）が報告に `agentPid` を足す。`CLAUDE_PID`（正の整数）があればそれ。無ければ Linux の `/proc` で親を最大 4 段たどり、名前（comm・argv[0]・argv[1] の basename。`.js/.cjs/.mjs` は除く）が kind に一致する最も近い祖先。取れなければ付けない。
- サーバ（`SessionService.reportAgentSession`）は、`agentPid` が付いた報告を、次の順で確かめる。
  1. pane のシェルの子孫でない（別の pane の daemon など）→ 捨てる。
  2. 前面のエージェントが検知されていて、種類が違う・pid が前面のエージェントのプロセス（種類が合うプロセスのうち、ジョブ内に同種の祖先が無いもの＋その直の子）でない → 捨てる。
  3. 前面のエージェントが未検知 → 保留（D2）。
- pid の無い報告は、今までどおり受ける（古い版のフック・pid の取れない OS）。
- 同じプロセスの中の替わり（`/resume`・`/clear`・fork）は pid が同じなので受ける（AC3）。サブエージェントの報告（`SubagentStart` など）には `acceptsReporter` で同じ確かめを掛ける（保留はしない。AC6）。
- **`SO_PEERCRED` は使わない**: Node に、接続の相手の pid を取る API が無い（ネイティブの追加が要る）。報告の中の pid を使う。報告の pid は pane の中のプログラムが書けるので、これは安全の境界ではなく、取り違えを防ぐ仕組みである（docs に書いた）。
- ログ: 捨てた報告は `agent report ignored`（paneId・kind・session の先頭 8 文字・reason・agentPid）。

## D2 起動の直後の保留（AC2）

- 前面のエージェントが未検知のとき、報告を pane ごとに 1 件（新しいものが勝つ）、`REPORT_HOLD_MS`（15 秒）保留する。検知されたときに D1 の確かめをして、受けるか捨てるか決める。
- 期限が切れたとき・`beginShutdown` のときは、**確かめずに受けた扱い**にする（再開できないより良い。ログ `accepted without verification`）。捨てる案は、起動の直後に止めると再開が失われる点で採らない。
- #122 の猶予（10 秒）・`hasPendingResume` とは別の状態で、互いに触らない。fork の作業（matcher の `clear`・`fork`・`compact`）は報告の入り口が同じ（`reportAgentSession`）で、matcher はフックの設定の側なので、ぶつからない。

## D3 履歴と、再開の失敗での戻り（AC4・AC5）

- pane ごとに、置き換えられた前の参照を最大 2 件（最新と合わせて 3 件）、`agentSessionHistory` に覚える（同じ会話 id は重複させない）。保存にも書く（`.max(8)`。古い保存はそのまま読める）。`sodactl agent get` などには出さない。
- 再開のコマンドを打ち込んだ後、エージェントが手が空く前（state が unknown 以外になる前）に居なくなる・30 秒検出されないとき（再開の失敗）は、参照を捨てる代わりに一つ前へ戻す。履歴が空なら無し。打ち込みはやり直さない（次の起動で一つ前を試す）。
- 通常の終了（猶予切れ）は、履歴ごと捨てる。ログには、会話 id の先頭 8 文字・再開を打ち込んでからの時間・理由（`reason`）を付ける。

## D4 猶予の穴（AC9）

- 猶予（10 秒）の間に、報告しない別のエージェントが検出されたら、その後に報告が来ない限り参照を捨てる（履歴には一つ前として残す）。同じエージェントが検出し直されただけのとき（どちらかの pid が不明なときを含む）は、捨てない。
- 理由: 猶予中に、別のエージェントが同じ pane で起動して報告しないと、古い参照がそのまま残り、次の再起動で、無関係な会話を再開してしまう。

## D5 Codex（AC7）

- 実物で確かめた（`/workspaces/sodashitsu/.claude/briefs/session-attribution-codex.md`）。Codex 0.162 のフックは daemon の中で動き、環境の `SODA_PANE_ID` は最初に daemon を起動した pane のもの。
- 利用者の決定: 今回は AC1 まで。Codex の報告が別 pane を上書きしなくなる。正しい pane にはまだ付かない。docs に限界と運用の手当てを書く。終了の文言の取得（案 4）・daemon の接続の突き合わせ（案 2）は別の作業。

## D6 導入済みのフックの更新

- 追加のエントリを持たない kind でも、導入済みのスクリプトが同梱のものと違えば `needsUpdate` を真にする。書き換えるのは［更新］を押したときだけ。更新までは pid が付かず、今までどおりの受け方になる。
