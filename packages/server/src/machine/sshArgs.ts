import { remoteSessionProblem, targetProblem } from "./machineRules.js";

/**
 * 裏の接続の ssh の引数（20260927-multi-host-machines の design「SSH の引数」・decisions D6）。システムの `ssh` を**引数の配列で**
 * 起動する（手元でシェルを通さない）。宛先の前に `--` を置き、リモートのコマンドは固定の `soda bridge` と検証済みの session の名前だけ
 * （ssh は command と argument を空白で繋いでリモートのシェルに渡すので、利用者の文字列を入れない）。
 * `StrictHostKeyChecking` は付けない（利用者の `~/.ssh/config` に任せる。BatchMode の下では未知のホスト鍵は確かめられず失敗する）。
 */
export const SSH_COMMAND = "ssh";

export const SSH_OPTIONS: readonly string[] = [
  "-T",
  "-o",
  "BatchMode=yes",
  "-o",
  "NumberOfPasswordPrompts=0",
  "-o",
  "ConnectTimeout=10",
  "-o",
  "ConnectionAttempts=1",
  "-o",
  "ServerAliveInterval=15",
  "-o",
  "ServerAliveCountMax=4",
];

/** 規則に合わない宛先・session は投げる（登録簿の検証と二重。起動の直前でも確かめる）。 */
export function sshArgsFor(profile: { target: string; session?: string | undefined }): string[] {
  const tp = targetProblem(profile.target);
  if (tp !== undefined) throw new RangeError(`invalid ssh target: ${tp}`);
  const sp = remoteSessionProblem(profile.session);
  if (sp !== undefined) throw new RangeError(`invalid remote session: ${sp}`);
  return [
    ...SSH_OPTIONS,
    "--",
    profile.target,
    "soda",
    "bridge",
    ...(profile.session !== undefined ? ["--session", profile.session] : []),
  ];
}
