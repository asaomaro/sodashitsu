// Separates the ORIGINAL stream from a one-use ticket replay. No response is unknown, never rejection.
export async function originalStreamEvidence({closed,beginObserve,sendFrame}){
 if(closed()===true)return{oldStreamProbeAttempted:true,oldStreamClosed:true,oldStreamRejected:false,oldStreamStatus:'closed',oldStreamReactivated:false};
 const observation=beginObserve();sendFrame();const value=await observation;
 return{oldStreamProbeAttempted:true,oldStreamClosed:value?.closed===true,oldStreamRejected:value?.rejected===true,oldStreamStatus:value?.closed===true?'closed':value?.rejected===true?'rejected':'unknown',oldStreamReactivated:typeof value?.reactivated==='boolean'?value.reactivated:undefined};
}
