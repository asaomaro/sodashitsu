// Test compilation only; excluded from the closed runtime asset inventory.
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Security.Cryptography;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public static partial class SodaDesktopHost {
    public static void VerifySharedProtectedProof() {
        var config=new Dictionary<string,object>();
        foreach(string mode in new string[]{null,"elevated-default","elevated-uac"}) {
            if(SharedProtectedProof(config,mode))throw new InvalidOperationException("Missing shared proof flag");
            foreach(object flag in new object[]{false,"true",1,true}) {
                config["allowSharedProtected"]=flag;
                if(SharedProtectedProof(config,mode)!=(mode!=null&&flag is bool&&(bool)flag))throw new InvalidOperationException("Shared protected proof boundary");
            }
            config.Clear();
        }
    }
    public static void VerifyAuthenticationInput(){
        if(Control||MemoryInput!=null||MemoryBatchInput!=null||Keys.Count!=0||Buttons.Count!=0)throw new InvalidOperationException("Fresh validation process required");

        bool oldSecure=Secure,oldStopping=Stopping;long oldHeartbeat=LastHeartbeat;string oldMode=ProtectedMode;var oldLockState=SecureLockState;
        try{foreach(string mode in new[]{"enter","numpad","digit","numpad-digit","text","partial-enter","partial-digit","partial-text","normal","normal-digit","elevated","elevated-digit","modifier","modifier-digit","button","button-digit","lost"}){
            bool live=mode!="lost",partial=mode.StartsWith("partial-"),text=mode=="text"||mode=="partial-text",digit=mode=="digit"||mode.EndsWith("-digit");
            bool pulse=mode=="enter"||mode=="numpad"||mode=="digit"||mode=="numpad-digit"||mode=="text"||partial;int calls=0;var sizes=new List<int>();var output=new List<object>();
            Keys.Clear();Buttons.Clear();
            Secure=!mode.StartsWith("normal");ProtectedMode=mode.StartsWith("elevated")?"elevated-uac":null;SecureLockState=mode.StartsWith("normal")||mode.StartsWith("elevated")?null:(Func<int>)(()=>live?1:0);Control=true;Stopping=false;LastHeartbeat=Clock.ElapsedMilliseconds;
            MemoryDesktop=()=>live;MemoryOutput=output.Add;
            if(mode.StartsWith("modifier"))Keys.Add(17);if(mode.StartsWith("button"))Buttons.Add(0);
            ushort key=(ushort)(mode=="numpad"?(13|0x100):mode=="numpad-digit"?99:digit?51:13);
            MemoryBatchInput=inputs=>{
                calls++;sizes.Add(inputs.Length);
                if(pulse){
                    if(inputs.Length!=2)throw new InvalidOperationException("Authentication input was not one down/up batch");
                    var a=inputs[0].data.key;var b=inputs[1].data.key;
                    if(inputs[0].type!=1||inputs[1].type!=1||a.vk!=b.vk||a.scan!=b.scan||(a.flags&2)!=0||b.flags!=(a.flags|2))throw new InvalidOperationException("Authentication release encoding mismatch");
                    if(text&&(a.scan!='a'||a.flags!=4)||!text&&(a.vk!=(key&255)||a.flags!=(mode=="numpad"?1u:0u)))throw new InvalidOperationException("Authentication key encoding changed");
                    live=false;
                }
                return partial?1u:(uint)inputs.Length;
            };
            bool failed=false,accepted=false;
            try{accepted=Apply(text?new Dictionary<string,object>{{"kind","text"},{"text","a"}}:new Dictionary<string,object>{{"kind","key"},{"code",mode=="numpad"?"NumpadEnter":mode=="numpad-digit"?"Numpad3":digit?"Digit3":"Enter"},{"down",true}});}catch(InvalidOperationException){failed=true;}
            if(partial){
                if(!failed||!Stopping||!text&&!Keys.Contains(key))throw new InvalidOperationException("Partial authentication input was accepted or forgotten");
            }else if(pulse){
                if(failed||!accepted||calls!=1||sizes[0]!=2||Keys.Count!=0||Buttons.Count!=0)throw new InvalidOperationException("Authentication pulse retained input");
                Apply(new Dictionary<string,object>{{"kind","key"},{"code","Enter"},{"down",false}});if(calls!=1)throw new InvalidOperationException("Authentication key-up reached the new scope");
            }else if(mode=="lost"){
                if(accepted||failed||calls!=0)throw new InvalidOperationException("Lost authentication scope received input");
            }else{
                if(failed||!accepted||calls!=1||sizes[0]!=1||!Keys.Contains(key))throw new InvalidOperationException("Ordinary or chorded Enter semantics changed");
                Release();if(Keys.Count!=0||Buttons.Count!=0)throw new InvalidOperationException("Ordinary input release failed");
            }
        }}finally{Keys.Clear();Buttons.Clear();Control=false;MemoryInput=null;MemoryBatchInput=null;MemoryDesktop=null;MemoryOutput=null;Secure=oldSecure;ProtectedMode=oldMode;SecureLockState=oldLockState;Stopping=oldStopping;LastHeartbeat=oldHeartbeat;}
        Console.WriteLine("authentication_input_generated_batch_transition_cleanup_partial_failure_and_ordinary_semantics_passed");
    }
    public static void VerifyLiveInputDeadline(){
        var oldDesktop=MemoryDesktop;var oldInput=MemoryInput;var oldOutput=MemoryOutput;bool oldSecure=Secure,oldStopping=Stopping;long oldBeat=LastHeartbeat;
        int sent=0;long sequence=0;
        try{
            Secure=false;Stopping=false;Control=true;MemoryDesktop=()=>true;MemoryInput=value=>sent++;MemoryOutput=value=>{};LastHeartbeat=Clock.ElapsedMilliseconds-7000;
            var key=new Dictionary<string,object>{{"kind","key"},{"code","KeyA"},{"down",true}};
            var message=new Dictionary<string,object>{{"seq",1L},{"input",key}};
            if(!ApplyInput(message,ref sequence)||sent!=1)throw new Exception("Live human input without a deadline was rejected");
            key["down"]=false;message["seq"]=2L;message["expiresAt"]=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-10;
            if(ApplyInput(message,ref sequence)||sent!=1)throw new Exception("Explicit expired input was admitted");
            message["seq"]=3L;message.Remove("expiresAt");
            if(!ApplyInput(message,ref sequence)||sent!=2||Keys.Count!=0)throw new Exception("Live human release was dropped");
            Control=false;message["seq"]=4L;if(ApplyInput(message,ref sequence))throw new Exception("Missing permission admitted human input");
        }finally{Keys.Clear();Buttons.Clear();Control=false;MemoryDesktop=oldDesktop;MemoryInput=oldInput;MemoryOutput=oldOutput;Secure=oldSecure;Stopping=oldStopping;LastHeartbeat=oldBeat;}
        Console.WriteLine("live_input_optional_deadline_and_single_source_liveness_passed");
    }
    public static void VerifyControlCompletion(){
        var savedDesktop=MemoryDesktop;var savedInput=MemoryInput;var savedOutput=MemoryOutput;bool savedStopping=Stopping;bool savedSecure=Secure;
        var sent=new List<INPUT>();var replies=new List<Dictionary<string,object>>();
        try{
            Secure=false;Stopping=false;MemoryDesktop=()=>true;MemoryInput=sent.Add;
            MemoryOutput=value=>{if(Keys.Count!=0||Buttons.Count!=0)throw new Exception("Control completion preceded held input release");replies.Add(Obj(Json.DeserializeObject(OutputJson.Serialize(value))));};
            Control=true;Keys.Add(65);Buttons.Add(0);SetControl(false,true,7);
            if(Control||sent.Count!=2||replies.Count!=1||(string)replies[0]["type"]!="control"||(bool)replies[0]["enabled"]||Convert.ToInt64(replies[0]["seq"])!=7)throw new Exception("Control release completion changed");
            replies.Clear();Keys.Add(66);MemoryInput=value=>{throw new InvalidOperationException("Generated release failure");};bool denied=false;
            try{SetControl(false,true,8);}catch(InvalidOperationException){denied=true;}
            if(!denied||!Stopping||replies.Count!=0||!Keys.Contains(66))throw new Exception("Failed release reported success or forgot held key");
            MemoryInput=sent.Add;if(!Release()||Keys.Count!=0)throw new Exception("Source cleanup did not retry held key after input failure");
            int before=sent.Count;Keys.Add(67);MemoryDesktop=()=>false;
            if(Release()||sent.Count!=before||!Keys.Contains(67))throw new Exception("Normal source cleanup crossed the input desktop boundary");
        }finally{Keys.Clear();Buttons.Clear();Control=false;MemoryDesktop=savedDesktop;MemoryInput=savedInput;MemoryOutput=savedOutput;Stopping=savedStopping;Secure=savedSecure;}
        Console.WriteLine("desktop_control_completion_after_release_and_failure_cleanup_passed");
    }
    sealed class MemoryMonitors:SodaDesktopMonitorLayout.IDriver {public SodaDesktopMonitorLayout.Item[] Items;public int Reads;public SodaDesktopMonitorLayout.Item[] Read(){Reads++;return Items;}}
    public static void VerifyNativePointerWitness(){
        if(Control||MemoryInput!=null||Keys.Count!=0||Buttons.Count!=0)throw new InvalidOperationException("Fresh validation process required");
        var oldDriver=MonitorDriver;var oldBounds=Bounds;bool oldSecure=Secure;
        try{
            foreach(string mode in new[]{"ok","disabled","secure","modifier","target","failed"}){
                var output=new List<object>();int looked=0;Point seen=new Point();
                Keys.Clear();Buttons.Clear();
                Control=true;Stopping=false;LastHeartbeat=Clock.ElapsedMilliseconds;Secure=mode=="secure";InputAckPipe=false;NativePointerProof=mode!="disabled";
                Bounds=new Rectangle(-800,-100,800,600);MonitorDriver=new MemoryMonitors{Items=new[]{new SodaDesktopMonitorLayout.Item("generated",Bounds,true,100)}};
                MemoryDesktop=()=>true;MemoryOutput=value=>output.Add(value);MemoryInput=value=>{if(mode=="failed"&&value.type==0&&(value.data.mouse.dwFlags&2)!=0)throw new InvalidOperationException("Generated failed down");};
                MemoryPointerTarget=point=>{looked++;seen=point;return mode=="target"?Tuple.Create(0L,0):Tuple.Create(42L,7);};if(mode=="modifier")Keys.Add(17);
                long accepted=0;var down=new Dictionary<string,object>{{"kind","pointer"},{"x",0.5},{"y",0.25},{"button",0},{"event","down"}};
                var message=new Dictionary<string,object>{{"seq",1L},{"expiresAt",DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+1000},{"input",down}};
                bool failed=false;try{if(!ApplyInput(message,ref accepted))throw new InvalidOperationException("Generated down rejected");}catch(InvalidOperationException){failed=true;}
                if(mode=="failed"){if(!failed||output.Count!=0||looked!=0)throw new InvalidOperationException("Failed native down produced witness");continue;}
                if(failed||output.Count!=1)throw new InvalidOperationException("Generated native down not acknowledged");
                var ack=Obj(Json.DeserializeObject(OutputJson.Serialize(output[0])));bool has=ack.ContainsKey("pointer");
                if(has!=(mode=="ok"))throw new InvalidOperationException("Native pointer admission mismatch: "+mode);
                if(mode=="ok"){
                    var pointer=Obj(ack["pointer"]);
                    if(seen!=new Point(-400,50)||Num(pointer,"x")!=-400||Num(pointer,"y")!=50||Convert.ToInt64(pointer["window"])!=42||Num(pointer,"pid")!=7)throw new InvalidOperationException("Native pointer coordinates mismatch");
                    message["seq"]=2L;if(!ApplyInput(message,ref accepted)||Obj(Json.DeserializeObject(OutputJson.Serialize(output[1]))).ContainsKey("pointer"))throw new InvalidOperationException("Duplicate down forged physical witness");
                    down["event"]="up";message["seq"]=3L;if(!ApplyInput(message,ref accepted)||Obj(Json.DeserializeObject(OutputJson.Serialize(output[2]))).ContainsKey("pointer"))throw new InvalidOperationException("Pointer up produced down witness");
                    message["seq"]=4L;message["expiresAt"]=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-10;int before=output.Count;if(ApplyInput(message,ref accepted)||output.Count!=before)throw new InvalidOperationException("Expired native input produced witness");
                }else if(mode!="target"&&looked!=0)throw new InvalidOperationException("Unpermitted native window lookup: "+mode);
            }
        }finally{Keys.Clear();Buttons.Clear();MemoryInput=null;MemoryOutput=null;MemoryDesktop=null;MemoryPointerTarget=null;LastAppliedPointer=null;NativePointerProof=false;InputAckPipe=false;Control=false;Stopping=false;Secure=oldSecure;MonitorDriver=oldDriver;Bounds=oldBounds;}
        Console.WriteLine("desktop_native_pointer_generated_applied_down_coordinates_policy_and_failure_passed");
    }
    sealed class MemoryVirtualLease:IDisposable {public void Dispose(){}}
    public static void VerifyVirtualNativePointerWitness(){
        if(VirtualLease!=null||MemoryDesktop!=null||Keys.Count!=0||Buttons.Count!=0)throw new InvalidOperationException("Fresh validation process required");
        var oldDriver=MonitorDriver;var oldBounds=Bounds;bool oldStopping=Stopping;
        try {
            foreach(string mode in new[]{"ok","not-opted","lease-lost","secure","desktop-lost","layout-changed","same-name-recreated","selected-physical","bounds-changed","out-of-range"}){
                int looked=0;bool alive=mode!="lease-lost";Secure=mode=="secure";Stopping=false;
                VirtualLease=new MemoryVirtualLease();VirtualAlive=()=>alive;VirtualNativePointerProof=mode!="not-opted";NativePointerProof=true;
                MemoryDesktop=()=>mode!="desktop-lost";Bounds=new Rectangle(1600,-200,800,600);CaptureDevice="owned";
                var fake=new MemoryMonitors{Items=new[]{new SodaDesktopMonitorLayout.Item("owned",Bounds,false,100),new SodaDesktopMonitorLayout.Item("physical",new Rectangle(0,0,1600,900),true,100)}};
                MonitorDriver=fake;ActiveMonitors=new SodaDesktopMonitorLayout(fake,"owned");
                Control=true;Buttons.Add(0);
                MemoryPointerTarget=point=>{looked++;return Tuple.Create(42L,7);};
                if(mode=="layout-changed")fake.Items=new[]{new SodaDesktopMonitorLayout.Item("owned",new Rectangle(1601,-200,800,600),false,100)};
                if(mode=="same-name-recreated")alive=false; // original client validates PnP instance/container, not display-name equality
                if(mode=="selected-physical")CaptureDevice="physical";
                if(mode=="bounds-changed")Bounds=new Rectangle(1600,-200,801,600);
                var proof=PointerWitness(mode=="out-of-range"?1.1:0.5,0.5);
                if((proof!=null)!=(mode=="ok")||looked!=(mode=="ok"?1:0))throw new InvalidOperationException("Virtual native pointer guard: "+mode);
                if(proof!=null&&(Num(proof,"x")!=2000||Num(proof,"y")!=100))throw new InvalidOperationException("Virtual native pointer coordinate mismatch");
                Buttons.Clear();
            }
        }finally{Buttons.Clear();Control=false;VirtualLease=null;VirtualAlive=null;VirtualNativePointerProof=false;NativePointerProof=false;MemoryDesktop=null;MemoryPointerTarget=null;ActiveMonitors=null;CaptureDevice=null;Secure=false;Stopping=oldStopping;MonitorDriver=oldDriver;Bounds=oldBounds;}
        Console.WriteLine("desktop_owned_virtual_native_pointer_10_memory_checks_passed");
    }
    public static void VerifyQueuedMonitorInput(){
        if(Control||CaptureDevice!=null||ActiveMonitors!=null||MemoryInput!=null||MemoryDesktop!=null||MemoryOutput!=null||Keys.Count!=0||Buttons.Count!=0)throw new InvalidOperationException("Fresh validation process required");
        Rectangle oldBounds=Bounds;bool oldStopping=Stopping;long oldHeartbeat=LastHeartbeat;var oldDriver=MonitorDriver;int oldNotice=MonitorNotice;
        var sent=new List<INPUT>();int notices=0;var fake=new MemoryMonitors{Items=new[]{new SodaDesktopMonitorLayout.Item("a",new Rectangle(0,0,800,600),true,100)}};
        MemoryInput=sent.Add;MemoryDesktop=()=>true;MemoryOutput=value=>{notices++;};MonitorDriver=fake;ActiveMonitors=new SodaDesktopMonitorLayout(fake,"a");CaptureDevice="a";Bounds=ActiveMonitors.Bounds;Control=true;Stopping=false;MonitorNotice=0;LastHeartbeat=Clock.ElapsedMilliseconds;
        try{
            var queue=new SodaDesktopCommandQueue<string>(8,v=>false,v=>{});queue.Submit("keyA");queue.Submit("pointer");queue.Submit("clipboard-wait-completes-after-topology-change");queue.Submit("keyB");
            while(queue.ProcessOne(value=>{if(value=="clipboard-wait-completes-after-topology-change")fake.Items=new[]{new SodaDesktopMonitorLayout.Item("a",new Rectangle(0,0,1024,768),true,100)};else if(value=="pointer")Apply(new Dictionary<string,object>{{"kind","pointer"},{"x",0.5},{"y",0.5},{"event","move"},{"button",0}});else Apply(new Dictionary<string,object>{{"kind","key"},{"code",value=="keyA"?"KeyA":"KeyB"},{"down",true}});})){}
            if(!Stopping||Control||Keys.Count!=0||sent.Count!=3||sent[0].data.key.vk!=65||(sent[0].data.key.flags&2)!=0||sent[1].type!=0||sent[2].data.key.vk!=65||(sent[2].data.key.flags&2)==0||notices!=1||fake.Reads!=4)throw new InvalidOperationException("Queued input after topology change was not rejected and released");
        }finally{Release();MemoryInput=null;MemoryDesktop=null;MemoryOutput=null;ActiveMonitors=null;CaptureDevice=null;MonitorDriver=oldDriver;Bounds=oldBounds;Stopping=oldStopping;LastHeartbeat=oldHeartbeat;MonitorNotice=oldNotice;}
    }
    public static void VerifyProtectedNativeOutput(Func<bool> current,Action transition) {
        if(Secure||MemoryOutput!=null||MemoryPreparedWait!=null)throw new InvalidOperationException("Fresh validation process required");
        bool oldStopping=Stopping;int frames=0,commits=0;System.Threading.Tasks.Task<bool> waiting=null;
        SetProtectedGuards(current,"elevated-default");MemoryOutput=value=>frames++;Stopping=false;
        using(var reached=new ManualResetEventSlim(false))try {
            var options=new Dictionary<string,object>{{"features",true},{"protectedVideo",true}};var config=new Dictionary<string,object>{{"options",options}};
            if(ProtectedVideoProof(config))throw new Exception("Protected native video local flag missing");
            foreach(object flag in new object[]{false,"true",1,true}) {
                config["allowProtectedVideo"]=flag;
                foreach(string mode in new string[]{null,"elevated-default","elevated-uac","other"}) {
                    ProtectedMode=mode;
                    bool expected=flag is bool&&(bool)flag&&(mode=="elevated-default"||mode=="elevated-uac");
                    if(ProtectedVideoProof(config)!=expected)throw new Exception("Protected native video role and local flag proof");
                }
            }
            ProtectedMode="elevated-default";config["allowProtectedVideo"]=true;options["features"]=false;
            if(ProtectedVideoProof(config))throw new Exception("Protected native video feature proof missing");options["features"]=true;options["protectedVideo"]=false;
            if(ProtectedVideoProof(config))throw new Exception("Protected native video request missing");options["protectedVideo"]=true;
            object payload=new {type="native_frame",id="generated",data="AQID"};Action commit=()=>commits++;
            if(Math.Abs(QpcTimestamp()-(long)(Stopwatch.GetTimestamp()*1000000.0/Stopwatch.Frequency))>100000)throw new Exception("Protected video QPC clock");
            if(!PublishProtectedNative(payload,commit)||frames!=1||commits!=1)throw new Exception("Stable protected native frame rejected");
            MemoryPreparedWait=()=>reached.Set();
            lock(OutputGate) {
                waiting=System.Threading.Tasks.Task.Run(()=>PublishProtectedNative(payload,commit));
                if(!reached.Wait(1000))throw new Exception("Protected native frame did not wait for output gate");transition();
            }
            if(!waiting.Wait(1000)||waiting.Result||frames!=1||commits!=1||!Stopping)throw new Exception("Protected native frame survived scope transition while queued");
        } finally {
            if(waiting!=null&&!waiting.IsCompleted)waiting.Wait(2000);MemoryPreparedWait=null;MemoryOutput=null;ClearProtectedGuards();Stopping=oldStopping;
        }
        Console.WriteLine("protected_native_output_passed: generated native frame source, local proof and output commit");
    }
    public static void VerifyProtectedQueuedOutput(Func<bool> current,Action transition){
        if(Secure||MemoryInput!=null||MemoryOutput!=null||MemoryPreparedWait!=null)throw new InvalidOperationException("Fresh validation process required");
        bool oldStopping=Stopping;int frames=0;System.Threading.Tasks.Task<bool> waiting=null;
        SetProtectedGuards(current,"elevated-default");MemoryOutput=value=>frames++;Stopping=false;
        using(var reached=new ManualResetEventSlim(false))try{
            var frame=new PreparedFrame{image=new byte[]{1,2,3},info=new Dictionary<string,object>{{"seq",1}}};
            MemoryPreparedWait=()=>reached.Set();
            lock(OutputGate){
                waiting=System.Threading.Tasks.Task.Run(()=>PublishPrepared(frame));
                if(!reached.Wait(1000))throw new Exception("Queued publication did not reach output gate");
                transition();
            }
            if(!waiting.Wait(1000)||waiting.Result||frames!=0||!Stopping)throw new Exception("Old frame published after output gate wait");
        }finally{
            if(waiting!=null&&!waiting.IsCompleted)waiting.Wait(2000);
            MemoryPreparedWait=null;MemoryOutput=null;ClearProtectedGuards();Stopping=oldStopping;
        }
        Console.WriteLine("protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held");
    }
    public static void VerifyLiveQueuedVideo(){
        bool oldStopping=Stopping;int frames=0;System.Threading.Tasks.Task<bool> waiting=null;
        SetProtectedGuards(()=>true,"elevated-default");MemoryOutput=value=>frames++;Stopping=false;
        using(var queued=new ManualResetEventSlim(false))try{
            MemoryPreparedWait=()=>queued.Set();
            lock(OutputGate){
                waiting=System.Threading.Tasks.Task.Run(()=>PublishProtectedNative(new{type="native_frame"},()=>{}));
                if(!queued.Wait(1000))throw new Exception("Live video did not queue at output gate");
                Thread.Sleep(1100);
            }
            if(!waiting.Wait(1000)||!waiting.Result||frames!=1||Stopping)throw new Exception("Live video stopped after output congestion");
        }finally{if(waiting!=null&&!waiting.IsCompleted)waiting.Wait(2000);MemoryPreparedWait=null;MemoryOutput=null;ClearProtectedGuards();Stopping=oldStopping;}
        Console.WriteLine("live_native_video_survived_output_congestion_passed");
    }
    public static void VerifyStoppedQueuedOutput(){
        if(Secure||MemoryOutput!=null||MemoryPreparedWait!=null)throw new InvalidOperationException("Fresh validation process required");
        bool oldStopping=Stopping,desktop=true;int frames=0;System.Threading.Tasks.Task<bool> image=null,video=null;
        SetProtectedGuards(()=>desktop,"elevated-default");MemoryOutput=value=>frames++;Stopping=false;
        using(var queued=new CountdownEvent(2))try{
            MemoryPreparedWait=()=>queued.Signal();
            var frame=new PreparedFrame{image=new byte[]{1,2,3},info=new Dictionary<string,object>{{"seq",1}}};
            lock(OutputGate){
                image=System.Threading.Tasks.Task.Run(()=>PublishPrepared(frame));
                video=System.Threading.Tasks.Task.Run(()=>PublishProtectedNative(new{type="native_frame"},()=>{}));
                if(!queued.Wait(1000))throw new Exception("Stopped publication did not queue at output gate");
                desktop=false;Stopping=true;desktop=true;
            }
            if(!System.Threading.Tasks.Task.WaitAll(new System.Threading.Tasks.Task[]{image,video},1000)||image.Result||video.Result||frames!=0)throw new Exception("Stopped source published after desktop returned");
        }finally{
            if(image!=null&&!image.IsCompleted)image.Wait(2000);if(video!=null&&!video.IsCompleted)video.Wait(2000);
            MemoryPreparedWait=null;MemoryOutput=null;ClearProtectedGuards();Stopping=oldStopping;
        }
        Console.WriteLine("stopped_queued_image_and_native_video_rejected_after_desktop_return_passed");
    }
    public static void VerifyProtectedBoundaries(Func<bool> current,Action transition){
        if(Secure||MemoryInput!=null||MemoryDesktop!=null||Keys.Count!=0||Buttons.Count!=0)throw new InvalidOperationException("Fresh validation process required");
        bool oldStopping=Stopping;var sent=new List<INPUT>();
        SetProtectedGuards(current,"elevated-default");MemoryInput=sent.Add;Stopping=false;
        try{
            Control=true;if(CanSecureAttention())throw new Exception("Protected secure attention allowed");Control=false;

            if(!AdmitPrepared())throw new Exception("Stable prepared frame rejected");
            Keys.Add(65);Key(65,true);Buttons.Add(0);Emit(ButtonInput(0,true));Release();
            if(sent.Count!=4||Keys.Count!=0||Buttons.Count!=0)throw new Exception("Stable protected release failed");
            Keys.Add(65);Key(65,true);Buttons.Add(0);Emit(ButtonInput(0,true));
            transition();
            if(AdmitPrepared()||!Stopping)throw new Exception("Queued protected frame survived scope transition");
            Release();if(sent.Count!=6||Keys.Count!=0||Buttons.Count!=0)throw new Exception("Protected release reached new desktop");
            bool denied=false;try{Key(66,true);}catch(InvalidOperationException){denied=true;}
            if(!denied||sent.Count!=6)throw new Exception("Protected Emit bypassed scope guard");
        }finally{Keys.Clear();Buttons.Clear();Control=false;MemoryInput=null;ClearProtectedGuards();Stopping=oldStopping;}
        Console.WriteLine("protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only");
    }
    public static void VerifyVirtualDesktopGuard(){
        bool opened=false,rejected=false;try{OpenVirtualOnNormalDesktop(()=>false,()=>{opened=true;return new object();});}catch(InvalidOperationException){rejected=true;}
        if(!rejected||opened)throw new InvalidOperationException("Virtual device was opened before normal desktop guard");
        object expected=new object();if(!Object.ReferenceEquals(OpenVirtualOnNormalDesktop(()=>true,()=>expected),expected))throw new InvalidOperationException("Normal virtual creation path");
        if(!SingleResizeSource(true,true,"owned-virtual","owned-virtual",3))throw new InvalidOperationException("Owned virtual monitor resize denied among physical monitors");
        if(SingleResizeSource(true,false,"owned-virtual","owned-virtual",3)||SingleResizeSource(true,true,"owned-virtual","physical",3)||SingleResizeSource(true,true,null,"physical",3))throw new InvalidOperationException("Virtual resize escaped the owned monitor");
        if(SingleResizeSource(false,false,null,"physical",3)||!SingleResizeSource(false,false,null,"physical",1))throw new InvalidOperationException("Normal physical resize policy changed");
        Console.WriteLine("virtual_desktop_preflight_guard_passed: fake normal/secure guards; no native device or desktop APIs");
    }
}
