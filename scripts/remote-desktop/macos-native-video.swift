import Foundation
import AppKit
import CoreMedia
import CoreVideo
import VideoToolbox

struct NativeH264Packet {
    let data: Data,key: Bool,codec: String,width: Int,height: Int
}
protocol NativeH264Encoder: AnyObject {
    func encode(_ image: CGImage,timestamp: Int64,key: Bool,valid: @escaping () -> Bool,completion: @escaping (Result<NativeH264Packet,Error>) -> Void)
    func stop(_ completion: @escaping () -> Void)
}

/** One serial, lazily created VT session. Callbacks never wait for the source gate. */
final class ToolboxH264Encoder: NativeH264Encoder {
    let queue=DispatchQueue(label:"dev.sodashitsu.native-h264"),flag=NSLock()
    let fps: Int,kbps: Int,hardware: Bool
    private var stopped=false,session: VTCompressionSession?,size: (Int,Int)?
    init(fps: Int,kbps: Int,hardware: Bool=true) { self.fps=fps;self.kbps=kbps;self.hardware=hardware }
    func running() -> Bool { flag.lock();defer { flag.unlock() };return !stopped }
    func prepare(_ width: Int,_ height: Int) throws -> VTCompressionSession {
        if let session=session { guard size?.0==width,size?.1==height else { throw NativeError("backend_failure") };return session }
        var created: VTCompressionSession?
        let spec=[kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder:hardware] as CFDictionary
        guard VTCompressionSessionCreate(allocator:kCFAllocatorDefault,width:Int32(width),height:Int32(height),codecType:kCMVideoCodecType_H264,encoderSpecification:spec,imageBufferAttributes:nil,compressedDataAllocator:nil,outputCallback:nil,refcon:nil,compressionSessionOut:&created)==noErr,let value=created else { throw NativeError("backend_failure") }
        do {
            let properties:[CFString:Any]=[
                kVTCompressionPropertyKey_RealTime:true,
                kVTCompressionPropertyKey_AllowFrameReordering:false,
                kVTCompressionPropertyKey_ProfileLevel:kVTProfileLevel_H264_Baseline_AutoLevel,
                kVTCompressionPropertyKey_AverageBitRate:kbps*1000,
                kVTCompressionPropertyKey_ExpectedFrameRate:fps,
                kVTCompressionPropertyKey_MaxKeyFrameInterval:fps,
                kVTCompressionPropertyKey_MaxFrameDelayCount:1]
            guard VTSessionSetProperties(value,propertyDictionary:properties as CFDictionary)==noErr,VTCompressionSessionPrepareToEncodeFrames(value)==noErr else { throw NativeError("backend_failure") }
            session=value;size=(width,height);return value
        } catch { VTCompressionSessionInvalidate(value);throw error }
    }
    func encode(_ image: CGImage,timestamp: Int64,key: Bool,valid: @escaping () -> Bool,completion: @escaping (Result<NativeH264Packet,Error>) -> Void) {
        queue.async {
            do {
                guard self.running(),valid() else { throw NativeError("source_changed") }
                let width=image.width-image.width%2,height=image.height-image.height%2
                guard width>=2,width<=1920,height>=2,height<=2400 else { throw NativeError("unsupported") }
                let session=try self.prepare(width,height)
                var created: CVPixelBuffer?
                let attributes=[kCVPixelBufferCGImageCompatibilityKey:true,kCVPixelBufferCGBitmapContextCompatibilityKey:true,kCVPixelBufferIOSurfacePropertiesKey:[:]] as CFDictionary
                guard CVPixelBufferCreate(kCFAllocatorDefault,width,height,kCVPixelFormatType_32BGRA,attributes,&created)==kCVReturnSuccess,let pixel=created else { throw NativeError("backend_failure") }
                guard CVPixelBufferLockBaseAddress(pixel,[])==kCVReturnSuccess else { throw NativeError("backend_failure") }
                do {
                    defer { CVPixelBufferUnlockBaseAddress(pixel,[]) }
                    guard let context=CGContext(data:CVPixelBufferGetBaseAddress(pixel),width:width,height:height,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(pixel),space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGBitmapInfo.byteOrder32Little.rawValue|CGImageAlphaInfo.premultipliedFirst.rawValue) else { throw NativeError("backend_failure") }
                    context.draw(image,in:CGRect(x:0,y:0,width:CGFloat(width),height:CGFloat(height)))
                }
                guard self.running(),valid() else { throw NativeError("source_changed") }
                let properties=key ? [kVTEncodeFrameOptionKey_ForceKeyFrame:true] as CFDictionary:nil
                let status=VTCompressionSessionEncodeFrame(session,imageBuffer:pixel,presentationTimeStamp:CMTime(value:timestamp,timescale:1000000),duration:CMTime(value:1,timescale:CMTimeScale(self.fps)),frameProperties:properties,infoFlagsOut:nil) { status,flags,sample in
                    withExtendedLifetime(pixel) {
                        do {
                            guard status==noErr,!flags.contains(.frameDropped),self.running(),valid(),let sample=sample,CMSampleBufferDataIsReady(sample) else { throw NativeError("source_changed") }
                            completion(.success(try Self.packet(sample,width:width,height:height)))
                        } catch { completion(.failure(error)) }
                    }
                }
                if status != noErr { throw NativeError("backend_failure") }
            } catch { completion(.failure(error)) }
        }
    }
    static func packet(_ sample: CMSampleBuffer,width: Int,height: Int) throws -> NativeH264Packet {
        guard let format=CMSampleBufferGetFormatDescription(sample),let block=CMSampleBufferGetDataBuffer(sample),CMBlockBufferGetDataLength(block)<=512*1024-9 else { throw NativeError("backend_failure") }
        let attachments=CMSampleBufferGetSampleAttachmentsArray(sample,createIfNecessary:false) as? [[CFString:Any]]
        let key=(attachments?.first?[kCMSampleAttachmentKey_NotSync] as? Bool) != true
        var lengthSize:Int32=0,count=0,pointer:UnsafePointer<UInt8>?,length=0
        guard CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format,parameterSetIndex:0,parameterSetPointerOut:&pointer,parameterSetSizeOut:&length,parameterSetCountOut:&count,nalUnitHeaderLengthOut:&lengthSize)==noErr,length>=4,let sps=pointer,lengthSize>=1,lengthSize<=4,count<=8 else { throw NativeError("backend_failure") }
        let codec=String(format:"avc1.%02X%02X%02X",sps[1],sps[2],sps[3]);var annex=Data()
        if key {
            for index in 0..<count {
                guard CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format,parameterSetIndex:index,parameterSetPointerOut:&pointer,parameterSetSizeOut:&length,parameterSetCountOut:nil,nalUnitHeaderLengthOut:nil)==noErr,length>0,length<=65536,let bytes=pointer else { throw NativeError("backend_failure") }
                annex.append(contentsOf:[0,0,0,1]);annex.append(bytes,count:length)
            }
        }
        let rawSize=CMBlockBufferGetDataLength(block);var raw=Data(count:rawSize)
        let status=raw.withUnsafeMutableBytes { CMBlockBufferCopyDataBytes(block,atOffset:0,dataLength:rawSize,destination:$0.baseAddress!) }
        guard status==kCMBlockBufferNoErr else { throw NativeError("backend_failure") };var offset=0
        while offset<raw.count {
            guard raw.count-offset>=Int(lengthSize) else { throw NativeError("backend_failure") }
            let size=raw[offset..<offset+Int(lengthSize)].reduce(0) { ($0<<8)|Int($1) };offset+=Int(lengthSize)
            guard size>0,size<=raw.count-offset,annex.count+4+size<=512*1024-9 else { throw NativeError("backend_failure") }
            annex.append(contentsOf:[0,0,0,1]);annex.append(raw.subdata(in:offset..<offset+size));offset+=size
        }
        guard !annex.isEmpty else { throw NativeError("backend_failure") }
        return NativeH264Packet(data:annex,key:key,codec:codec,width:width,height:height)
    }
    func stop(_ completion: @escaping () -> Void) {
        flag.lock();stopped=true;flag.unlock()
        queue.async {
            if let session=self.session {
                // Keep the physical slot until callbacks and native invalidation return.
                _=VTCompressionSessionCompleteFrames(session,untilPresentationTimeStamp:.invalid)
                VTCompressionSessionInvalidate(session);self.session=nil
            }
            completion()
        }
    }
}

