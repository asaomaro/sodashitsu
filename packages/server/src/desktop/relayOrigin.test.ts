import {expect,it} from 'vitest';
import {desktopRelayOrigin} from './relayOrigin.js';
it('uses a configured reachable HTTPS origin for a loopback browser',()=>{
 for(const local of ['http://127.0.0.1:7780','http://localhost:7780','http://[::1]:7780'])expect(desktopRelayOrigin(local,['https://controller.example'])).toBe('https://controller.example');
});
it('preserves public browser origins and never guesses a callback host',()=>{
 expect(desktopRelayOrigin('https://browser.example',['https://controller.example'])).toBe('https://browser.example');
 expect(desktopRelayOrigin('https://127.example.com',['https://controller.example'])).toBe('https://127.example.com');
 expect(desktopRelayOrigin('http://localhost:7780',[])).toBe('http://localhost:7780');
});
it('rejects non-HTTPS, loopback, credentials, paths, queries and fragments in fallback origins',()=>{
 const invalid=['http://controller.example','https://localhost','https://127.0.0.1','https://user:password@controller.example','https://controller.example/path','https://controller.example?q=1','https://controller.example/#fragment','not a URL'];
 expect(desktopRelayOrigin('http://localhost:7780',invalid)).toBe('http://localhost:7780');
});
