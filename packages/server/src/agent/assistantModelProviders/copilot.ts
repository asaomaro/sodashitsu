import type {AssistantModelProviderResult} from './types.js';
// Installed @github/copilot 0.0.362 SDK SupportedModel and CLI --help references.
// getAvailableModels requires AuthInfo; there is no public normal-auth resolver in this version.
// Do not extract tokens, import private internals, or claim these are an account's current catalog.
const REFERENCE=['claude-sonnet-4.5','claude-sonnet-4','claude-haiku-4.5','gpt-5','gpt-5.1','gpt-5.1-codex-mini','gpt-5.1-codex','gemini-3-pro-preview'];
export async function readCopilotModelOptions():Promise<AssistantModelProviderResult>{
 return{models:REFERENCE.map(id=>({id,label:id,efforts:[]})),source:'reference',message:'Copilot CLI 0.0.362の公開定義を基にした参考候補です。現在の契約の候補とeffortは未取得です。既定値または保存済みモデルも使用できます。'};
}
