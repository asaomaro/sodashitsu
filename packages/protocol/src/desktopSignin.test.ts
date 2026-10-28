import {expect,it} from "vitest";
import {DesktopSigninGrant,DesktopSigninRequired} from "./desktopSignin.js";
import {desktopFeaturesProtocol,desktopFeaturesFromProtocols} from "./desktopFeatures.js";
const id="12345678-1234-4234-8234-123456789012";
it("announces signin inside the existing bounded feature bitset",()=>{const wire=desktopFeaturesProtocol(["signin","endpointClose"]);expect(wire).toHaveLength(57);expect(desktopFeaturesFromProtocols([wire]).has("signin")).toBe(true);expect(desktopFeaturesFromProtocols([desktopFeaturesProtocol(["endpointClose"])]).has("signin")).toBe(false);});
it("requires explicit one-connection consent and rejects implicit or extended grants",()=>{expect(DesktopSigninGrant.parse({type:"signin_grant",id,control:false}).control).toBe(false);for(const value of [{type:"signin_grant",id},{type:"signin_grant",id,control:true,persist:true},{type:"signin_grant",id:"old",control:true}])expect(DesktopSigninGrant.safeParse(value).success).toBe(false);});
it("requires a bounded typed offer without accepting extra permissions",()=>{const offer={type:"signin_required",id,allowInput:false,validForMs:120000};expect(DesktopSigninRequired.parse(offer)).toEqual(offer);expect(DesktopSigninRequired.safeParse({...offer,allowAgent:true}).success).toBe(false);expect(DesktopSigninRequired.safeParse({...offer,validForMs:0}).success).toBe(false);});
