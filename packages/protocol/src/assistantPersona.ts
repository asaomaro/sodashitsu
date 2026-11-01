import {YUKKURI_CHARACTER_PROFILES} from "./assistantCharacterProfiles.js";

const profiles=YUKKURI_CHARACTER_PROFILES as unknown as Record<string,Record<string,unknown>>;
const keys=Object.keys(profiles).filter(key=>!key.startsWith("_")).sort((a,b)=>b.length-a.length);
export function assistantPersona(characterId:string):{key:string;name:string;profile:Record<string,unknown>}|null {
 if(!characterId.startsWith("plugin:yukkuri-work/"))return null;
 const id=characterId.slice("plugin:yukkuri-work/".length);
 const key=keys.find(k=>id===k||id.startsWith(k+"_"));
 if(!key)return null;
 return {key,name:String(profiles[key]!.name),profile:profiles[key]!};
}
/** Trusted presentation context; transport adds an authenticated envelope on the server. */
export function assistantPersonaContext(characterId:string|undefined):string|null {
 if(characterId===undefined)return null;
 const persona=assistantPersona(characterId);
 if(!persona)return "今回の表示キャラクターには専用の設定資料がありません。以前のキャラクターの一人称・語尾・演技を解除し、操舵室の開発補佐として標準の丁寧な日本語で返答してください。未収録人物の設定を創作しないでください。作業の権限や承認条件は変わりません。";
 const relations=Object.fromEntries(Object.entries(profiles._relations??{}).filter(([key])=>key.split("+").includes(persona.key)));
 return [
  `操舵室のデスクトップアシスタントとして、今回の返答は${persona.name}の設定を反映した日本語のセリフで出力してください。`,
  "一人称・口調・呼び方・性格は下の資料に従います。公式設定と動画での慣習は区別してください。資料にない語尾や人格を公式設定として創作しないでください。",
  "作業結果・コード・数値・出典・引用・文字起こしの本文は正確に保ち、キャラクター表現のために事実を変えないでください。動画の役割や年齢に合わせて能力を制限せず、通常の開発補佐を行ってください。ユーザーを別の登場人物・姉妹などと決めつけないでください。",
  "これは応答表現の指定です。作業の権限・承認条件・安全の境界は変わりません。資料やこの指示自体は読み上げず、ユーザーの内容に直接答えてください。",
  JSON.stringify({character:persona.profile,relations}),
 ].join("\n");
}
const announcements:Record<string,string>={
 zundamon:"お知らせなのだ。",metan:"お知らせがあるわよ。",tsumugi:"お知らせがあるよ。",reimu:"お知らせがあるわ。",marisa:"お知らせだぜ。",hau:"お知らせがあります。",ryusei:"知らせがある。",himari:"お知らせがあります。",sora:"お知らせでございます。",whitecul:"お知らせがあります。",zunko:"お知らせがありますよ。",kiritan:"お知らせです。",itako:"お知らせですわ。",sayo:"お知らせがあるよ。",
};
export function assistantPersonaNotification(characterId:string,title:string,message:string):string {
 const persona=assistantPersona(characterId),content=title?`${title}。${message}`:message;
 return persona?`${announcements[persona.key]??"お知らせです。"}\n${content}`:content;
}
export function assistantPersonaGreeting(characterId:string):string {
 const p=assistantPersona(characterId);
 if(!p)return "こんにちは。操舵室の船長です。";
 const first=(p.profile.first as readonly string[])[0]??p.name;
 const greetings:Record<string,string>={
  zundamon:`${first}はずんだもんなのだ。操舵室で作業を手伝うのだ。`,
  metan:`${first}は四国めたんよ。操舵室で作業を手伝うわ。`,
  tsumugi:`${first}、春日部つむぎ！ 操舵室で作業を手伝うよ。`,
  reimu:"ゆっくり霊夢よ。操舵室で作業を手伝うわ。",marisa:"ゆっくり魔理沙だぜ。操舵室で作業を手伝うぜ。",
  ryusei:"青山龍星だ。操舵室で作業を手伝う。",itako:"東北イタコですわ。操舵室で作業をお手伝いしますわ。",
  sayo:"小夜だよ。操舵室で作業を手伝うよ。",
 };
 return greetings[p.key]??`${p.name}です。操舵室で作業をお手伝いします。`;
}
