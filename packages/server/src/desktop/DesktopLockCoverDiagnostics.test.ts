import{expect,it}from'vitest';import{DesktopLockCoverDiagnostics,type DesktopLockCoverRecord}from'./DesktopLockCoverDiagnostics.js';
it('only reports exact fixed stages/counts, handles stream splits and never falls back to raw helper text',()=>{
 const records:DesktopLockCoverRecord[]=[];const channel=new DesktopLockCoverDiagnostics(r=>records.push(r)).channel(()=>true);
 channel.push(Buffer.from('SODA_LOCK_CO'));channel.push(Buffer.from('VER enter_result 2\r\nSODA_LOCK_COVER wake_selected\n'));
 for(const text of ['SODA_LOCK_COVER enter_result 3','SODA_LOCK_COVER enter_result -1','SODA_LOCK_COVER enter_result 2 PRIVATE','SODA_LOCK_COVER enter_result','SODA_LOCK_COVER wake_selected 1','SODA_LOCK_COVER arbitrary_exception','private path/secret/window title'])channel.push(Buffer.from(text+'\n'));
 expect(records).toEqual([{stage:'enter_result',inserted:2},{stage:'wake_selected'}]);expect(JSON.stringify(records)).not.toMatch(/PRIVATE|secret|path/);
});
it('drops oversized lines/chunks without making later fixed records part of discarded text',()=>{
 const records:DesktopLockCoverRecord[]=[];const channel=new DesktopLockCoverDiagnostics(r=>records.push(r)).channel(()=>true);
 channel.push(Buffer.from('x'.repeat(129)));channel.push(Buffer.from('SODA_LOCK_COVER enter_result 2\n'));channel.push(Buffer.from('x'.repeat(65537)));channel.push(Buffer.from('SODA_LOCK_COVER enter_result 2\n'));expect(records).toEqual([]);channel.push(Buffer.from('SODA_LOCK_COVER enter_result 0\n'));expect(records).toEqual([{stage:'enter_result',inserted:0}]);
});
it('retires a channel on scope revocation and ignores closed or late physical-helper records',()=>{
 let active=true;const records:DesktopLockCoverRecord[]=[];const channel=new DesktopLockCoverDiagnostics(r=>records.push(r)).channel(()=>active);
 channel.push(Buffer.from('SODA_LOCK_COVER enter_'));active=false;channel.push(Buffer.from('result 2\n'));active=true;channel.push(Buffer.from('SODA_LOCK_COVER enter_result 2\n'));expect(records).toEqual([]);
 const next=new DesktopLockCoverDiagnostics(r=>records.push(r)).channel(()=>true);next.close();next.push(Buffer.from('SODA_LOCK_COVER enter_result 2\n'));expect(records).toEqual([]);
});
it('bounds metadata to eight records per helper and 128 per provider even if logger throws',()=>{
 let calls=0;const logger=new DesktopLockCoverDiagnostics(()=>{calls++;throw Error('generated logger failure');});
 const channel=logger.channel(()=>true);expect(()=>channel.push(Buffer.from('SODA_LOCK_COVER enter_result 1\n'.repeat(20)))).not.toThrow();expect(calls).toBe(8);
 for(let n=0;n<30;n++)logger.channel(()=>true).push(Buffer.from('SODA_LOCK_COVER enter_result 1\n'.repeat(20)));expect(calls).toBe(128);
});
