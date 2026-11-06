import {expect,it,vi} from 'vitest';
const metadata=vi.hoisted(()=>vi.fn(async()=>{}));
vi.mock('./DesktopWindowsMetadata.node.js',()=>({desktopWindowsMetadata:metadata}));
import {checkDesktopWindowsPaths} from './DesktopEndpointAcl.node.js';
it('passes a bounded Windows ACL batch as one JSON argument and never caches a read',async()=>{
 metadata.mockClear();const paths=['C:\\state','C:\\state\\desktop-endpoint','C:\\state\\desktop-endpoint\\identity.json'];
 await checkDesktopWindowsPaths(paths);await checkDesktopWindowsPaths(paths);
 expect(metadata.mock.calls).toEqual(Array.from({length:2},()=>['check-endpoint-acl.ps1',['-PathsBase64',Buffer.from(JSON.stringify(paths),'utf8').toString('base64')],'endpoint_acl_valid']));
});
it.each([[],Array(9).fill('C:\\state'),['\\\\server\\share'],['relative'],['C:\\'+'a'.repeat(4097)]].map(paths=>({paths})))('rejects invalid or oversized ACL batches %#',async({paths})=>{
 metadata.mockClear();await expect(checkDesktopWindowsPaths(paths)).rejects.toThrow();expect(metadata).not.toHaveBeenCalled();
});
