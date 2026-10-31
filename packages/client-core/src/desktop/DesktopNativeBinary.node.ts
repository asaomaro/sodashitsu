import {DesktopNativeRoleBinary} from './DesktopNativeRoleBinary.node.js';
/** Fixed COPY role of soda's common current-user host. */
export class DesktopNativeBinary extends DesktopNativeRoleBinary{
 constructor(os:NodeJS.Platform=process.platform,env:NodeJS.ProcessEnv=process.env){super('copy',os,env);}
}
