import {expect,test} from "../support/fixtures.js";

test("amount-only statusline quota renders without a fabricated percentage",async({page,appServer})=>{
 const client=await appServer.openClient();const hello=await client.request("client.hello",{protocol:1,kind:"desktop"});
 const now=Date.now();
 await page.routeWebSocket(/\/ws$/,route=>route.onMessage(async data=>{
  if(typeof data!=="string")return;const request=JSON.parse(data);if(!request.method)return;
  try{const result=request.method==="client.hello"?hello:request.method==="agent.usage"?{panes:{},accounts:[{kind:"agy",accountKey:"generated-balance",label:"Antigravity CLI",plan:"Pro",source:"statusline",asOf:now,windows:[],balances:[{label:"credits",remaining:123.5,resetsAt:now+3600000}]}]}:request.method==="agent.usage_watch"?{}:await client.request(request.method,request.params??{});route.send(JSON.stringify({id:request.id,result}));}catch{route.send(JSON.stringify({id:request.id,error:{code:"internal",message:"test RPC"}}));}
 }));
 const separator=appServer.cookie.indexOf("=");await page.context().addCookies([{name:appServer.cookie.slice(0,separator),value:appServer.cookie.slice(separator+1),url:appServer.origin,httpOnly:true,sameSite:"Strict"}]);
 await page.addInitScript(()=>localStorage.setItem("soda.prefs.v1",JSON.stringify({onboarding:false,uiStyle:"modern"})));
 await page.goto(appServer.origin);await page.locator('[data-screen-id="dashboard"]').click();
 const card=page.locator('[data-dash-account="generated-balance"]');await expect(card).toBeVisible();await expect(card.locator("[data-dash-balance]")).toContainText("残量 123.5");await expect(card.locator('[role="progressbar"]')).toHaveCount(0);await expect(card).not.toContainText("枠の値がありません");
 await page.screenshot({path:test.info().outputPath("statusline-balance.png")});client.close();
});
