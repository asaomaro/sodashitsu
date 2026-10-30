import Foundation
import CoreMedia
import ScreenCaptureKit

struct NativeAudioInput {var data:Data;let captured:Double}
protocol NativeAudioTransport:AnyObject {
    func accept(active:()->Bool,deadline:Double) throws
    func alive() throws -> Bool
    func send(_ data:Data,active:()->Bool,deadline:Double) throws
    func close()
}
extension NativePCMParentPipe:NativeAudioTransport {}
protocol NativeAudioProducer:AnyObject {
    // admit is synchronous and must be checked after native configuration,
    // immediately before starting capture, on the owning IO thread.
    func start(admit:()->Bool,receive:@escaping(NativeAudioInput)->Void,failed:@escaping()->Void,completion:@escaping(Bool)->Void)
    func stop(completion:@escaping(Bool)->Void)
}

/** One IO owner for every pipe operation. Other threads only enqueue/cancel.
 * A logical stop never releases an unconfirmed physical capture or its pipe.
 */
final class NativeSystemAudioActor {
    let id:String
    private let active:()->Bool,clock:()->Double,fatal:()->Void
    private let pipeFactory:()throws->NativeAudioTransport,producerFactory:()->NativeAudioProducer
    private let lock=NSLock(),wake=DispatchSemaphore(value:0)
    private var wakePending=false,cancelled=false,done=false,failed=false
    private var startDone=false,startOK=false,stopDone=false,stopOK=false
    private var queued=[NativeAudioInput]()
    private let deadline:Double
    private var pipe:NativeAudioTransport?,producer:NativeAudioProducer?
    private let framer=NativePCMFramer()
    init(id:String,active:@escaping()->Bool,pipe:@escaping()throws->NativeAudioTransport,
         producer:@escaping()->NativeAudioProducer,fatal:@escaping()->Void,
         clock:@escaping()->Double={ProcessInfo.processInfo.systemUptime}) {
        self.id=id;self.active=active;pipeFactory=pipe;producerFactory=producer;self.fatal=fatal;self.clock=clock
        deadline=clock()+2.5
        let thread=Thread {self.run()};thread.name="soda-native-audio";thread.qualityOfService = .userInitiated;thread.start()
    }
    private func locked<T>(_ body:()->T) -> T {lock.lock();defer {lock.unlock()};return body()}
    private func notify() {locked {if !wakePending {wakePending=true;wake.signal()}}}
    private func wait() {_=wake.wait(timeout:.now() + .milliseconds(20));locked {wakePending=false}}
    var retired:Bool {locked {done}}
    var retirementFailed:Bool {locked {failed}}
    func stop() {locked {cancelled=true};notify()}
    private func live() -> Bool {
        guard !locked({cancelled}) else {return false}
        return active() && !locked({cancelled})
    }
    private func admitted() -> Bool {live() && (try? pipe?.alive())==true && !locked({cancelled})}
    private func submit(_ raw:NativeAudioInput) {
        var input=raw
        guard live(),input.data.count>0,input.data.count<=19200,input.data.count%4==0 else {input.data.resetBytes(in:0..<input.data.count);return}
        locked {
            if cancelled {input.data.resetBytes(in:0..<input.data.count);return}
            if queued.count==2 {queued[0].data.resetBytes(in:0..<queued[0].data.count);queued.removeFirst()}
            queued.append(input)
        }
        notify()
    }
    private func run() {
        do {
            guard live(),clock()<deadline else {throw NativePCMError("audio_expired")}
            pipe=try pipeFactory()
            try pipe!.accept(active:{self.live()},deadline:deadline)
            guard admitted(),clock()<deadline else {throw NativePCMError("audio_expired")}
            producer=producerFactory()
            producer!.start(admit:{self.admitted() && self.clock()<self.deadline},receive:{self.submit($0)},failed:{self.stop()},completion:{success in
                self.locked {self.startDone=true;self.startOK=success};self.notify()
            })
            while !locked({startDone}) {
                guard admitted(),clock()<deadline else {throw NativePCMError("audio_expired")}
                wait()
            }
            guard locked({startOK}),admitted(),clock()<deadline else {throw NativePCMError("audio_expired")}
            try pipe!.send(nativePCMHello,active:{self.admitted()},deadline:deadline)
            while admitted() {
                var input:NativeAudioInput?=locked {queued.isEmpty ? nil:queued.removeFirst()}
                guard input != nil else {wait();continue}
                defer {input!.data.resetBytes(in:0..<input!.data.count)}
                guard admitted() else {break}
                if clock()-input!.captured>0.1 {framer.clear();continue}
                let frames=try framer.push(input!.data,captured:input!.captured,now:clock())
                for frame in frames {
                    try pipe!.send(frame.record,active:{self.admitted()},deadline:Double(frame.timestamp)/1000000+0.1)
                }
            }
        } catch {stop()}
        retire()
    }
    private func retire() {
        stop();framer.clear()
        locked {for index in queued.indices {queued[index].data.resetBytes(in:0..<queued[index].data.count)};queued.removeAll()}
        if let source=producer {
            source.stop {success in self.locked {self.stopDone=true;self.stopOK=success};self.notify()}
            let until=clock()+5
            while !locked({stopDone}) && clock()<until {wait()}
            guard locked({stopDone && stopOK}) else {
                // Retain source+pipe and block replacement until physical helper
                // exit. The source owner ends the helper on unconfirmed retirement.
                locked {failed=true};fatal();return
            }
        }
        pipe?.close();pipe=nil;producer=nil;locked {done=true}
    }
}

