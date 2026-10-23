// Native diagnostics are an allowlist, never exception text from the shared PC.
const failures: Record<string, string> = {
  worker_identity: "ロック解除の補助プログラムが必要な権限で起動していません。共有元の補助サービスを確認してください。",
  worker_session_unavailable: "共有元のWindowsセッションを確認できません。接続先のログイン状態を確認してください。",
  worker_input_desktop_open: "共有元の認証画面を開けません。ロック解除の補助サービスを確認してください。",
  worker_input_desktop_query: "共有元の認証画面を確認できません。ロック解除の補助サービスを確認してください。",
  worker_input_desktop_other: "共有元が対応する認証画面ではありません。接続先の画面状態を確認してください。",
  worker_guard: "共有元の認証画面の安全確認に失敗しました。接続先の画面状態を確認してください。",
  worker_initialization: "共有元の認証画面の準備に失敗しました。ロック解除の補助サービスを確認してください。",
  worker_no_output: "共有元のロック解除プログラムが応答せず終了しました。補助サービスを確認してください。",
  worker_ended: "共有元の認証画面の配信が終了しました。画面の切り替えは確認できませんでした。接続先の状態を確認してください。",
  worker_start_or_connection: "共有元のロック解除プログラムを起動または接続できません。補助サービスを確認してください。",
};
export function unlockFailure(code: unknown): { retry: boolean; message: string } | undefined {
  if (typeof code !== "string") return;
  if (["source_transition", "worker_input_desktop_default", "worker_session_unlocked"].includes(code))
    return { retry: true, message: "共有元のロック画面が切り替わっています。" };
  if (Object.hasOwn(failures, code)) return { retry: false, message: failures[code]! };
}