final class GeneratedNativeEncoder: NativeH264Encoder {
    var completions=[(Result<NativeH264Packet,Error>)->Void](),retire:(()->Void)?
    func encode(_ image:CGImage,timestamp:Int64,key:Bool,valid:@escaping()->Bool,completion:@escaping(Result<NativeH264Packet,Error>)->Void) { if valid() {completions.append(completion)} }
    func stop(_ completion:@escaping()->Void) {retire=completion}
}
final class GeneratedNativePacketBox {
    let gate=NSLock();private var result:Result<NativeH264Packet,Error>?
    func put(_ value:Result<NativeH264Packet,Error>) {gate.lock();result=value;gate.unlock()}
    func get() -> Result<NativeH264Packet,Error>? {gate.lock();defer {gate.unlock()};return result}
}
func generatedNativeVideoTests() throws -> Int {
    var count=0
    func check(_ condition:@autoclosure()->Bool,_ detail:String) throws {guard condition() else {throw GeneratedFailure(detail:detail)};count+=1}
    func spin(_ ready:()->Bool) -> Bool {
        let deadline=Date().addingTimeInterval(1)
        while !ready() && Date()<deadline {_=RunLoop.current.run(mode:.default,before:Date().addingTimeInterval(0.005))}
        return ready()
    }
    let colors:[[UInt8]]=[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,0,255]]
    var pixels=Data()
    for y in 0..<64 {for x in 0..<64 {pixels.append(contentsOf:colors[(y<32 ? 0:2)+(x<32 ? 0:1)])}}
    guard let provider=CGDataProvider(data:pixels as CFData),let image=CGImage(width:64,height:64,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:256,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue|CGBitmapInfo.byteOrder32Big.rawValue),provider:provider,decode:nil,shouldInterpolate:false,intent:.defaultIntent) else {throw GeneratedFailure(detail:"generated native video image")}
    let packet=NativeH264Packet(data:Data([0,0,0,1,0x65,0x88]),key:true,codec:"avc1.42E01E",width:64,height:64)
    var now:Double=0,alive=true,encoders=[GeneratedNativeEncoder](),output=[([String:Any],(()->Bool)?)]()
    let controller=NativeVideoController(gate:NSRecursiveLock(),active:{alive},now:{now},emit:{output.append(($0,$1))},factory:{_,_ in let encoder=GeneratedNativeEncoder();encoders.append(encoder);return encoder})
    func start(_ id:String=UUID().uuidString.lowercased()) throws {try controller.command(["type":"native_video","id":id,"enabled":true,"fps":30,"bitrateKbps":2500,"window":3])}
    controller.offer(image,captured:now);try check(encoders.isEmpty,"native video disabled never creates encoder")
    let first=UUID().uuidString.lowercased();try start(first);controller.offer(image,captured:now);now=34;controller.offer(image,captured:now)
    try check(encoders.count==1 && encoders[0].completions.count==1,"native video single physical encoding job")
    encoders[0].completions[0](.success(packet));try check(spin({controller.inflight==nil}),"native video completion admitted")
    let frame=output.first(where:{$0.0["type"] as? String=="native_frame"})!
    try check(frame.0["seq"] as? Int==1 && frame.1?()==true,"native video queued frame has live source")
    var rejected=false;do {try start(first)} catch {rejected=true}
    try check(rejected && controller.current?.seq==1,"native video same id cannot reset sequence")
    now=34;controller.offer(image,captured:now);try check(encoders[0].completions.count==2,"native video independent capture after encode completes")
    now+=2001;try controller.command(["type":"native_video_ack","id":first,"seq":1])
    try check(controller.current==nil && frame.1?()==false,"native video late ack cannot erase deadline")
    try start();try check(controller.current==nil && encoders.count==1,"native video retirement holds physical encoder slot")
    encoders[0].completions[1](.success(packet));try check(spin({controller.inflight==nil}),"native video stale completion drains job")
    encoders[0].retire?();try check(spin({controller.quiescent}),"native video old encoder retired")
    let next=UUID().uuidString.lowercased();try start(next);controller.offer(image,captured:now)
    try check(encoders.count==2 && controller.current?.id==next,"native video explicit retry starts after retirement")
    try controller.command(["type":"native_video","id":first,"enabled":false])
    try check(controller.current?.id==next && encoders[1].retire==nil,"native video old disable cannot stop replacement")
    alive=false;controller.tick();try check(controller.current==nil,"native video source revocation ends stream")
    encoders[1].retire?();try check(spin({controller.quiescent}),"native video revoked encoder retired")

    let ledger=NativeVideoController(gate:NSRecursiveLock(),active:{true},now:{0},emit:{_,_ in})
    func ledgerStart(_ id:String) throws {try ledger.command(["type":"native_video","id":id,"enabled":true,"fps":30,"bitrateKbps":2500])}
    let original=UUID().uuidString.lowercased();try ledgerStart(original);ledger.stop(notify:false)
    for _ in 0..<33 {try ledgerStart(UUID().uuidString.lowercased());ledger.stop(notify:false)}
    for spelling in [original,original.uppercased()] {
        var denied=false;do {try ledgerStart(spelling)} catch {denied=true}
        try check(denied,"native video UUID cannot replay after ledger window or case change")
    }
    for _ in 0..<990 {try ledgerStart(UUID().uuidString.lowercased());ledger.stop(notify:false)}
    var exhausted=false;do {try ledgerStart(UUID().uuidString.lowercased())} catch {exhausted=true}
    try check(exhausted && ledger.current==nil,"native video bounded sticky UUID ledger fails closed")

    // Actual software VideoToolbox encode uses this generated CGImage only.
    let encoder=ToolboxH264Encoder(fps:30,kbps:2500,hardware:false),box=GeneratedNativePacketBox(),encoded=DispatchSemaphore(value:0)
    encoder.encode(image,timestamp:1,key:true,valid:{true}) {box.put($0);encoded.signal()}
    let completed=encoded.wait(timeout:.now()+5) == .success
    let retired=DispatchSemaphore(value:0);encoder.stop {retired.signal()}
    try check(retired.wait(timeout:.now()+5) == .success,"generated VideoToolbox encoder retirement")
    guard completed,let result=box.get() else {throw GeneratedFailure(detail:"generated VideoToolbox encode deadline")}
    let actual=try result.get()
    try check(actual.key && actual.width==64 && actual.height==64 && actual.codec.hasPrefix("avc1.") && actual.data.count>20 && actual.data.count<512*1024,"generated VideoToolbox H264 output")
    let decoded=try generatedNativeDecode(actual.data)
    try check(decoded.count==4,"generated VideoToolbox decoded pixels")
    for index in 0..<4 {for channel in 0..<3 {try check(abs(Int(decoded[index][channel])-Int(colors[index][channel]))<40,"generated VideoToolbox orientation and color order")}}
    return count
}

