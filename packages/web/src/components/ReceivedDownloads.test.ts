import {mount,flushPromises} from "@vue/test-utils";
import {afterEach,expect,it,vi} from "vitest";
import ReceivedDownloads from "./ReceivedDownloads.vue";
afterEach(()=>{vi.restoreAllMocks();});
it("exports only verified retained data on a copy gesture and clears on permission loss",async()=>{
  const create=vi.spyOn(URL,"createObjectURL").mockReturnValue("blob:generated"),revoke=vi.spyOn(URL,"revokeObjectURL").mockImplementation(()=>{});
  const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});
  const view=mount(ReceivedDownloads,{props:{enabled:true}});
  try{
    expect(view.vm.begin()).toBeUndefined();
    await view.get("input").setValue(true);
    view.vm.publish(view.vm.begin(),"a","a:secret.txt",new Blob(["generated"]));await flushPromises();
    const data={clearData:vi.fn(),setData:vi.fn(),effectAllowed:""};
    await view.get("a").trigger("dragstart",{dataTransfer:data});
    expect(data.effectAllowed).toBe("copy");expect(data.clearData).toHaveBeenCalledOnce();
    expect(data.setData).toHaveBeenCalledWith("DownloadURL","application/octet-stream:a_secret.txt:blob:generated");
    await view.findAll("button").find(b=>b.text()==="もう一度保存")!.trigger("click");expect(click).toHaveBeenCalledOnce();
    await view.setProps({enabled:false});expect(view.findAll("a")).toHaveLength(0);expect(revoke).toHaveBeenCalledWith("blob:generated");
    expect(create).toHaveBeenCalledOnce();
  }finally{view.unmount();}
});
it("rejects completion tickets held across opt-out and re-enable",async()=>{
  const create=vi.spyOn(URL,"createObjectURL").mockReturnValue("blob:generated");
  const view=mount(ReceivedDownloads,{props:{enabled:true}});
  try{
    await view.get("input").setValue(true);const held=view.vm.begin();
    await view.get("input").setValue(false);await view.get("input").setValue(true);
    view.vm.publish(held,"a","a",new Blob(["late"]));await flushPromises();
    expect(view.findAll("a")).toHaveLength(0);expect(create).not.toHaveBeenCalled();
  }finally{view.unmount();}
});
