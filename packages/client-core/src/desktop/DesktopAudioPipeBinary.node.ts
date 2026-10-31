import {DesktopNativeRoleBinary} from './DesktopNativeRoleBinary.node.js';
/** Fixed binary AUDIO TRANSPORT role; it does not enumerate/open audio devices. */
export class DesktopAudioPipeBinary extends DesktopNativeRoleBinary{
 constructor(os:NodeJS.Platform=process.platform,env:NodeJS.ProcessEnv=process.env){super('audio',os,env);}
}