/** Test-only software decoder for the generated Annex B record, no OS source. */
func generatedNativeDecode(_ data:Data) throws -> [[UInt8]] {
    let bytes=Array(data);var units=[Data](),start=0,index=4
    guard bytes.count>4,Array(bytes.prefix(4))==[0,0,0,1] else {throw GeneratedFailure(detail:"generated H264 Annex B")}
    while index+4<=bytes.count {
        if bytes[index]==0 && bytes[index+1]==0 && bytes[index+2]==0 && bytes[index+3]==1 {units.append(Data(bytes[start+4..<index]));start=index;index+=4}
        else {index+=1}
    }
    units.append(Data(bytes[start+4..<bytes.count]))
    guard let sps=units.first(where:{$0.first.map{$0&31==7}==true}),let pps=units.first(where:{$0.first.map{$0&31==8}==true}) else {throw GeneratedFailure(detail:"generated H264 parameter sets")}
    var format:CMFormatDescription?
    let formatStatus=sps.withUnsafeBytes { s in pps.withUnsafeBytes { p in
        CMVideoFormatDescriptionCreateFromH264ParameterSets(allocator:kCFAllocatorDefault,parameterSetCount:2,parameterSetPointers:[s.bindMemory(to:UInt8.self).baseAddress!,p.bindMemory(to:UInt8.self).baseAddress!],parameterSetSizes:[sps.count,pps.count],nalUnitHeaderLength:4,formatDescriptionOut:&format)
    } }
    guard formatStatus==noErr,let description=format else {throw GeneratedFailure(detail:"generated H264 format")}
    var avc=Data()
    for unit in units where unit.first.map({$0&31 != 7 && $0&31 != 8})==true {
        var size=UInt32(unit.count).bigEndian;withUnsafeBytes(of:&size) {avc.append(contentsOf:$0)};avc.append(unit)
    }
    var createdBlock:CMBlockBuffer?
    guard CMBlockBufferCreateWithMemoryBlock(allocator:kCFAllocatorDefault,memoryBlock:nil,blockLength:avc.count,blockAllocator:kCFAllocatorDefault,customBlockSource:nil,offsetToData:0,dataLength:avc.count,flags:0,blockBufferOut:&createdBlock)==noErr,let block=createdBlock else {throw GeneratedFailure(detail:"generated decode block")}
    let copied=avc.withUnsafeBytes {CMBlockBufferReplaceDataBytes(with:$0.baseAddress!,blockBuffer:block,offsetIntoDestination:0,dataLength:avc.count)}
    guard copied==noErr else {throw GeneratedFailure(detail:"generated decode bytes")}
    var timing=CMSampleTimingInfo(duration:CMTime(value:1,timescale:30),presentationTimeStamp:CMTime(value:1,timescale:1000000),decodeTimeStamp:.invalid),size=avc.count,sample:CMSampleBuffer?
    guard CMSampleBufferCreateReady(allocator:kCFAllocatorDefault,dataBuffer:block,formatDescription:description,sampleCount:1,sampleTimingEntryCount:1,sampleTimingArray:&timing,sampleSizeEntryCount:1,sampleSizeArray:&size,sampleBufferOut:&sample)==noErr,let frame=sample else {throw GeneratedFailure(detail:"generated decode sample")}
    var created:VTDecompressionSession?
    let spec=[kVTVideoDecoderSpecification_EnableHardwareAcceleratedVideoDecoder:false] as CFDictionary,attributes=[kCVPixelBufferPixelFormatTypeKey:kCVPixelFormatType_32BGRA] as CFDictionary
    guard VTDecompressionSessionCreate(allocator:kCFAllocatorDefault,formatDescription:description,decoderSpecification:spec,imageBufferAttributes:attributes,outputCallback:nil,decompressionSessionOut:&created)==noErr,let decoder=created else {throw GeneratedFailure(detail:"generated software decoder")}
    defer {VTDecompressionSessionInvalidate(decoder)}
    var result=[[UInt8]]()
    // Empty flags require the callback to complete before DecodeFrame returns.
    let status=VTDecompressionSessionDecodeFrame(decoder,sampleBuffer:frame,flags:[],infoFlagsOut:nil) {status,_,image,_,_ in
        guard status==noErr,let image=image,CVPixelBufferGetWidth(image)==64,CVPixelBufferGetHeight(image)==64,CVPixelBufferGetPixelFormatType(image)==kCVPixelFormatType_32BGRA,CVPixelBufferLockBaseAddress(image,.readOnly)==kCVReturnSuccess else {return}
        defer {CVPixelBufferUnlockBaseAddress(image,.readOnly)}
        guard let base=CVPixelBufferGetBaseAddress(image)?.assumingMemoryBound(to:UInt8.self) else {return}
        let stride=CVPixelBufferGetBytesPerRow(image)
        for (x,y) in [(8,8),(48,8),(8,48),(48,48)] {let offset=y*stride+x*4;result.append([base[offset+2],base[offset+1],base[offset]])}
    }
    guard status==noErr,result.count==4 else {throw GeneratedFailure(detail:"generated software decode")}
    return result
}

