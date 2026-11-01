/** Visible artwork frames; source PNGs are preserved without resampling. */
export const builtinCharacters = {
  "captain-male": {name:"男性船長",file:"captain-male.png",frame:{x:105,y:22,w:735,h:1501,width:1024,height:1536}},
  "captain-female": {name:"女性船長",file:"captain-female.png",frame:{x:133,y:6,w:732,h:1521,width:1024,height:1536}},
  "captain-robot": {name:"ロボット船長",file:"captain-robot.png",frame:{x:150,y:10,w:870,h:1359,width:1145,height:1374}},
  "sodashitsu-icon": {name:"操舵室アイコン",file:"sodashitsu-icon.svg",frame:{x:1.5,y:1.5,w:61,h:61,width:64,height:64}},
} as const;
export function builtinCharacter(id:string) {
 return builtinCharacters[id as keyof typeof builtinCharacters] ?? builtinCharacters["captain-female"];
}
