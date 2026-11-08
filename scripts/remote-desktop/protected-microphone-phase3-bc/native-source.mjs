// Additional fixture guard after the formal DesktopReady schema has parsed the wire record.
export function nativeSourceEvidence(ready,mode){
 if(!ready||typeof ready!=='object'||Array.isArray(ready)||!['elevated-default','elevated-uac'].includes(mode)||ready.backend!=='windows-gdi'||ready.protectedDesktop!==mode||ready.secureDesktop!==true||ready.protectedMicrophone!==true||ready.microphone!==true||(ready.synthetic!==undefined&&ready.synthetic!==false))throw Error('non-native-or-wrong-protected-source');
 return{backend:ready.backend,mode,secureDesktop:true,protectedMicrophone:true,synthetic:false};
}
