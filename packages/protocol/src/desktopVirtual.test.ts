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
it('requires virtual drag proof to name a fenced normal virtual source with files',()=>{
 const proof={type:'ready',title:'generated',allowInput:true,width:320,height:200,backend:'synthetic',virtualDisplay:true,files:true,virtualNativeDrag:true};
 expect(DesktopReady.safeParse(proof).success).toBe(true);
 for(const missing of ['virtualDisplay','files']){const bad={...proof} as Record<string,unknown>;delete bad[missing];expect(DesktopReady.safeParse(bad).success).toBe(false);}
 for(const extra of [{secureDesktop:true},{lockScreenCover:true},{virtualMonitors:true},{virtualNativeDrag:false},{virtualNativeDragProof:true}])expect(DesktopReady.safeParse({...proof,...extra}).success).toBe(false);
 expect(DesktopReady.parse({...proof,virtualNativeDrag:undefined})).not.toHaveProperty('virtualNativeDragProof');
 expect(DesktopOptions.parse({virtualDisplay:true,files:true,virtualNativeDrag:true})).toMatchObject({virtualNativeDrag:true});
});