/** ScreenCaptureKit audio-only output for the already-selected display filter. */
final class SCKSystemAudioProducer:NSObject,NativeAudioProducer,SCStreamOutput,SCStreamDelegate {
    private let filter:SCContentFilter
    private let lock=NSLock()
    private var stream:SCStream?,startPending=false,stopRequested=false,stopIssued=false
    private var retired=false
    private var receive:((NativeAudioInput)->Void)?,failure:(()->Void)?
    private var stopCallbacks=[(Bool)->Void]()
    init(filter:SCContentFilter) {self.filter=filter;super.init()}
    private func locked<T>(_ body:()->T) -> T {lock.lock();defer {lock.unlock()};return body()}
    func start(admit:()->Bool,receive:@escaping(NativeAudioInput)->Void,failed:@escaping()->Void,completion:@escaping(Bool)->Void) {
        locked {self.receive=receive;failure=failed}
        do {
            let configuration=SCStreamConfiguration()
            configuration.width=2;configuration.height=2;configuration.queueDepth=3;configuration.showsCursor=false
            configuration.minimumFrameInterval=CMTime(value:1,timescale:1)
            configuration.capturesAudio=true;configuration.sampleRate=48000;configuration.channelCount=2
            let source=SCStream(filter:filter,configuration:configuration,delegate:self)
            locked {stream=source}
            try source.addStreamOutput(self,type:.audio,sampleHandlerQueue:DispatchQueue(label:"soda-native-audio-sample",qos:.userInitiated))
            guard admit() else {throw NativePCMError("audio_expired")}
            locked {startPending=true}
            source.startCapture {error in
                let stop=self.locked {self.startPending=false;return self.stopRequested}
                completion(error==nil)
                if stop {self.issueStop()}
            }
        } catch {
            // Configuration/admission failed before startCapture was called.
            locked {retired=true;stream=nil};completion(false)
        }
    }
    func stop(completion:@escaping(Bool)->Void) {
        let immediate=locked {()->Bool in
            if retired {return true}
            stopRequested=true;stopCallbacks.append(completion);return false
        }
        if immediate {completion(true)}else {issueStop()}
    }
    private func issueStop() {
        let source:SCStream?=locked {
            guard !startPending,!stopIssued,let value=stream else {return nil}
            stopIssued=true;return value
        }
        guard let source=source else {return}
        source.stopCapture {error in
            let callbacks=self.locked {()->[(Bool)->Void] in
                if error==nil {self.retired=true;self.stream=nil;self.receive=nil;self.failure=nil}
                let callbacks=self.stopCallbacks;self.stopCallbacks.removeAll();return callbacks
            }
            for callback in callbacks {callback(error==nil)}
        }
    }
    func stream(_ stream:SCStream,didStopWithError error:Error) {let callback=locked {self.stream === stream ? failure:nil};callback?()}
    func stream(_ stream:SCStream,didOutputSampleBuffer sample:CMSampleBuffer,of type:SCStreamOutputType) {
        guard type == .audio,locked({self.stream === stream && !stopRequested}) else {return}
        do {
            let timestamp=CMSampleBufferGetPresentationTimeStamp(sample),host=CMClockGetTime(CMClockGetHostTimeClock())
            let pts=CMTimeGetSeconds(timestamp),hostTime=CMTimeGetSeconds(host),observed=ProcessInfo.processInfo.systemUptime
            guard timestamp.isValid,host.isValid,pts.isFinite,hostTime.isFinite else {throw NativePCMError("audio_clock")}
            var data=try nativeSamplePCM(sample)
            defer {data.resetBytes(in:0..<data.count)}
            let callback=locked {stopRequested ? nil:receive}
            callback?(NativeAudioInput(data:data,captured:observed-(hostTime-pts)))
        } catch {let callback=locked {failure};callback?()}
    }
}

