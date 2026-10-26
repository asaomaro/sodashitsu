import {expect,it} from 'vitest';
import {DesktopVirtualFailure,desktopVirtualFailureMessage,DesktopOptions,DesktopReady,DesktopPermissions} from './index.js';
it('keeps virtual creation explicit and separately authorized',()=>{
 expect(DesktopOptions.parse({})).not.toHaveProperty('virtualDisplay');expect(DesktopOptions.parse({virtualDisplay:true})).toMatchObject({virtualDisplay:true});expect(DesktopOptions.safeParse({virtualDisplay:'true'}).success).toBe(false);
 expect(DesktopPermissions.parse({enabled:true,allowInput:false,allowClipboard:false,allowDisplayResize:false,allowVirtualDisplay:true})).toMatchObject({allowVirtualDisplay:true});
 expect(DesktopReady.safeParse({type:'ready',title:'generated',allowInput:false,width:640,height:480,backend:'synthetic',virtualDisplay:true}).success).toBe(true);
});
it('only forwards bounded virtual failure codes and uses fixed public descriptions',()=>{
 for(const code of ['driver_missing','driver_unavailable','broker_missing','broker_unavailable','permission_denied','unsupported','timeout','target_changed','lease_lost','helper_incompatible','failed'] as const){expect(DesktopVirtualFailure.parse({type:'virtual_display_failure',code}).code).toBe(code);expect(desktopVirtualFailureMessage(code).length).toBeGreaterThan(5);}
 expect(DesktopVirtualFailure.safeParse({type:'virtual_display_failure',code:'C:\\private\\window'}).success).toBe(false);expect(DesktopVirtualFailure.safeParse({type:'virtual_display_failure',code:'failed',message:'private native exception'}).success).toBe(false);
});
