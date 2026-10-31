import Foundation
import AppKit
import CoreAudio
import AudioToolbox

let nativeMicrophoneHello=Data([83,68,77,73,1,1,16,0,128,187,0,0,192,3,0,0])
func nativeMicrophonePacket(_ data:Data,previous:UInt32,now:Double) throws -> (UInt32,Double,Data) {
    guard data.count==1932 else {throw NativePCMError("microphone_packet")}
    let sequence=data.withUnsafeBytes{$0.loadUnaligned(as:UInt32.self).littleEndian}
    let bits=data.withUnsafeBytes{$0.loadUnaligned(fromByteOffset:4,as:UInt64.self).littleEndian},expires=Double(bitPattern:bits)
    guard sequence>previous,expires.isFinite,expires<=now+150 else {throw NativePCMError("microphone_order")}
    return(sequence,expires,Data(data.dropFirst(12)))
}
func nativeMicrophoneSessionFacts(_ raw:[String:Any]?,uid:uid_t,euid:uid_t,bundle:String?) -> Bool {
    guard let raw=raw,uid==euid,
          (raw[kCGSessionOnConsoleKey as String] as? NSNumber)?.boolValue==true,
          (raw[kCGSessionLoginDoneKey as String] as? NSNumber)?.boolValue==true,
          (raw[kCGSessionUserIDKey as String] as? NSNumber)?.uint32Value==uid,
          (raw["CGSSessionScreenIsLocked"] as? NSNumber)?.boolValue != true,
          let bundle=bundle,bundle != "com.apple.loginwindow" else {return false}
    return true
}
func nativeMicrophoneSession() -> Bool {
    nativeMicrophoneSessionFacts(CGSessionCopyCurrentDictionary() as? [String:Any],uid:getuid(),euid:geteuid(),bundle:NSWorkspace.shared.frontmostApplication?.bundleIdentifier)
}
func nativeAudioUInt(_ device:AudioObjectID,_ selector:AudioObjectPropertySelector,_ scope:AudioObjectPropertyScope=kAudioObjectPropertyScopeGlobal) throws -> UInt32 {
    var address=AudioObjectPropertyAddress(mSelector:selector,mScope:scope,mElement:kAudioObjectPropertyElementMain),value:UInt32=0,size=UInt32(MemoryLayout<UInt32>.size)
    guard AudioObjectGetPropertyData(device,&address,0,nil,&size,&value)==noErr,size==4 else {throw NativePCMError("microphone_device")};return value
}
func nativeAudioString(_ device:AudioObjectID,_ selector:AudioObjectPropertySelector) throws -> String {
    var address=AudioObjectPropertyAddress(mSelector:selector,mScope:kAudioObjectPropertyScopeGlobal,mElement:kAudioObjectPropertyElementMain),value:Unmanaged<CFString>?,size=UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(device,&address,0,nil,&size,&value)==noErr,let reference=value else {throw NativePCMError("microphone_device")}
    // AudioHardwareBase.h explicitly assigns the returned DeviceUID/Name CF object to the caller.
    return reference.takeRetainedValue() as String
}
func nativeMicrophoneVirtual(_ device:AudioObjectID) -> Bool {
    guard (try? nativeAudioUInt(device,kAudioDevicePropertyTransportType))==kAudioDeviceTransportTypeVirtual,
          (try? nativeAudioUInt(device,kAudioDevicePropertyDeviceIsAlive))==1 else {return false}
    for scope in [kAudioObjectPropertyScopeInput,kAudioObjectPropertyScopeOutput] {
        var address=AudioObjectPropertyAddress(mSelector:kAudioDevicePropertyStreams,mScope:scope,mElement:kAudioObjectPropertyElementMain),size:UInt32=0
        guard AudioObjectGetPropertyDataSize(device,&address,0,nil,&size)==noErr,size>0,size<=128*4,size%4==0 else {return false}
    }
    return true
}
func nativeMicrophoneTargets() throws -> [(AudioObjectID,String,String)] {
    var address=AudioObjectPropertyAddress(mSelector:kAudioHardwarePropertyDevices,mScope:kAudioObjectPropertyScopeGlobal,mElement:kAudioObjectPropertyElementMain),size:UInt32=0
    guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject),&address,0,nil,&size)==noErr,size<=128*4,size%4==0 else {throw NativePCMError("microphone_devices")}
    if size==0 {return []}
    var devices=[AudioObjectID](repeating:0,count:Int(size)/4)
    let result=devices.withUnsafeMutableBytes{AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject),&address,0,nil,&size,$0.baseAddress!)}
    guard result==noErr else {throw NativePCMError("microphone_devices")}
    return try devices.filter{nativeMicrophoneVirtual($0)}.map{device in (device,try nativeAudioString(device,kAudioDevicePropertyDeviceUID),(try? nativeAudioString(device,kAudioObjectPropertyName)) ?? "Virtual audio")}
}
// OS metadata queries may block: recheck the original authority after the query.
func nativeMicrophoneBoundary(verify:() throws -> Void,active:()->Bool,submit:() throws -> Void) throws -> Bool {
    try verify();guard active() else {return false};try submit();return true
}
final class NativeMicrophoneOutput {
    private let endpoint:String
    private var device:AudioObjectID=0,queue:AudioQueueRef?
    private var buffers=[AudioQueueBufferRef](),free=Set<UInt>()
    private let lock=NSLock()
    init(endpoint:String) throws {
        guard !endpoint.isEmpty,endpoint.utf8.count<=2048,!endpoint.unicodeScalars.contains(where:{$0.value<32 || $0.value==127}) else {throw NativePCMError("microphone_endpoint")}
        self.endpoint=endpoint
    }
    private func check(_ status:OSStatus) throws {guard status==noErr else {throw NativePCMError("microphone_output")}}
    private func verify() throws {
        guard nativeMicrophoneVirtual(device),try nativeAudioString(device,kAudioDevicePropertyDeviceUID)==endpoint,let queue=queue else {throw NativePCMError("microphone_target_changed")}
        var value:Unmanaged<CFString>?,size=UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        try check(AudioQueueGetProperty(queue,kAudioQueueProperty_CurrentDevice,&value,&size))
        // AudioQueue's Get property is borrowed; unlike the HAL Copy-style UID property.
        guard let current=value,current.takeUnretainedValue() as String==endpoint else {throw NativePCMError("microphone_target_changed")}
    }
    private func returned(_ buffer:AudioQueueBufferRef) {
        memset(buffer.pointee.mAudioData,0,min(1920,Int(buffer.pointee.mAudioDataBytesCapacity)))
        lock.lock();free.insert(UInt(bitPattern:buffer));lock.unlock()
    }
    func start(active:()->Bool,deadline:Double) throws {
        guard let selected=try nativeMicrophoneTargets().first(where:{$0.1==endpoint}),active(),ProcessInfo.processInfo.systemUptime<deadline else {throw NativePCMError("virtual_endpoint_required")}
        device=selected.0
        var format=AudioStreamBasicDescription(mSampleRate:48000,mFormatID:kAudioFormatLinearPCM,mFormatFlags:kLinearPCMFormatFlagIsSignedInteger|kLinearPCMFormatFlagIsPacked,mBytesPerPacket:2,mFramesPerPacket:1,mBytesPerFrame:2,mChannelsPerFrame:1,mBitsPerChannel:16,mReserved:0)
        var created:AudioQueueRef?
        try check(AudioQueueNewOutput(&format,{context,_,buffer in
            guard let context=context else {return};Unmanaged<NativeMicrophoneOutput>.fromOpaque(context).takeUnretainedValue().returned(buffer)
        },Unmanaged.passUnretained(self).toOpaque(),nil,nil,0,&created))
        guard let created=created else {throw NativePCMError("microphone_output")};queue=created
        var uid=endpoint as CFString
        try check(AudioQueueSetProperty(created,kAudioQueueProperty_CurrentDevice,&uid,UInt32(MemoryLayout<CFString>.size)))
        try verify()
        for _ in 0..<2 {
            var buffer:AudioQueueBufferRef?
            try check(AudioQueueAllocateBuffer(created,1920,&buffer));guard let buffer=buffer else {throw NativePCMError("microphone_buffer")};buffers.append(buffer)
            memset(buffer.pointee.mAudioData,0,1920);buffer.pointee.mAudioDataByteSize=1920
            guard try nativeMicrophoneBoundary(verify:verify,active:{active() && ProcessInfo.processInfo.systemUptime<deadline},submit:{try self.check(AudioQueueEnqueueBuffer(created,buffer,0,nil))}) else {throw NativePCMError("microphone_expired")} // bounded silence to prime only the selected virtual queue
        }
        guard try nativeMicrophoneBoundary(verify:verify,active:{active() && ProcessInfo.processInfo.systemUptime<deadline},submit:{try self.check(AudioQueueStart(created,nil))}) else {throw NativePCMError("microphone_expired")}
        guard active(),ProcessInfo.processInfo.systemUptime<deadline else {throw NativePCMError("microphone_expired")}
    }
    func write(_ pcm:Data,active:()->Bool) throws {
        guard pcm.count==1920 else {throw NativePCMError("microphone_packet")};if !active(){return};try verify()
        lock.lock();let chosen=buffers.first{free.contains(UInt(bitPattern:$0))};if let chosen=chosen{free.remove(UInt(bitPattern:chosen))};lock.unlock()
        guard let buffer=chosen,let queue=queue else {return} // no growing queue
        pcm.withUnsafeBytes{memcpy(buffer.pointee.mAudioData,$0.baseAddress!,1920)};buffer.pointee.mAudioDataByteSize=1920
        do {
            if try !nativeMicrophoneBoundary(verify:verify,active:active,submit:{try self.check(AudioQueueEnqueueBuffer(queue,buffer,0,nil))}) {returned(buffer)}
        }catch{returned(buffer);throw error}
    }
    func close() throws {
        guard let queue=queue else {return}
        _=AudioQueueStop(queue,true)
        try check(AudioQueueDispose(queue,true)) // callbacks retire before the owner's process exits
        self.queue=nil;buffers.removeAll();lock.lock();free.removeAll();lock.unlock()
    }
}
func nativeMicrophoneBootstrap(_ deadline:Double) throws -> [String:Any] {
    var data=Data()
    while ProcessInfo.processInfo.systemUptime<deadline {
        var input=pollfd(fd:STDIN_FILENO,events:Int16(POLLIN),revents:0)
        let result=Darwin.poll(&input,1,20);if result<0 {if errno==EINTR {continue};throw NativePCMError("microphone_bootstrap")};if result==0 {continue}
        var bytes=[UInt8](repeating:0,count:4097-data.count)
        let count=Darwin.read(STDIN_FILENO,&bytes,bytes.count);guard count>0 else {throw NativePCMError("microphone_bootstrap")};data.append(contentsOf:bytes.prefix(count))
        guard data.count<=4096 else {throw NativePCMError("microphone_bootstrap")}
        if data.contains(10) {
            guard data.last==10,data.filter({$0==10}).count==1,let value=try JSONSerialization.jsonObject(with:data) as? [String:Any],Set(value.keys)==Set(["version","pipeName","pipePath","clientPid","endpoint"]),
                  let version=value["version"] as? NSNumber,CFGetTypeID(version) != CFBooleanGetTypeID(),version.doubleValue==1 else {throw NativePCMError("microphone_bootstrap")}
            return value
        }
    }
    throw NativePCMError("microphone_bootstrap")
}
func runNativeMicrophoneWorker() -> Int32 {
    let deadline=ProcessInfo.processInfo.systemUptime+2.5
    var pipe:NativePCMParentPipe?,sink:NativeMicrophoneOutput?
    do {
        signal(SIGPIPE,SIG_IGN)
        let value=try nativeMicrophoneBootstrap(deadline)
        guard let path=value["pipePath"] as? String,let name=value["pipeName"] as? String,let endpoint=value["endpoint"] as? String,let pid=value["clientPid"] as? NSNumber,
              CFGetTypeID(pid) != CFBooleanGetTypeID(),pid.doubleValue>=2,pid.doubleValue<=Double(Int32.max),pid.doubleValue.rounded()==pid.doubleValue else {throw NativePCMError("microphone_bootstrap")}
        func control() -> Bool {var input=pollfd(fd:STDIN_FILENO,events:Int16(POLLIN),revents:0);return Darwin.poll(&input,1,0)==0}
        pipe=try NativePCMParentPipe(path:path,name:name,clientPID:pid.int32Value,microphone:true)
        try pipe!.accept(active:control,deadline:deadline)
        func active() -> Bool {control() && nativeMicrophoneSession()}
        sink=try NativeMicrophoneOutput(endpoint:endpoint);try sink!.start(active:active,deadline:deadline)
        try pipe!.send(nativeMicrophoneHello,active:active,deadline:deadline)
        var previous:UInt32=0
        while active() {
            var packet=try pipe!.receiveMicrophone(active:active,deadline:ProcessInfo.processInfo.systemUptime+2)
            var pcm=Data()
            do {
                let decoded=try nativeMicrophonePacket(packet,previous:previous,now:Date().timeIntervalSince1970*1000);previous=decoded.0;pcm=decoded.2
                if decoded.1>=Date().timeIntervalSince1970*1000 {try sink!.write(pcm,active:{active() && decoded.1>=Date().timeIntervalSince1970*1000})}
            }catch{pcm.resetBytes(in:0..<pcm.count);packet.resetBytes(in:0..<packet.count);throw error}
            pcm.resetBytes(in:0..<pcm.count);packet.resetBytes(in:0..<packet.count)
        }
        try sink!.close();sink=nil;pipe!.close();return 0
    }catch{try? sink?.close();pipe?.close();return 1}
}
func generatedNativeMicrophoneTests() throws -> Int {
    var count=0
    func check(_ valid:Bool,_ message:String) throws {guard valid else {throw NativePCMError("generated microphone: "+message)};count+=1}
    func packet(_ sequence:UInt32,_ expiry:Double) -> Data {var data=Data(),seq=sequence.littleEndian,bits=expiry.bitPattern.littleEndian;withUnsafeBytes(of:&seq){data.append(contentsOf:$0)};withUnsafeBytes(of:&bits){data.append(contentsOf:$0)};data.append(Data(repeating:7,count:1920));return data}
    let valid=try nativeMicrophonePacket(packet(1,1010),previous:0,now:1000);try check(valid.0==1 && valid.1==1010 && valid.2.count==1920,"mono frame")
    for bad in [packet(0,1010),packet(1,.nan),packet(1,.infinity),packet(1,1151),Data(count:1931)] {
        do{_=try nativeMicrophonePacket(bad,previous:0,now:1000);throw NativePCMError("invalid microphone frame accepted")}
        catch let error as NativePCMError {try check(error.code.hasPrefix("microphone_"),"strict packet framing")}
    }
    let facts:[String:Any]=[kCGSessionOnConsoleKey as String:true,kCGSessionLoginDoneKey as String:true,kCGSessionUserIDKey as String:UInt32(501),"CGSSessionScreenIsLocked":false]
    try check(nativeMicrophoneSessionFacts(facts,uid:501,euid:501,bundle:"generated"),"active session")
    for key in [kCGSessionOnConsoleKey as String,kCGSessionLoginDoneKey as String] {var bad=facts;bad[key]=false;try check(!nativeMicrophoneSessionFacts(bad,uid:501,euid:501,bundle:"generated"),"inactive session")}
    var locked=facts;locked["CGSSessionScreenIsLocked"]=true;try check(!nativeMicrophoneSessionFacts(locked,uid:501,euid:501,bundle:"generated"),"locked session")
    try check(!nativeMicrophoneSessionFacts(facts,uid:501,euid:0,bundle:"generated"),"different effective user")
    try check(!nativeMicrophoneSessionFacts(facts,uid:502,euid:502,bundle:"generated"),"different console user")
    try check(!nativeMicrophoneSessionFacts(facts,uid:501,euid:501,bundle:"com.apple.loginwindow"),"loginwindow")
    var allowed=true,writes=0
    let submitted=try nativeMicrophoneBoundary(verify:{allowed=false},active:{allowed},submit:{writes+=1})
    try check(!submitted && writes==0,"metadata query cannot extend authority")
    allowed=true
    try check(try nativeMicrophoneBoundary(verify:{},active:{allowed},submit:{writes+=1}),"active boundary submitted")
    try check(writes==1,"single submitted frame")
    return count
}
