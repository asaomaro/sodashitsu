// Copy data only. Never executes a yukkuri-work module or modifies its source.
import {readFile,lstat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const [source,...extra]=process.argv.slice(2);
if(!source||extra.length)throw Error('node scripts/sync-assistant-character-profiles.mjs /path/to/yukkuri-kaisetsu/characters.json');
const stat=await lstat(source);
if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)throw Error('Use a regular character settings JSON file up to 256KiB');
const bytes=await readFile(source),data=JSON.parse(bytes.toString('utf8'));
if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Character settings object required');
for(const [key,value]of Object.entries(data)){
 if(['__proto__','prototype','constructor'].includes(key)||!/^_?[a-z_][a-z0-9_]*$/.test(key))throw Error('Invalid profile key');
 if(key.startsWith('_'))continue;
 if(!value||typeof value!=='object'||typeof value.name!=='string'||typeof value.tone!=='string'||!Array.isArray(value.first)||value.first.some(v=>typeof v!=='string'))throw Error('Profile name, tone and first-person list required');
}
const provenance={path:'yukkuri-work/skills/video/yukkuri-kaisetsu/characters.json',sha256:createHash('sha256').update(bytes).digest('hex'),syncedAt:new Date().toISOString().slice(0,10)};
const output='// Synced from yukkuri-work/skills/video/yukkuri-kaisetsu/characters.json.\n// Keep the source notes: official character facts and video conventions are distinct.\nexport const ASSISTANT_CHARACTER_PROFILE_SOURCE = '+JSON.stringify(provenance)+' as const;\nexport const YUKKURI_CHARACTER_PROFILES = '+JSON.stringify(data,null,2)+' as const;\n';
await writeFile(fileURLToPath(new URL('../packages/protocol/src/assistantCharacterProfiles.ts',import.meta.url)),output);
console.log(`Saved ${Object.keys(data).filter(k=>!k.startsWith('_')).length} character profiles`);
