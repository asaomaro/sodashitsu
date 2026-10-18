import { PreviewHelperProof, PreviewLocalOrigin, PreviewId, type PreviewHelperProbe } from "@sodashitsu/protocol";

/** An API locator is not proof. Only a message from the actual loopback iframe is accepted. */
export function readLocalHelperProof(probe: PreviewHelperProbe, signal: AbortSignal): Promise<{id:string;secret:string}> {
  PreviewId.parse(probe.id);
  PreviewLocalOrigin.parse(probe.origin);
  if (probe.url !== `${probe.origin}/probe`) throw new Error("invalid helper probe");
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("data-preview-helper-probe", "");
    frame.sandbox.add("allow-scripts", "allow-same-origin");
    const finish = (error?: Error, proof?: {id:string;secret:string}) => {
      clearTimeout(timer); window.removeEventListener("message", message); signal.removeEventListener("abort", abort); frame.remove();
      if (proof) resolve(proof); else reject(error ?? new Error("helper probe failed"));
    };
    const message = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== probe.origin || event.data?.type !== "soda-preview-helper-probe") return;
      const proof = PreviewHelperProof.safeParse({id:event.data.id,secret:event.data.secret});
      if (proof.success && proof.data.id === probe.id) finish(undefined, proof.data);
    };
    const abort = () => finish(new Error("helper probe cancelled"));
    const timer = setTimeout(() => finish(new Error("helper probe timed out")), 25_000);
    window.addEventListener("message", message);
    signal.addEventListener("abort", abort, {once:true});
    if (signal.aborted) { abort(); return; }
    frame.src = probe.url;
    document.body.append(frame);
  });
}
