# 再レビューの指摘（依頼元から。修正 4 コミットと取り込みに対して。must 1・should 1・nit 2）

マージの解決・ドラッグの位置・代表の決め方の本筋は問題なし、との結果。残りは次のとおり。

1. **[must] `keepRepresentativesFirst` の入れ替えで、worktree グループの子の順が変わり、結果が落ち着かない。**再現: `top=["u","g:G"]`、G に `r:K`（M・Wa・Wb。Map の順 [M,Wa,Wb]）で Wb を選んで＋新規（D）→ 判定前の Map は [D,M,Wa,Wb] → 判定後の `settle` で `flattenWorkspaceIds` が [D,M,Wa,Wb]、`keepRepresentativesFirst` が同じ `worktreeKey` の D(0) と Wb(3) を入れ替えて [Wb,M,Wa,D] → `repoMembers` は本体の後を Map の順で並べるので、木が M>Wa,Wb から M>Wb,Wa に変わる。次の `settle` では [Wb,M,D,Wa] になり、同じ入力で結果が変わる（`flatten == serverOrder` も成り立たない）。
   - 直し方: 代表は旗で決まるようになったので、**「代表を平らな順で先に置く」入れ替えをやめる**（`keepRepresentativesFirst` を消す。旗の無い古い形のための並びが要るなら、そこだけに限る）。平らな順は、レイアウトの木を上から読んだ順そのまま。worktree グループの子の順は、＋新規・重複の出入り・並べ替えで変わらない。
   - `settle` は何度呼んでも同じ結果（冪等）であること。
   - 回帰テスト: linked worktree が 2 つ以上の形で、2 つ目を選んで＋新規 → 子の順が変わらない・`settle` を 2 回呼んでも同じ・画面とサーバの一致（`clientAgreement`）。E2E も linked worktree 2 つの形を 1 件。壊して落ちる確認。
   - 根拠: `client-core/src/workspace/sidebarLayout.ts:197, :201-223`、`workspaceGrouping.ts:100-105`、`server/src/session/SessionModel.ts:770-776`、`SessionModel.clientAgreement.test.ts:166-185`
2. **[should] 古い git（2.31 未満）で、ブランチ名も worktree グループも出なくなる（main からの退行）。**検査に落ちたら `unknown` にするのではなく、main と同じ道へ落とす: `--path-format=absolute` がそのまま 1 行目に返ってきた（＝知らないオプション）ときは、残りの行（相対のこともある）を cwd から解決して使う（main の `resolveCommonDir(cwd, …)` の形）。それ以外の壊れた出力だけを `unknown` にする。単体テスト（偽の出力: 新しい git・古い git・壊れた出力）と壊して落ちる確認。`docs/verification.md:1326` も合わせる — `server/src/git/GitInfoPoller.ts:151-160`
3. [nit] 再起動の後、保存に旗も `worktreeKey` も無い同じフォルダの workspace が複数あると、代表が「判定が先に届いたもの」になる。同じ周で判定が届いたものは作った順（`w<番号>` の小さい順）で決める。難しければ、D42 の文面を事実に合わせるだけでよい — `SessionModel.ts:1218-1231`、`SessionService.ts:1371`
4. [nit] `parseAbsoluteGitPath` が 2 行以上を一律 null にするので、パスに改行を含むフォルダは常に `unknown`。記録だけ（decisions.md）。

終わったら、`pnpm build`・`pnpm typecheck`・`pnpm test` と `workspace-groups.spec.ts` を流し、結果を報告して止まる（push・PR はしない）。
