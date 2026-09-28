# テスト結果: 06-docs-verify

## 実行したもの（作業ツリー。この時点で未コミットの変更は .aidev だけ）
- `pnpm build` — exit 0 / `pnpm typecheck` — exit 0
- `pnpm test` — 323 files / 5795 passed / 0 failed / 0 skipped
- `node scripts/tui-pty-verify.mjs` — exit 0（`tui-pty-verify: OK`）。1601d33 の後にも実装者が 1 回走らせて exit 0
- `node packages/tui/dist/bench/latency.js` — 2 回。1 回目は vitest の直後で負荷が高く（load average 約 15）(d) が目安を外れ exit 1、負荷が下がってから（load average 約 3）の 2 回目は exit 0

1 回目（load average 14.98 → 高負荷）:
```
(a) 1 pane       打鍵→フレーム p50 13.2 / p95 14.7 / max 17.2 ms・素の往復 p50 3.6 / p95 5.8 / max 18.6 ms・足した遅延 p50 9.6 / p95 11 / max 13.8 ms（n=60）
(d) 大量出力の最中 打鍵→フレーム p50 32.1 / p95 75 / max 116.1 ms・素の往復 p50 22.1 / p95 60.2 / max 107 ms・足した遅延 p50 13.1 / p95 45.4 / max 69.8 ms（n=60）（隣の pane が 7969 ms 出し続けた。標本の 100% が流れている間）
(b) 16 pane      打鍵→フレーム p50 13.2 / p95 14.8 / max 111.9 ms・素の往復 p50 2.6 / p95 5.6 / max 158.3 ms・足した遅延 p50 10.5 / p95 12.2 / max 109.3 ms（n=60） / 大きさの変更→全体の描き直し 6.1 ms（pane 16 個）
(c) エージェント 起動→サイドバーに出る 1198 ms / 止める→消える 199 ms
目安（AC17）を外れた:
  (d) typing p95 75 ms > 50 ms
```

2 回目（load average 3.42）:
```
(a) 1 pane       打鍵→フレーム p50 13.2 / p95 13.8 / max 14.8 ms・素の往復 p50 2.8 / p95 4.1 / max 9.1 ms・足した遅延 p50 10.4 / p95 11.9 / max 12.2 ms（n=60）
(d) 大量出力の最中 打鍵→フレーム p50 29.4 / p95 49.6 / max 56.5 ms・素の往復 p50 16.6 / p95 35.9 / max 42.2 ms・足した遅延 p50 12.6 / p95 33.1 / max 42.1 ms（n=60）（隣の pane が 7963 ms 出し続けた。標本の 100% が流れている間）
(b) 16 pane      打鍵→フレーム p50 13.3 / p95 14.5 / max 86.2 ms・素の往復 p50 2.2 / p95 8.6 / max 24.2 ms・足した遅延 p50 11.2 / p95 12.6 / max 84.4 ms（n=60） / 大きさの変更→全体の描き直し 6.5 ms（pane 16 個）
(c) エージェント 起動→サイドバーに出る 263 ms / 止める→消える 153 ms
目安（AC17）: すべて満たした
```

## 受け入れ基準ごとの判定（この subtask の分）
- AC15: pass（`docs/tui-parity.md`。herdr・Web の全項目を分類。対応・読み替えは AC か試験で検証〔D20〕）
- AC16: 未検証（手順は `docs/verification.md`。3 つの OS の実物の端末での確かめはこの環境〔WSL2 の devcontainer〕では Linux の疑似端末だけ）
- AC17: pass（条件つき）— 端末版が足した遅延の p95 は 11.9〜33.1 ms（目安 50 ms）。(d) 大量出力の最中の打鍵そのものの p95 は通常の負荷で 49.6 ms（目安ぎりぎり）、高負荷では 75 ms で外れた（素の往復も 60 ms で、大半はサーバ側の待ち）。
- AC19: pass（移行の説明。`docs/migrate-from-wtm.md`）
- AC4: 未検証（SSH 越しは手で確かめる手順だけ）

## 失敗の証跡
上の bench の 1 回目（高負荷での (d) の外れ）。

## 起動確認（smoke）
親の統合 test で打つ。

## 未検証の穴（skip / 環境不足）
- 3 つの OS の実物の端末（AC16）・SSH 越し（AC4）。
- 高負荷のマシンでの (d) の打鍵の p95。
