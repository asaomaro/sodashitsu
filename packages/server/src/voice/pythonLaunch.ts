import {execFileSync} from 'node:child_process';
import type {VoiceProfile} from './VoiceResident.js';

/** WSL owns the private IPC endpoint; a Windows Python process owns DirectML. */
export function pythonLaunch(profile:VoiceProfile,platform=process.platform,convert=(path:string)=>execFileSync('wslpath',['-w',path],{encoding:'utf8'}).trim()){
 const windows=platform==='linux'&&/\.exe$/i.test(profile.python);
 const path=(value:string)=>windows?convert(value):value;
 const pythonPath=profile.pythonPath?path(profile.pythonPath):undefined;
 // WSL does not forward arbitrary environment variables to Windows executables.
 // Configure Python inside that process, then pass it to its native child too.
 const bootstrap='import os,sys; p=sys.argv[1]; sys.path.insert(0,p) if p else None; os.environ["PYTHONPATH"]=p; os.environ["PYTHONUTF8"]="1"; sys.argv=sys.argv[2:]; ';
 return {
  path,
  env:{...process.env,...(!windows&&pythonPath?{PYTHONPATH:pythonPath}:{}),PYTHONUTF8:'1'},
  code:(source:string)=>windows?['-u','-c',bootstrap+'exec(sys.argv[0])',pythonPath??'',source]:['-u','-c',source],
  script:(file:string)=>windows?['-u','-c',bootstrap+'import runpy; sys.path.insert(0,os.path.dirname(sys.argv[0])); runpy.run_path(sys.argv[0],run_name="__main__")',pythonPath??'',path(file)]:['-u',file],
 };
}
