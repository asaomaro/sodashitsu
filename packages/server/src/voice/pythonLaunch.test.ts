import {expect,it,vi} from 'vitest';
import {pythonLaunch} from './pythonLaunch.js';
const profile={python:'/mnt/c/Python/python.exe',pythonPath:'/mnt/c/音声/python',runtimeDir:'/mnt/c/音声/runtime',threads:2,accelerationMode:'AUTO' as const};
it('bootstraps Windows Python with native paths and preserves source as an argument',()=>{
 const convert=vi.fn((value:string)=>'WIN:'+value),launch=pythonLaunch(profile,'linux',convert);
 const code='print("日本語")',args=launch.code(code);
 expect(args.at(-1)).toBe(code);expect(args).toContain('WIN:'+profile.pythonPath);
 expect(launch.script('/voice/resident.py').at(-1)).toBe('WIN:/voice/resident.py');
 expect(launch.path(profile.runtimeDir)).toBe('WIN:'+profile.runtimeDir);
 expect(args[2]).toContain('os.environ["PYTHONPATH"]');
});
it('keeps Linux and native Windows Python launches direct',()=>{
 const convert=vi.fn();
 expect(pythonLaunch({...profile,python:'/usr/bin/python3'},'linux',convert).script('/voice/resident.py')).toEqual(['-u','/voice/resident.py']);
 expect(pythonLaunch(profile,'win32',convert).code('print(1)')).toEqual(['-u','-c','print(1)']);
 expect(convert).not.toHaveBeenCalled();
});