// Generated adapters only. No ScreenCaptureKit stream or hardware audio is used.
private final class GeneratedAudioState {
    private let lock=NSLock()
    private var values=[String:Int](),records=[Data](),callbacks=[String:(Bool)->Void]()
    init() {values["live"]=1;values["peer"]=1}
    func value(_ key:String)->Int {lock.lock();defer {lock.unlock()};return values[key] ?? 0}
    func set(_ key:String,_ value:Int) {lock.lock();values[key]=value;lock.unlock()}
    func bump(_ key:String) {lock.lock();values[key]=(values[key] ?? 0)+1;lock.unlock()}
    func append(_ data:Data) {lock.lock();records.append(data);lock.unlock()}
    func frames()->[Data] {lock.lock();defer {lock.unlock()};return records}
    func save(_ key:String,_ body:@escaping(Bool)->Void) {lock.lock();callbacks[key]=body;lock.unlock()}
    func call(_ key:String,_ value:Bool) {lock.lock();let body=callbacks.removeValue(forKey:key);lock.unlock();body?(value)}
}
private final class GeneratedAudioPipe:NativeAudioTransport {
    let state:GeneratedAudioState
    var accepting:(()->Void)?,sent:((Data)->Void)?
    var clock:()->Double={ProcessInfo.processInfo.systemUptime}
    init(_ state:GeneratedAudioState) {self.state=state}
    func accept(active:()->Bool,deadline:Double) throws {accepting?();guard active() else {throw NativePCMError("generated stopped")}}
    func alive() throws -> Bool {state.value("peer")==1}
    func send(_ data:Data,active:()->Bool,deadline:Double) throws {
        guard active(),clock()<deadline else {throw NativePCMError("generated expired")}
        state.append(data);state.bump(data.count==16 ? "hello":"pcm");sent?(data)
    }
    func close() {state.bump("pipeClose");state.set("peer",0)}
}
private final class GeneratedAudioProducer:NativeAudioProducer {
    let state:GeneratedAudioState
    var starting:((()->Bool,@escaping(NativeAudioInput)->Void,@escaping(Bool)->Void)->Void)?
    var stopping:((@escaping(Bool)->Void)->Void)?
    init(_ state:GeneratedAudioState) {self.state=state}
    func start(admit:()->Bool,receive:@escaping(NativeAudioInput)->Void,failed:@escaping()->Void,completion:@escaping(Bool)->Void) {
        state.bump("startCall")
        if let body=starting {body(admit,receive,completion)}else {let allowed=admit();if allowed {state.bump("captureStart")};completion(allowed)}
    }
    func stop(completion:@escaping(Bool)->Void) {state.bump("stopCall");if let body=stopping {body(completion)}else {completion(true)}}
}
func generatedSystemAudioTests() throws -> Int {
    var checks=0
    func check(_ valid:Bool,_ label:String) throws {guard valid else {throw NativePCMError("generated: "+label)};checks+=1}
    func wait(_ label:String,_ condition:()->Bool) throws {
        let until=ProcessInfo.processInfo.systemUptime+2
        while !condition() && ProcessInfo.processInfo.systemUptime<until {Thread.sleep(forTimeInterval:0.001)}
        try check(condition(),label)
    }
    let id="22222222-2222-4222-8222-222222222222"
    do {
        let state=GeneratedAudioState(),pipe=GeneratedAudioPipe(GeneratedAudioState()),entered=DispatchSemaphore(value:0),resume=DispatchSemaphore(value:0)
        pipe.accepting={entered.signal();_=resume.wait(timeout:.now() + .seconds(2))}
        let actor=NativeSystemAudioActor(id:id,active:{state.value("live")==1},pipe:{pipe},producer:{state.bump("factory");return GeneratedAudioProducer(state)},fatal:{state.bump("fatal")})
        try check(entered.wait(timeout:.now() + .seconds(2)) == .success,"owned peer admission reached")
        try check(state.value("factory")==0,"no producer before parent authenticates")
        actor.stop();resume.signal();try wait("cancelled admission retires",{actor.retired})
        try check(state.value("factory")==0 && pipe.state.value("pipeClose")==1,"cancelled admission never starts capture")
    }
    do {
        let state=GeneratedAudioState(),pipe=GeneratedAudioPipe(GeneratedAudioState()),source=GeneratedAudioProducer(state)
        let transportState=pipe.state;pipe.clock={10.02};pipe.sent={if $0.count==3856 {transportState.set("peer",0)}}
        source.starting={admit,receive,completion in
            let allowed=admit();if allowed {receive(NativeAudioInput(data:Data(repeating:1,count:3840),captured:10))};completion(allowed)
        }
        let actor=NativeSystemAudioActor(id:id,active:{true},pipe:{pipe},producer:{source},fatal:{state.bump("fatal")},clock:{10.02})
        try wait("generated PCM retires after EOF",{actor.retired})
        let frames=pipe.state.frames()
        try check(frames.count==2 && frames[0]==nativePCMHello && frames[1].count==3856,"hello precedes generated PCM")
        try check(frames[1][16]==1 && frames[1][3855]==1,"generated PCM contents preserved")
        try check(state.value("stopCall")==1 && pipe.state.value("pipeClose")==1,"source and pipe each retire once")
    }
    do {
        let state=GeneratedAudioState(),pipe=GeneratedAudioPipe(GeneratedAudioState()),source=GeneratedAudioProducer(state)
        let actor=NativeSystemAudioActor(id:id,active:{true},pipe:{pipe},producer:{source},fatal:{state.bump("fatal")})
        try wait("silent source sent hello",{pipe.state.value("hello")==1});pipe.state.set("peer",0)
        try wait("silent receiver EOF retires source",{actor.retired})
        try check(state.value("stopCall")==1 && pipe.state.value("pcm")==0,"quiet never forges a PCM heartbeat")
    }
    do {
        let state=GeneratedAudioState(),pipe=GeneratedAudioPipe(GeneratedAudioState()),source=GeneratedAudioProducer(state),stopping=DispatchSemaphore(value:0)
        let transportState=pipe.state;pipe.sent={_ in transportState.set("peer",0)}
        source.stopping={completion in state.save("stopped",completion);stopping.signal()}
        let actor=NativeSystemAudioActor(id:id,active:{true},pipe:{pipe},producer:{source},fatal:{state.bump("fatal")})
        try check(stopping.wait(timeout:.now() + .seconds(2)) == .success,"started capture enters retirement")
        try check(!actor.retired && pipe.state.value("pipeClose")==0,"started capture keeps pipe until physical stop confirms")
        state.call("stopped",true);try wait("started capture confirmed stop releases pipe",{actor.retired})
        try check(pipe.state.value("pipeClose")==1 && state.value("fatal")==0,"confirmed stop closes only once")
    }
    do {
        let state=GeneratedAudioState(),pipe=GeneratedAudioPipe(GeneratedAudioState()),source=GeneratedAudioProducer(state)
        source.starting={admit,_,completion in state.set("live",0);let allowed=admit();if allowed {state.bump("captureStart")};completion(allowed)}
        let actor=NativeSystemAudioActor(id:id,active:{state.value("live")==1},pipe:{pipe},producer:{source},fatal:{state.bump("fatal")})
        try wait("configuration cancellation retires",{actor.retired})
        try check(state.value("captureStart")==0 && pipe.state.value("hello")==0,"configuration cannot outlive admission")
    }
    do {
        let state=GeneratedAudioState(),pipe=GeneratedAudioPipe(GeneratedAudioState()),source=GeneratedAudioProducer(state)
        let transportState=pipe.state;pipe.sent={_ in transportState.set("peer",0)};source.stopping={$0(false)}
        let actor=NativeSystemAudioActor(id:id,active:{true},pipe:{pipe},producer:{source},fatal:{state.bump("fatal")})
        try wait("unconfirmed retirement requests helper exit",{state.value("fatal")==1})
        try check(actor.retirementFailed && !actor.retired && pipe.state.value("pipeClose")==0,"unconfirmed source retains its physical slot and pipe")
    }
    do {
        let state=GeneratedAudioState(),pipe=GeneratedAudioPipe(GeneratedAudioState()),source=GeneratedAudioProducer(state),starting=DispatchSemaphore(value:0),stopping=DispatchSemaphore(value:0)
        source.starting={_,_,completion in state.save("started",completion);starting.signal()}
        source.stopping={completion in state.save("stopped",completion);stopping.signal()}
        let actor=NativeSystemAudioActor(id:id,active:{true},pipe:{pipe},producer:{source},fatal:{state.bump("fatal")})
        try check(starting.wait(timeout:.now() + .seconds(2)) == .success,"pending native start reached")
        actor.stop();try check(stopping.wait(timeout:.now() + .seconds(2)) == .success,"pending start enters retirement")
        try check(!actor.retired && pipe.state.value("pipeClose")==0,"pending start retains the physical slot")
        state.call("started",true)
        try check(!actor.retired && pipe.state.value("hello")==0,"late start cannot publish or release retirement")
        state.call("stopped",true);try wait("confirmed stop drains pending start",{actor.retired})
        try check(state.value("fatal")==0 && pipe.state.value("pipeClose")==1,"only confirmed physical retirement releases pipe")
    }
    return checks
}
