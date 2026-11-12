import {expect,it,vi} from 'vitest';
import {desktopSigninStartup} from './DesktopSigninStartup.js';
it('runs only the normal cycle and stops after cancellation',async()=>{
 const controller=new AbortController(),cycle=vi.fn(async()=>{controller.abort();return 'inactive' as const;}),pause=vi.fn(async()=>{});
 await expect(desktopSigninStartup('S-1-5-21-1-2-3-1001',controller.signal,{cycle,pause})).resolves.toBe('normal');
 expect(cycle).toHaveBeenCalledOnce();expect(pause).not.toHaveBeenCalled();
});
it('does not start a cycle after cancellation',async()=>{
 const controller=new AbortController();controller.abort();const cycle=vi.fn(),pause=vi.fn();
 await desktopSigninStartup('S-1-5-21-1-2-3-1001',controller.signal,{cycle,pause});expect(cycle).not.toHaveBeenCalled();
});
it('propagates an uncertain cycle failure without retrying it',async()=>{
 const controller=new AbortController(),cycle=vi.fn(async()=>{throw Error('generated failure');}),pause=vi.fn();
 await expect(desktopSigninStartup('S-1-5-21-1-2-3-1001',controller.signal,{cycle,pause})).rejects.toThrow('generated failure');expect(cycle).toHaveBeenCalledOnce();expect(pause).not.toHaveBeenCalled();
});
