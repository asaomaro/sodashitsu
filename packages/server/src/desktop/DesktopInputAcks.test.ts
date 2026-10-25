import { expect, it, vi } from "vitest";
import { DesktopInputAcks } from "./DesktopInputAcks.js";
it("accepts fragmented negotiated ACKs once, only for outstanding submitted inputs",()=>{
 const ack=vi.fn(),pipe=new DesktopInputAcks(ack);pipe.submitted(1);
 pipe.push(Buffer.from("SODA_DESKTOP_INPUT_ACK 1\n"));expect(ack).not.toHaveBeenCalled();
 pipe.enabled=true;pipe.push(Buffer.from("SODA_DESKTOP_IN"));pipe.push(Buffer.from("PUT_ACK 1\r\nSODA_DESKTOP_INPUT_ACK 1\nSODA_DESKTOP_INPUT_ACK 2\n"));expect(ack.mock.calls).toEqual([[1]]);
 pipe.submitted(2);pipe.ack(2);pipe.push(Buffer.from("SODA_DESKTOP_INPUT_ACK 2\n"));expect(ack.mock.calls).toEqual([[1],[2]]);
});
it("discards diagnostics, oversized/non-ASCII lines and forged sequence values without forwarding contents",()=>{
 const ack=vi.fn(),pipe=new DesktopInputAcks(ack);pipe.enabled=true;pipe.submitted(7);
 for(const line of ['path/window title','{"type":"input_ack","seq":7}','SODA_DESKTOP_INPUT_ACK 0','SODA_DESKTOP_INPUT_ACK 07','SODA_DESKTOP_INPUT_ACK 9007199254740992','x'.repeat(100000)+'SODA_DESKTOP_INPUT_ACK 7','éSODA_DESKTOP_INPUT_ACK 7'])pipe.push(Buffer.from(line+'\n'));
 expect(ack).not.toHaveBeenCalled();pipe.push(Buffer.from("SODA_DESKTOP_INPUT_ACK 7\n"));expect(ack.mock.calls).toEqual([[7]]);
});
it("keeps at most 64 outstanding inputs even when the helper never acknowledges",()=>{
 const ack=vi.fn(),pipe=new DesktopInputAcks(ack);pipe.enabled=true;
 for(let seq=1;seq<=100;seq++)pipe.submitted(seq);
 for(let seq=1;seq<=100;seq++)pipe.push(Buffer.from(`SODA_DESKTOP_INPUT_ACK ${seq}\n`));
 expect(ack.mock.calls).toEqual(Array.from({length:64},(_,i)=>[i+37]));
});
