import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {expect,it,vi} from 'vitest';
const launch=vi.hoisted(()=>vi.fn());
vi.mock('node:child_process',()=>({spawn:launch}));
import {ChildProcessGitRunner} from './GitRunner.js';
it('runs background git without a Windows console and preserves its piped result',async()=>{
 const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});launch.mockReturnValueOnce(child);
 const result=new ChildProcessGitRunner().run('C:\\generated-repository',['status','--porcelain'],5000);
 // The Windows default terminal must not receive a new visible console for every poll.
 const options=launch.mock.calls[0]?.[2];try{expect(options).toMatchObject({windowsHide:true,stdio:['ignore','pipe','pipe']});expect(options.shell).not.toBe(true);}
 finally{child.stdout.write(' M example.txt\n');child.stderr.write('generated diagnostic');child.emit('close',0);}
 await expect(result).resolves.toEqual({code:0,stdout:' M example.txt\n',stderr:'generated diagnostic'});
});
