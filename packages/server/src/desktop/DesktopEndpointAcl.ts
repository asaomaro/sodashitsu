import {desktopWindowsMetadata} from "./DesktopWindowsMetadata.js";
/** Read-only permission/ancestor inspection. Never grants rights. */
export const checkDesktopWindowsPath=(path:string):Promise<void>=>/^[A-Za-z]:\\/.test(path)?desktopWindowsMetadata("check-endpoint-acl.ps1",["-Path",path],"endpoint_acl_valid"):Promise.reject(Error("Desktop endpoint storage requires a local Windows path"));
/** DPAPI ciphertext only; use the Windows write-through replace operation. */
export const commitDesktopWindowsVault=(source:string,destination:string):Promise<void>=>desktopWindowsMetadata("commit-endpoint-vault.ps1",["-Source",source,"-Destination",destination],"endpoint_vault_committed");
