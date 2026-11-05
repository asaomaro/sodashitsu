/** Run after pnpm build on an unlocked Windows PC. Operates only on its own temporary test form. */
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {windowsUiAutomationScript} from '../../packages/server/dist/desktop/WindowsUiAutomationScript.js';
if(process.platform!=='win32')throw Error('Run this verification on an unlocked native Windows desktop');
const root=await mkdtemp(join(tmpdir(),'soda-ui-verification-')),marker=join(root,'ui-fixture.json');
const fixtureScript="$ErrorActionPreference='Stop'\nAdd-Type -AssemblyName System.Windows.Forms\n$root=$env:SODA_UI_FIXTURE_ROOT\n$marker=Join-Path $root 'ui-fixture.json';$stop=Join-Path $root 'ui-fixture-stop'\nif(Test-Path $stop){Remove-Item -LiteralPath $stop}\n$form=New-Object Windows.Forms.Form;$form.Text='Sodashitsu UI Automation verification';$form.Width=540;$form.Height=340;$form.StartPosition='CenterScreen'\n$fixtureInput=New-Object Windows.Forms.TextBox;$fixtureInput.Name='fixture-input';$fixtureInput.AccessibleName='Fixture input';$fixtureInput.Text='before';$fixtureInput.SetBounds(20,20,450,30)\n$button=New-Object Windows.Forms.Button;$button.Name='fixture-button';$button.Text='Apply fixture';$button.SetBounds(20,65,160,35)\n$check=New-Object Windows.Forms.CheckBox;$check.Name='fixture-check';$check.Text='Fixture toggle';$check.SetBounds(20,115,200,30)\n$password=New-Object Windows.Forms.TextBox;$password.Name='fixture-password';$password.AccessibleName='Fixture password';$password.UseSystemPasswordChar=$true;$password.Text='fixture-private-value';$password.SetBounds(20,160,450,30)\n$label=New-Object Windows.Forms.Label;$label.Name='fixture-count';$label.Text='Clicks: 0';$label.SetBounds(20,205,200,30)\n$form.Controls.AddRange(@($fixtureInput,$button,$check,$password,$label));$script:clicks=0\nfunction Publish-Fixture { [IO.File]::WriteAllText($marker,(@{windowId=$form.Handle.ToInt64().ToString();processId=$PID;value=$fixtureInput.Text;checked=$check.Checked;clicks=$script:clicks}|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false)) }\n$button.Add_Click({$script:clicks++;$label.Text='Clicks: '+$script:clicks;Publish-Fixture})\n$fixtureInput.Add_TextChanged({Publish-Fixture});$check.Add_CheckedChanged({Publish-Fixture});$form.Add_Shown({$form.Activate();Publish-Fixture})\n$deadline=[DateTime]::UtcNow.AddMinutes(5);$timer=New-Object Windows.Forms.Timer;$timer.Interval=250;$timer.Add_Tick({if((Test-Path $stop)-or[DateTime]::UtcNow -gt $deadline){$timer.Stop();$form.Close()}});$timer.Start()\ntry{[Windows.Forms.Application]::Run($form)}finally{$timer.Dispose();$form.Dispose()}\n";
await writeFile(join(root,'fixture.ps1'),fixtureScript);
const fixtureProcess=spawn(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-STA','-File',join(root,'fixture.ps1')],{env:{...process.env,SODA_UI_FIXTURE_ROOT:root},stdio:'ignore'});
fixtureProcess.on('error',()=>{});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const run=request=>new Promise((resolve,reject)=>{
 const child=execFile(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-MTA','-EncodedCommand',Buffer.from(windowsUiAutomationScript,'utf16le').toString('base64')],{windowsHide:true,timeout:12000,maxBuffer:2*1024*1024},(error,stdout,stderr)=>{if(error)return reject(Error('UI helper failed: '+stderr.slice(0,2500)));try{resolve(JSON.parse(stdout));}catch{reject(Error('UI helper output invalid'));}});child.stdin.end(JSON.stringify(request));
});
try{
 let fixture;for(let i=0;i<50;i++){try{fixture=JSON.parse(await readFile(marker,'utf8'));break;}catch{await delay(100);}}
 if(!fixture)throw Error('Owned fixture not ready');
 const observe=()=>run({mode:'observe',windowId:fixture.windowId});
 let tree=await observe();
 if(tree.unavailable){console.log(JSON.stringify({available:false}));process.exitCode=2;}
 else{
  const password=tree.elements.find(e=>e.password);
  if(!password||password.value!==null||password.name!=='Password'||password.actions.length)throw Error('Password privacy check failed');
  const act=async(name,action,value)=>{
   tree=await observe();const element=tree.elements.find(e=>e.name===name&&e.actions.includes(action));if(!element)throw Error('Owned fixture control unavailable: '+name);
   const result=await run({mode:'act',windowId:fixture.windowId,processId:tree.window.processId,started:tree.started,rootRuntime:tree.rootRuntime,runtime:element.runtime,signature:element.signature,action,...(value===undefined?{}:{value})});if(!result.acted)throw Error('UI action not acknowledged: '+action);
  };
  await act('Fixture input','set_value','after');await act('Apply fixture','invoke');await act('Fixture toggle','toggle');
  const stale=tree.elements.find(e=>e.name==='Fixture toggle');
  const rejected=await run({mode:'act',windowId:fixture.windowId,processId:tree.window.processId,started:tree.started,rootRuntime:tree.rootRuntime,runtime:stale.runtime,signature:stale.signature,action:'toggle'});
  if(!rejected.unavailable)throw Error('Changed checkbox state was accepted from a stale observation');
  let result;for(let i=0;i<40;i++){result=JSON.parse(await readFile(marker,'utf8'));if(result.value==='after'&&result.clicks===1&&result.checked)break;await delay(100);}
  if(result.value!=='after'||result.clicks!==1||!result.checked)throw Error('Native fixture did not reflect UI actions');
  console.log(JSON.stringify({available:true,elements:tree.elements.length,setValue:true,invoke:true,toggle:true,passwordExcluded:true,changedStateRejected:true}));
 }
}finally{await writeFile(join(root,'ui-fixture-stop'),'stop');await delay(600);if(fixtureProcess.exitCode===null)fixtureProcess.kill();await rm(root,{recursive:true,force:true});}
