import {z} from "zod";
export const DesktopUiAction=z.enum(["invoke","set_value","toggle","select","expand","collapse","focus"]);
export type DesktopUiAction=z.infer<typeof DesktopUiAction>;
export const DesktopUiObserveParams=z.object({leaseId:z.string().regex(/^[A-Za-z0-9_-]{43}$/),windowId:z.string().regex(/^[1-9][0-9]{0,18}$/).optional()}).strict();
export const DesktopUiActParams=z.object({leaseId:z.string().regex(/^[A-Za-z0-9_-]{43}$/),observationId:z.uuid(),elementId:z.uuid(),action:DesktopUiAction,value:z.string().max(4096).optional()}).strict().refine(p=>p.action==="set_value"?p.value!==undefined:p.value===undefined,"value is only required for set_value");
export interface DesktopUiWindow {id:string;name:string;processId:number}
export interface DesktopUiElement {
 id:string;parentId:string|null;name:string;controlType:string;automationId:string;value?:string;
 enabled:boolean;offscreen:boolean;password:boolean;actions:DesktopUiAction[];
 bounds:{x:number;y:number;width:number;height:number};
}
export type DesktopUiSnapshot={available:false;reason:string}|{available:true;observationId:string;window:DesktopUiWindow;windows:DesktopUiWindow[];elements:DesktopUiElement[];truncated:boolean;validForMs:number};
