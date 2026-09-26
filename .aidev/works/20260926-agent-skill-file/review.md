# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [nit][conv:-] packages/server/src/util/net.ts `paneServerUrl` 全インタフェースの判定を文字列で書き直していて `isWildcardHost` を使っていない / 対応: 修正済（T1・ラウンド1）
- [nit][conv:-] packages/server/src/util/net.ts `paneServerUrl` `::0` 等の別表記はループバックに置き換わらない（`isWildcardHost`・`accessUrls` と同じ扱い） / 対応: 許容（既存の判定と揃える。T1・ラウンド1）
- [nit][conv:-] packages/server/src/composeServer.ts `serverUrlForPanes` が後で宣言される `let paneUrl` を参照（将来の TDZ） / 対応: 修正済（宣言を `new SessionService` の前へ。T2・ラウンド1）
- [nit][conv:-] packages/cli/src/cliArgs.test.ts AC13 のテストが kind の前提が崩れても通る書き方 / 対応: 修正済（kind を先に確かめ、opts のキーを厳密に比べる。T3・ラウンド1）
- [nit][conv:-] packages/cli/src/selfGuard.ts `originOf` が opaque な URL で "null" を返し、互いに一致しうる / 対応: 修正済（http(s) 以外は undefined。テスト追加。T4・ラウンド1）
- [nit][conv:regression-negative-control] packages/cli/src/selfGuard.test.ts 自分の pane の tab が snapshot に無い枝のテストが無い / 対応: 修正済（テスト追加。T4・ラウンド1）
- [nit][conv:-] packages/cli/src/commands/agentRename.test.ts `agent prompt` の歯止めのテストが `--wait` の経路を含まない / 対応: 修正済（wait: true のケースを追加。T5・ラウンド1）
- [should][conv:-] packages/cli/skills/wtmctl/SKILL.md 終わりの印がコマンド行の表示に一致して完了前に「終わった」と判断しうる / 対応: 修正済（数字が続く形で探すと明記。T6・ラウンド1）
- [should][conv:-] packages/cli/skills/wtmctl/SKILL.md ログインの案内が利用者の端末に無い `$WTM_SERVER_URL` を使い、`WTMCTL_URL` 優先も無視 / 対応: 修正済（今の接続先を展開した値を伝える。T6・ラウンド1）
- [nit][conv:-] packages/cli/skills/wtmctl/SKILL.md 送り直さない code の列挙に `agent_not_running` が無い / 対応: 修正済（T6・ラウンド1）
- [nit][conv:-] packages/cli/skills/wtmctl/SKILL.md `cd '$PWD'` が単一引用符を含むパスで壊れる / 対応: 修正済（`printf %q`。T6・ラウンド1）
- [nit][conv:-] packages/cli/src/skill.test.ts front matter の正規表現が LF 前提（CRLF の checkout で落ちる） / 対応: 修正済（`\r?\n`。T6・ラウンド1）
- [should][conv:-] packages/cli/src/paneEnv.integration.test.ts pane のシェルを固定しておらず POSIX 以外（Windows・fish）で落ちる / 対応: 修正済（`shell: "/bin/sh"`・win32 は skip。T7・ラウンド1）
- [nit][conv:-] packages/cli/src/paneEnv.integration.test.ts 標準出力の差し替えを投げたときに戻さない・read の timeout で即失敗 / 対応: 修正済（`quiet` の finally・timeout も読み直す。T7・ラウンド1）
- [nit][conv:-] packages/cli/src/paneEnv.integration.test.ts 古い `WTM_AGENT_REPORT_SOCKET` を結合テストで見ていない / 対応: 修正済（植えて、pane の値がそれでないことを確かめる。T7・ラウンド1）
- [should][conv:-] docs/wtmctl.md cookie は origin ごとなので、pane の中の接続先と同じ origin で login する必要があることが書かれていない / 対応: 修正済（T8・ラウンド1）
- [should][conv:-] docs/wtmctl.md login の案内が pane の外に無い `$WTM_SERVER_URL` を使う / 対応: 修正済（値そのものを渡すと明記。T8・ラウンド1）
- [should][conv:-] packages/cli/src/selfGuard.ts `WTMCTL_URL=http://localhost:7780` を export していると origin の文字列が `127.0.0.1` と違い、歯止めが黙って外れる / 対応: 修正済（ループバックの名前と既定のポートを正規化して比べる。テスト追加。docs に rc の優先も明記。T8・ラウンド1）
- [nit][conv:-] docs/wtmctl.md `WTM_SERVER_URL` が入らない場合（ゾーン付き IPv6）と `::` の TLS の注意が無い / 対応: 修正済（T8・ラウンド1）
- [nit][conv:-] docs/wtmctl.md `wtmctl skill >> AGENTS.md` が front matter ごと貼る / 対応: 修正済（awk で除く例に。T8・ラウンド1）

## ラウンド 1（2026-09-27）
- [should][conv:-] packages/cli/src/selfGuard.ts:15 `WTMCTL_URL` にループバック以外の名前（TLS の証明書の名前等）で同じサーバを指すと、歯止めが黙って外れる。docs はその設定を勧めているのに、外れることを docs・skill が言っていない / 対応: 差し戻し（docs と skill に「そのとき歯止めは効かない」と明記）
- [nit][conv:-] packages/cli/src/skill.test.ts:41 食い違いの検査は `wtmctl` 付きの言及だけで、散文中のサブコマンド名とオプションは照合しない / 対応: 許容（一覧の節で全コマンドを `wtmctl` 付きで照合している。オプションの照合は backlog の範囲外と判断）
- [nit][conv:-] packages/cli/skills/wtmctl/SKILL.md:16 手順が `jq` に依存するのに前提として書いていない / 対応: 差し戻しに含めて修正

## ラウンド 2（2026-09-27）
指摘なし（ラウンド 1 の should 1 件・nit 1 件は docs/wtmctl.md の TLS の項と歯止めの節、SKILL.md の「まず確かめる」「自分の pane の歯止め」で解消。今回の編集による新しい must/should なし）。
