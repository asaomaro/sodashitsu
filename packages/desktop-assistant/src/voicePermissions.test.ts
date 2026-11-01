import {expect,it} from "vitest";
import {authorizeLocalSender,type LocalRole} from "./security.js";
it("allows voice matching only from the current settings main frame",()=>{
 for(const role of ["settings","bubble","character","notice"] as LocalRole[]){
  const sender={frameUrl:`soda-assistant://app/${role}.html`,mainFrame:true,current:true,role};
  expect(authorizeLocalSender(sender,"voice-match")).toBe(role==="settings");
  expect(authorizeLocalSender({...sender,mainFrame:false},"voice-match")).toBe(false);
 }
});
