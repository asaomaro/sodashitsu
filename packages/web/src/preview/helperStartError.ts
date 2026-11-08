export type PreviewHelperStage = "start" | "probe" | "local-proof" | "attach";
/** Do not expose RPC text: it can contain peer details or opaque credentials. */
export class PreviewHelperStartError extends Error {
  constructor(readonly stage:PreviewHelperStage, cause:unknown) {
    const code=typeof cause==='object'&&cause!==null&&'code'in cause?cause.code:undefined;
    const message=code==='method_not_found'||code==='unknown_method'
      ? "操作元の操舵室はhelperの自動起動APIに対応していません。"
      : stage==='local-proof'
      ? "ブラウザから操作元PCのlocalhost確認ページでの本人確認を完了できませんでした。ブラウザのローカル接続制限や、ブラウザと操舵室が別PCかを確認してください。"
      : code==='not_found'
      ? "操作元から選択先の表示許可または接続先を確認できませんでした。URL・操作元の操舵室・接続先PCが、この画面と同じ経路か確認してください。"
      : code==='server_busy'
      ? "helperの起動処理が混み合っています。少し待って再試行してください。"
      : code==='unauthorized'
      ? "helperの自動起動に必要な接続権限またはブラウザPCの確認が成立しませんでした。"
      : "helperの自動起動に失敗しました。操作元と接続先PCの接続を確認して再試行してください。";
    super(message);this.name='PreviewHelperStartError';
  }
}
export function previewHelperErrorMessage(error:unknown):string {
  return error instanceof PreviewHelperStartError?error.message:"helperの自動起動に失敗しました。操作元と接続先PCの接続を確認して再試行してください。";
}
