import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {DesktopFileCheckpoints} from './DesktopFileCheckpoints.js';
import {DesktopFolderCheckpoints} from './DesktopFolderCheckpoints.js';
import {DesktopTransferStore} from './DesktopTransferStore.js';
export function desktopSavedBinding(settings:string,endpointOnly:boolean){return createHash('sha256').update(JSON.stringify({settings,endpointOnly})).digest('hex');}
export function createDesktopSavedTransferState(directory:string,binding:string,endpointOnly:boolean){
 const scope=desktopSavedBinding(binding,endpointOnly),store=new DesktopTransferStore({directory,binding:scope});
 return{directory,scope,store,files:new DesktopFileCheckpoints(store),folders:new DesktopFolderCheckpoints(new DesktopTransferStore({directory:join(dirname(directory),'desktop-folder-transfers'),binding:scope,folderRecords:true}))};
}
export type DesktopSavedTransferState=ReturnType<typeof createDesktopSavedTransferState>;