final class NativeVideoStream {
    let id:String,fps:Int,kbps:Int,window:Int
    var dead=false,seq=0,timestamp:Int64 = -1,key=true,next:Double=0,codec:String?,width:Int?,height:Int?
    var pending=[(seq:Int,at:Double)]()
    init(id:String,fps:Int,kbps:Int,window:Int) { self.id=id;self.fps=fps;self.kbps=kbps;self.window=window }
}
final class NativeVideoJob {
    let stream:NativeVideoStream,captured:Double,key:Bool
    init(_ stream:NativeVideoStream,_ captured:Double,_ key:Bool) { self.stream=stream;self.captured=captured;self.key=key }
}
/** Source.gate serializes kernel, callback admission and final publication. */
final class NativeVideoController {
    let gate:NSRecursiveLock,active:()->Bool,now:()->Double,emit:([String:Any],(() -> Bool)?) throws -> Void
    let factory:(Int,Int)throws->NativeH264Encoder
    private(set) var current:NativeVideoStream?,inflight:NativeVideoJob?
    private var encoder:NativeH264Encoder?,retiring=false,seen=Set<String>(),revision=UUID()
    init(gate:NSRecursiveLock,active:@escaping()->Bool,now:@escaping()->Double=milliseconds,emit:@escaping([String:Any],(() -> Bool)?)throws->Void,factory:@escaping(Int,Int)throws->NativeH264Encoder={ToolboxH264Encoder(fps:$0,kbps:$1)}) {
        self.gate=gate;self.active=active;self.now=now;self.emit=emit;self.factory=factory
    }
    func locked<T>(_ action:()throws->T) rethrows -> T { gate.lock();defer {gate.unlock()};return try action() }
    func live(_ stream:NativeVideoStream,captured:Double?=nil) -> Bool {
        let granted=active(),time=now()
        return granted && current===stream && !stream.dead && (captured==nil || (time>=captured! && time<=captured!+1000)) && (stream.pending.first==nil || (time>=stream.pending[0].at && time<=stream.pending[0].at+2000))
    }
    func stop(_ expected:NativeVideoStream?=nil,notify:Bool=true) {
        locked {
            if let expected=expected,current !== expected { return };revision=UUID()
            if let stream=current { current=nil;stream.dead=true;stream.pending.removeAll();if notify {try? emit(["type":"native_video_stopped","id":stream.id],nil)} }
            guard let old=encoder,!retiring else {return};retiring=true
            old.stop { [weak self] in DispatchQueue.main.async {
                guard let self=self else {return};self.locked { if self.encoder===old {self.encoder=nil;self.retiring=false;self.inflight=nil} }
            } }
        }
    }
    func command(_ value:[String:Any]) throws {
        try locked {
            guard let kind=value["type"] as? String,let rawID=value["id"] as? String,rawID.count==36,let uuid=UUID(uuidString:rawID) else { throw NativeError("backend_failure") }
            let id=uuid.uuidString.lowercased()
            if kind=="native_video" {
                guard Set(value.keys).isSubset(of:["type","id","enabled","fps","bitrateKbps","window","codec"]),let enabled=boolean(value["enabled"]) else { throw NativeError("backend_failure") }
                if !enabled {if current?.id==id {stop(notify:false)};return}
                guard let fps=integer(value["fps"],1,60),let kbps=integer(value["bitrateKbps"],128,50000),let window=integer(value["window"] ?? 1,1,3),[1,3].contains(window),(value["codec"]==nil || value["codec"] as? String=="h264"),!seen.contains(id),seen.count<1024,current?.id != id else { throw NativeError("unsupported") }
                stop();let started=revision,granted=active()
                guard started==revision else {return}
                guard granted,quiescent else {try emit(["type":"native_video_stopped","id":id],nil);return}
                seen.insert(id);current=NativeVideoStream(id:id,fps:Int(fps),kbps:Int(kbps),window:Int(window));revision=UUID();return
            }
            guard let stream=current,stream.id==id else {return}
            if kind=="native_keyframe" {stream.key=true;return}
            guard kind=="native_video_ack",Set(value.keys).isSubset(of:["type","id","seq"]),let seq=integer(value["seq"],1,0xffffffff) else {throw NativeError("backend_failure")}
            guard live(stream) else {stop(stream);return}
            guard stream.pending.first?.seq==Int(seq) else {throw NativeError("backend_failure")};stream.pending.removeFirst()
        }
    }
    func tick() {
        locked { guard let stream=current else {return};if !live(stream) || (inflight != nil && now()-inflight!.captured>1000) {stop(stream)} }
    }
    var quiescent:Bool {locked {encoder==nil && !retiring && inflight==nil}}
    var captureFPS:Int { locked {current?.fps ?? 0} }
    func offer(_ image:CGImage,captured:Double) {
        locked {
            guard let stream=current else {return}
            guard captured.isFinite,captured>=0,captured<=safeInteger/1000,live(stream,captured:captured) else {stop(stream);return}
            guard inflight==nil,!retiring,stream.pending.count<stream.window,captured>=stream.next else {return}
            let job=NativeVideoJob(stream,captured,stream.key);inflight=job;stream.key=false;stream.next=captured+1000/Double(stream.fps)
            do {
                if encoder==nil {encoder=try factory(stream.fps,stream.kbps)}
                guard current===stream,!retiring,let encoder=encoder else {throw NativeError("source_changed")}
                encoder.encode(image,timestamp:Int64(captured*1000),key:job.key,valid:{ [weak self] in
                    guard let self=self else {return false};return self.locked {self.inflight===job && self.current===stream && !stream.dead && self.now()>=job.captured && self.now()<=job.captured+1000}
                },completion:{ [weak self] result in DispatchQueue.main.async {self?.complete(job,result)} })
            } catch {if encoder==nil {inflight=nil};stop(stream)}
        }
    }
    func complete(_ job:NativeVideoJob,_ result:Result<NativeH264Packet,Error>) {
        locked {
            guard inflight===job else {return};inflight=nil
            let stream=job.stream;guard current===stream else {return}
            do {
                let packet=try result.get()
                guard live(stream,captured:job.captured),packet.data.count<=512*1024-9,packet.data.count>0,packet.width>=2,packet.width<=1920,packet.height>=2,packet.height<=2400,packet.width%2==0,packet.height%2==0,!job.key || packet.key,stream.seq<0xffffffff,(stream.codec==nil || stream.codec==packet.codec),(stream.width==nil || stream.width==packet.width && stream.height==packet.height) else {throw NativeError("backend_failure")}
                let timestamp=Int64(job.captured*1000);guard timestamp>stream.timestamp else {throw NativeError("backend_failure")}
                stream.codec=packet.codec;stream.width=packet.width;stream.height=packet.height;stream.timestamp=timestamp;stream.seq+=1;stream.pending.append((stream.seq,now()))
                try emit(["type":"native_frame","id":stream.id,"seq":stream.seq,"timestamp":timestamp,"key":packet.key,"codec":packet.codec,"width":packet.width,"height":packet.height,"captureMs":0,"conversionMs":0,"encodeMs":max(0,now()-job.captured),"data":packet.data.base64EncodedString()],{ [weak self] in
                    guard let self=self else {return false};return self.locked {if self.live(stream,captured:job.captured) {return true};self.stop(stream);return false}
                })
            } catch {stop(stream)}
        }
    }
}
