# 検証

実AudioContext.resumeの完了を2本ゲートし、古い完了でミュート/decoder未生成を維持、新しい完了後だけ再生する。別ケースでresume待機中に音声DCを閉じ、古い完了後も映像を継続しContextを破棄。生成PCMのみ、実音声取得/OS入力なし、最終gain0。

- 新規2件passed (14.0s)。
- 修正したtoggleSoundだけ旧実装へ戻しwebを再build、resume-raceが失敗。バイト一致復元後webを再build完了まで待ち、音声browser6件passed (34.6s)。
- 最終build/typecheck成功。全体758 suites /11,447 tests passed (384.23s)。ソース凍結で実行。
- 接続元rootの既存変更を3wayで保持して反映し、web build/typecheck成功。

## 旧実装での実失敗

```text

Running 1 test using 1 worker

(node:1335745) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-26T02:20:34.030Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T02:20:34.031Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T02:20:34.031Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T02:20:34.053Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ERYk2S/commands.json","count":0}
{"ts":"2026-10-26T02:20:34.553Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T02:20:34.555Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T02:20:34.556Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T02:20:34.681Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-1vBOss/commands.json","count":0}
{"ts":"2026-10-26T02:20:43.845Z","level":"info","msg":"machine link closed","machine":"9bed32da0afc217c956895c3f54d18a8","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: resume-race, initially muted, bounded decode, mute/stop (10.4s)


  1) src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: resume-race, initially muted, bounded decode, mute/stop 

    Error: expect(locator).toContainText(expected) failed

    Locator: locator('[data-remote-desktop]').locator('[data-native-audio]')
    Expected substring: "ミュート"
    Received string:    "システム音声: 再生中"
    Timeout: 5000ms

    Call log:
      - Expect "toContainText" locator('[data-remote-desktop]').locator('[data-native-audio]') with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').locator('[data-native-audio]')
        14 × locator resolved to <p data-v-b9b8aa5b="" data-native-audio="">システム音声: 再生中</p>
           - unexpected value "システム音声: 再生中"


      233 |           await view.getByRole("button",{name:"音声を再生",exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__resumeGates.length)).toBe(2);
      234 |           await page.evaluate(async()=>{(window as any).__resumeGates[0]();await new Promise(requestAnimationFrame);});
    > 235 |           await expect(view.locator("[data-native-audio]")).toContainText("ミュート");expect(await page.evaluate(()=>(window as any).__audio.decoders.length)).toBe(0);
          |                                                             ^
      236 |           await page.evaluate(()=>(window as any).__resumeGates[1]());
      237 |         }else{
      238 |           const before=Number(await canvas.getAttribute("data-video-frames"));await page.evaluate(()=>{for(const c of (window as any).__audioChannels as RTCDataChannel[])c.close();});await expect(view.locator("[data-native-audio]")).toContainText("利用できません");await page.evaluate(async()=>{(window as any).__resumeGates[0]();await new Promise(requestAnimationFrame);});await expect(view.getByRole("button",{name:"音声を止める",exact:true})).toHaveCount(0);await expect.poll(async()=>Number(await canvas.getAttribute("data-video-frames"))).toBeGreaterThan(before+10);expect(await page.evaluate(()=>(window as any).__audio.contexts.every((c:AudioContext)=>c.state==="closed"))).toBe(true);return;
        at /workspaces/sodashitsu-desktop-audio-ui/packages/e2e/src/specs/remote-desktop-audio.spec.ts:235:61

    Error Context: test-results/remote-desktop-audio-nativ-c36f7-ed-bounded-decode-mute-stop/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-audio-nativ-c36f7-ed-bounded-decode-mute-stop/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-audio-nativ-c36f7-ed-bounded-decode-mute-stop/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-audio.spec.ts:7:3 › native system audio generated tone: resume-race, initially muted, bounded decode, mute/stop 
undefined
/workspaces/sodashitsu-desktop-audio-ui/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-audio.spec.ts --grep resume-race,

```
