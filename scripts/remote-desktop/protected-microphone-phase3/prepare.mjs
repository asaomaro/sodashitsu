// Writes an intentionally non-executable manifest. Supervisor approval/expiry is a separate step.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {dirname,join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';import {sha} from './safety.mjs';
export const FIXTURE_FILES=['absolute-pcm.mjs','calibrate.mjs','detector.mjs','Receiver.cs','Endpoint.cs','Probe.cs','DetectorChecks.cs','run-a.mjs','private-server.mjs','safety.mjs','build-fixture.mjs','prepare.mjs'];
export async function prepare(seed){
 const root=dirname(fileURLToPath(import.meta.url)),compile=JSON.parse(await readFile(join(seed.fixtureBin,'compile-receipt.json'),'utf8'));
 if(!compile.results?.every(r=>r.exitCode===0)||Object.keys(compile.binaries??{}).length!==3)throw Error('compiled-fixture-required');
 const fixtureSha256={};for(const name of FIXTURE_FILES)fixtureSha256[name]=sha(await readFile(join(root,name)));
 const manifest={...seed,approved:false,scenario:'A',jobId:randomUUID(),expiresAt:null,fixtureSha256,binarySha256:compile.binaries,nodeExeSha256:sha(await readFile(process.execPath)),gitExeSha256:sha(await readFile(seed.gitExe)),compileReceiptSha256:sha(await readFile(join(seed.fixtureBin,'compile-receipt.json')))};
 await mkdir(seed.jobRoot,{recursive:false,mode:0o700});await writeFile(join(seed.jobRoot,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});return{approved:false,created:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error('one-local-seed-required');await prepare(JSON.parse(await readFile(resolve(process.argv[2]),'utf8')));}
