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
    func rate(_ kbps:Int,valid:@escaping()->Bool)
    func stop(_ completion: @escaping () -> Void)
}

/** One serial, lazily created VT session. Callbacks never wait for the source gate. */
final class ToolboxH264Encoder: NativeH264Encoder {
    let queue=DispatchQueue(label:"dev.sodashitsu.native-h264"),flag=NSLock()
    let fps: Int,hardware: Bool,family:String
    private var kbps: Int,rateFailed=false
    private let target:(Int,Int)?
    private var stopped=false,session: VTCompressionSession?,size: (Int,Int)?
    private let setRate:(VTCompressionSession,Int)->OSStatus
    init(fps: Int,kbps: Int,hardware: Bool=true,family:String="h264",target:(Int,Int)?=nil,setRate:@escaping(VTCompressionSession,Int)->OSStatus={VTSessionSetProperty($0,key:kVTCompressionPropertyKey_AverageBitRate,value:($1*1000) as CFNumber)}) { self.fps=fps;self.kbps=kbps;self.hardware=hardware;self.family=family;self.target=target;self.setRate=setRate }
    static func hasHardwareHEVC(_ encoders:[[CFString:Any]]) -> Bool {
        return encoders.prefix(128).contains {encoder in
            guard let codec=integer(encoder[kVTVideoEncoderList_CodecType],0,Int64(UInt32.max)) else {return false}
            return UInt32(codec)==kCMVideoCodecType_HEVC && boolean(encoder[kVTVideoEncoderList_IsHardwareAccelerated])==true
        }
    }
    static func hardwareHEVCAvailable() -> Bool {
        var copied:CFArray?
        guard VTCopyVideoEncoderList(nil,&copied)==noErr,let encoders=copied as? [[CFString:Any]] else {return false}
        return hasHardwareHEVC(encoders)
    }
    func running() -> Bool { flag.lock();defer { flag.unlock() };return !stopped }
    func prepare(_ width: Int,_ height: Int) throws -> VTCompressionSession {
        if let session=session { guard size?.0==width,size?.1==height else { throw NativeError("backend_failure") };return session }
        guard ["h264","hevc"].contains(family) else {throw NativeError("unsupported")}
        var created: VTCompressionSession?
        let spec=[kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder:hardware] as CFDictionary
        guard VTCompressionSessionCreate(allocator:kCFAllocatorDefault,width:Int32(width),height:Int32(height),codecType:family=="hevc" ? kCMVideoCodecType_HEVC:kCMVideoCodecType_H264,encoderSpecification:spec,imageBufferAttributes:nil,compressedDataAllocator:nil,outputCallback:nil,refcon:nil,compressionSessionOut:&created)==noErr,let value=created else { throw NativeError("backend_failure") }
        do {
            let properties:[CFString:Any]=[
                kVTCompressionPropertyKey_RealTime:true,
                kVTCompressionPropertyKey_AllowFrameReordering:false,
                kVTCompressionPropertyKey_ProfileLevel:family=="hevc" ? kVTProfileLevel_HEVC_Main_AutoLevel:kVTProfileLevel_H264_Baseline_AutoLevel,
                kVTCompressionPropertyKey_AverageBitRate:kbps*1000,
                kVTCompressionPropertyKey_ExpectedFrameRate:fps,
                kVTCompressionPropertyKey_MaxKeyFrameInterval:fps,
                kVTCompressionPropertyKey_MaxFrameDelayCount:1]
            guard VTSessionSetProperties(value,propertyDictionary:properties as CFDictionary)==noErr,VTCompressionSessionPrepareToEncodeFrames(value)==noErr else { throw NativeError("backend_failure") }
            session=value;size=(width,height);return value
        } catch { VTCompressionSessionInvalidate(value);throw error }
    }
    func rate(_ kbps:Int,valid:@escaping()->Bool) {
        queue.async {
            guard self.running(),valid(),kbps != self.kbps else {return}
            if let session=self.session,self.setRate(session,kbps) != noErr {self.rateFailed=true;return}
            self.kbps=kbps
        }
    }
    func encode(_ image: CGImage,timestamp: Int64,key: Bool,valid: @escaping () -> Bool,completion: @escaping (Result<NativeH264Packet,Error>) -> Void) {
        queue.async {
            do {
                guard self.running(),!self.rateFailed,valid() else { throw NativeError("source_changed") }
                let width=self.target?.0 ?? (image.width-image.width%2),height=self.target?.1 ?? (image.height-image.height%2)
                guard width>=2,width<=1920,width<=image.width,width%2==0,height>=2,height<=2400,height<=image.height,height%2==0 else { throw NativeError("unsupported") }
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
    static func hevcCodec(_ nal:Data) throws -> String {
        let bytes=Array(nal);guard bytes.count>=2,(bytes[0]>>1)&63==33 else {throw NativeError("backend_failure")}
        var rbsp=[UInt8](),zeros=0
        for value in bytes.dropFirst(2) {if zeros>=2 && value==3 {zeros=0;continue};rbsp.append(value);zeros=value==0 ? zeros+1:0}
        guard rbsp.count>=13 else {throw NativeError("backend_failure")}
        let space=Int(rbsp[1]>>6),tier=rbsp[1]&32 != 0,profile=rbsp[1]&31
        var flags=rbsp[2..<6].reduce(UInt32(0)){($0<<8)|UInt32($1)},compatibility:UInt32=0
        for _ in 0..<32 {compatibility=(compatibility<<1)|(flags&1);flags>>=1}
        var constraints=Array(rbsp[6..<12]);while constraints.last==0 {constraints.removeLast()}
        let spaceText=space==0 ? "":String(UnicodeScalar(64+space)!)
        let prefix="hev1."+spaceText+String(profile)+String(format:".%X.",compatibility)
        let suffix=constraints.map{String(format:".%02X",$0)}.joined()
        return prefix+(tier ? "H":"L")+String(rbsp[12])+suffix
    }
    static func packet(_ sample: CMSampleBuffer,width: Int,height: Int) throws -> NativeH264Packet {
        guard let format=CMSampleBufferGetFormatDescription(sample),let block=CMSampleBufferGetDataBuffer(sample),CMBlockBufferGetDataLength(block)<=512*1024-9 else { throw NativeError("backend_failure") }
        let attachments=CMSampleBufferGetSampleAttachmentsArray(sample,createIfNecessary:false) as? [[CFString:Any]]
        let key=(attachments?.first?[kCMSampleAttachmentKey_NotSync] as? Bool) != true
        let subtype=CMFormatDescriptionGetMediaSubType(format),hevc=CMFormatDescriptionGetMediaSubType(format)==kCMVideoCodecType_HEVC
        guard subtype==kCMVideoCodecType_H264 || hevc else {throw NativeError("unsupported")}
        var lengthSize:Int32=0,count=0,pointer:UnsafePointer<UInt8>?,length=0
        let first=hevc ? CMVideoFormatDescriptionGetHEVCParameterSetAtIndex(format,parameterSetIndex:0,parameterSetPointerOut:&pointer,parameterSetSizeOut:&length,parameterSetCountOut:&count,nalUnitHeaderLengthOut:&lengthSize):CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format,parameterSetIndex:0,parameterSetPointerOut:&pointer,parameterSetSizeOut:&length,parameterSetCountOut:&count,nalUnitHeaderLengthOut:&lengthSize)
        guard first==noErr,length>=4,let sps=pointer,lengthSize>=1,lengthSize<=4,count>=2,count<=8 else { throw NativeError("backend_failure") }
        var codec:String?=hevc ? nil:String(format:"avc1.%02x%02x%02x",sps[1],sps[2],sps[3]),annex=Data(),parameterTypes=Set<Int>()
        for index in 0..<count {
            let status=hevc ? CMVideoFormatDescriptionGetHEVCParameterSetAtIndex(format,parameterSetIndex:index,parameterSetPointerOut:&pointer,parameterSetSizeOut:&length,parameterSetCountOut:nil,nalUnitHeaderLengthOut:nil):CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format,parameterSetIndex:index,parameterSetPointerOut:&pointer,parameterSetSizeOut:&length,parameterSetCountOut:nil,nalUnitHeaderLengthOut:nil)
            guard status==noErr,length>0,length<=65536,let bytes=pointer else {throw NativeError("backend_failure")}
            if hevc {guard length>=2 else {throw NativeError("backend_failure")};let kind=Int((bytes[0]>>1)&63);parameterTypes.insert(kind);if kind==33 {codec=try hevcCodec(Data(bytes:bytes,count:length))}}
            if key {annex.append(contentsOf:[0,0,0,1]);annex.append(bytes,count:length)}
        }
        guard let codec=codec,!hevc || Set([32,33,34]).isSubset(of:parameterTypes) else {throw NativeError("backend_failure")}
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
    var rates=[Int]()
    func rate(_ kbps:Int,valid:@escaping()->Bool) {if valid(){rates.append(kbps)}}
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
    let generatedEncoder:[CFString:Any]=[kVTVideoEncoderList_CodecType:NSNumber(value:kCMVideoCodecType_HEVC),kVTVideoEncoderList_IsHardwareAccelerated:true]
    try check(ToolboxH264Encoder.hasHardwareHEVC([generatedEncoder]),"generated hardware HEVC capability")
    try check(!ToolboxH264Encoder.hasHardwareHEVC([[kVTVideoEncoderList_CodecType:NSNumber(value:kCMVideoCodecType_HEVC),kVTVideoEncoderList_IsHardwareAccelerated:false]]),"generated software encoder is not hardware HEVC")
    try check(!ToolboxH264Encoder.hasHardwareHEVC([[kVTVideoEncoderList_CodecType:NSNumber(value:kCMVideoCodecType_H264),kVTVideoEncoderList_IsHardwareAccelerated:true]]),"generated H264 encoder is not HEVC")
    let generatedHEVCSPS=Data(base64Encoded:"QgEBAWAAAAMAsAAAAwAAAwA/oAUCAXHy8uSQpWS4/8AAQABagICAggAAAwACAAADAD2I")!
    let generatedHEVCCodec=try ToolboxH264Encoder.hevcCodec(generatedHEVCSPS)
    try check(generatedHEVCCodec=="hev1.1.6.L63.B0","generated HEVC actual SPS profile tier level")
    let colors:[[UInt8]]=[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,0,255]]
    var pixels=Data()
    for y in 0..<64 {for x in 0..<64 {pixels.append(contentsOf:colors[(y<32 ? 0:2)+(x<32 ? 0:1)])}}
    guard let provider=CGDataProvider(data:pixels as CFData),let image=CGImage(width:64,height:64,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:256,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue|CGBitmapInfo.byteOrder32Big.rawValue),provider:provider,decode:nil,shouldInterpolate:false,intent:.defaultIntent) else {throw GeneratedFailure(detail:"generated native video image")}
    let packet=NativeH264Packet(data:Data([0,0,0,1,0x65,0x88]),key:true,codec:"avc1.42e01e",width:64,height:64)
    var now:Double=0,alive=true,encoders=[GeneratedNativeEncoder](),output=[([String:Any],(()->Bool)?)]()
    let controller=NativeVideoController(gate:NSRecursiveLock(),active:{alive},now:{now},emit:{output.append(($0,$1))},factory:{_ in let encoder=GeneratedNativeEncoder();encoders.append(encoder);return encoder})
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
    let replacement=UUID().uuidString.lowercased();try start(replacement);try check(controller.current==nil && encoders.count==1,"native video retirement holds physical encoder slot")
    encoders[0].completions[1](.success(packet));try check(spin({controller.inflight==nil}),"native video stale completion drains job")
    encoders[0].retire?();try check(spin({controller.quiescent}),"native video old encoder retired")
    try check(controller.current?.id==replacement,"native video pending replacement activates after physical retirement")
    let next=replacement;controller.offer(image,captured:now)
    try check(encoders.count==2 && controller.current?.id==next,"native video explicit retry starts after retirement")
    try controller.command(["type":"native_video","id":first,"enabled":false])
    try check(controller.current?.id==next && encoders[1].retire==nil,"native video old disable cannot stop replacement")
    alive=false;controller.tick();try check(controller.current==nil,"native video source revocation ends stream")
    encoders[1].retire?();try check(spin({controller.quiescent}),"native video revoked encoder retired")

    for reason in ["cancel","expiry","source"] {
        var clock:Double=0,permitted=true,owned=[GeneratedNativeEncoder]()
        let pending=NativeVideoController(gate:NSRecursiveLock(),active:{permitted},now:{clock},emit:{_,_ in},factory:{_ in let encoder=GeneratedNativeEncoder();owned.append(encoder);return encoder})
        func begin(_ id:String) throws {try pending.command(["type":"native_video","id":id,"enabled":true,"fps":30,"bitrateKbps":2500])}
        try begin(UUID().uuidString.lowercased());pending.offer(image,captured:0)
        let waiting=UUID().uuidString.lowercased();try begin(waiting)
        try check(pending.current==nil && owned.count==1,"native replacement holds physical slot")
        if reason=="cancel" {try pending.command(["type":"native_video","id":waiting,"enabled":false])}
        else if reason=="expiry" {clock=2001}
        else {permitted=false}
        owned[0].retire?();try check(spin({pending.quiescent}),"native replacement old encoder drains")
        pending.tick();pending.offer(image,captured:clock)
        try check(pending.current==nil && owned.count==1,"native replacement cancellation never resurrects source")
    }

    var rateClock:Double=0,rateEncoders=[GeneratedNativeEncoder]()
    let rate=NativeVideoController(gate:NSRecursiveLock(),active:{true},now:{rateClock},emit:{_,_ in},cadence:true,factory:{_ in let encoder=GeneratedNativeEncoder();rateEncoders.append(encoder);return encoder})
    let rateID=UUID().uuidString.lowercased()
    try rate.command(["type":"native_video","id":rateID,"enabled":true,"fps":30,"bitrateKbps":2500])
    try rate.command(["type":"native_rate","id":rateID,"fps":10,"kbps":1200])
    try check(rate.current?.fps==10 && rate.current?.kbps==1200,"native rate obeys original limits")
    rate.offer(image,captured:rateClock);try check(rateEncoders.count==1 && rateEncoders[0].rates==[1200],"native rate delivered to owned encoder")
    rateEncoders[0].completions[0](.success(packet));try check(spin({rate.inflight==nil}),"native rate frame completes")
    rateClock=34;rate.offer(image,captured:rateClock);try check(rateEncoders[0].completions.count==1,"native rate reduces capture cadence")
    for fields in [["fps":31,"kbps":2500],["fps":30,"kbps":2501]] {
        var rejected=false;do {try rate.command(["type":"native_rate","id":rateID,"fps":fields["fps"]!,"kbps":fields["kbps"]!])} catch {rejected=true}
        try check(rejected && rate.current?.fps==10,"native rate cannot exceed original ceiling")
    }
    try rate.command(["type":"native_rate","id":rateID,"fps":30,"kbps":2500])
    try check(rate.current?.fps==30 && rate.current?.kbps==2500 && rate.current?.seq==1,"native rate recovers within same stream sequence")
    rate.stop(notify:false);rateEncoders[0].retire?();try check(spin({rate.quiescent}),"native rate owned encoder retired")

    var codecEncoders=[GeneratedNativeEncoder](),codecOutput=[[String:Any]]()
    let negotiatedCodec=NativeVideoController(gate:NSRecursiveLock(),active:{true},now:{0},emit:{value,_ in codecOutput.append(value)},codecs:true,factory:{settings in
        guard settings.family=="hevc" else {throw NativeError("unsupported")};let encoder=GeneratedNativeEncoder();codecEncoders.append(encoder);return encoder
    })
    let codecID=UUID().uuidString.lowercased()
    try negotiatedCodec.command(["type":"native_video","id":codecID,"enabled":true,"fps":30,"bitrateKbps":2500,"codec":"hevc"])
    negotiatedCodec.offer(image,captured:0)
    try check(codecEncoders.count==1,"generated negotiated HEVC owns one encoder")
    codecEncoders[0].completions[0](.success(NativeH264Packet(data:Data([0,0,0,1,0x26,1,0x80]),key:true,codec:generatedHEVCCodec,width:64,height:64)))
    try check(spin({negotiatedCodec.inflight==nil}),"generated HEVC completion")
    try check(codecOutput.contains(where:{$0["type"] as? String=="native_frame" && $0["codecName"] as? String=="hevc" && $0["codec"] as? String==generatedHEVCCodec}),"generated HEVC metadata requires negotiated family")
    negotiatedCodec.stop(notify:false);codecEncoders[0].retire?();try check(spin({negotiatedCodec.quiescent}),"generated HEVC encoder retired")

    for invalid in [true,12,["codec":"hevc"]] as [Any] {
        var rejected=false
        do {try negotiatedCodec.command(["type":"native_video","id":UUID().uuidString.lowercased(),"enabled":true,"fps":30,"bitrateKbps":2500,"codec":invalid])} catch {rejected=true}
        try check(rejected,"native codec rejects non-string format")
    }
    var profileClock:Double=0,profileEncoders=[GeneratedNativeEncoder](),profileSettings=[NativeEncoderSettings](),profileOutput=[[String:Any]]()
    let profileController=NativeVideoController(gate:NSRecursiveLock(),active:{true},now:{profileClock},emit:{value,_ in profileOutput.append(value)},adaptive:true,factory:{settings in
        let encoder=GeneratedNativeEncoder();profileEncoders.append(encoder);profileSettings.append(settings);return encoder
    })
    let profileID=UUID().uuidString.lowercased()
    try profileController.command(["type":"native_video","id":profileID,"enabled":true,"fps":30,"bitrateKbps":2500])
    profileController.offer(image,captured:0);profileEncoders[0].completions[0](.success(packet));try check(spin({profileController.inflight==nil}),"generated profile initial completion")
    try profileController.command(["type":"native_profile","id":profileID,"generation":2,"width":32,"height":32,"fps":15,"bitrateKbps":1200])
    profileClock=34;profileController.offer(image,captured:34);try check(profileEncoders[0].retire==nil,"profile waits for draw ACK before encoder retirement")
    try profileController.command(["type":"native_video_ack","id":profileID,"seq":1]);profileController.offer(image,captured:34)
    try check(profileEncoders.count==1 && profileEncoders[0].retire != nil,"profile retires old physical encoder before replacement")
    profileEncoders[0].retire?();try check(spin({profileController.quiescent}),"profile physical encoder retirement completes")
    profileController.offer(image,captured:34);try check(profileEncoders.count==2 && profileSettings[1].size?.0==32 && profileSettings[1].size?.1==32,"profile creates one encoder for explicit target")
    let scaledPacket=NativeH264Packet(data:packet.data,key:true,codec:packet.codec.lowercased(),width:32,height:32)
    profileEncoders[1].completions[0](.success(scaledPacket));try check(spin({profileController.inflight==nil}),"profile held completion")
    try check(profileOutput.filter{$0["type"] as? String=="native_frame"}.count==1 && profileController.current?.seq==1,"profile first new key waits for format ACK")
    try check(profileOutput.last?["type"] as? String=="native_profile_applied" && profileOutput.last?["baseSeq"] as? Int==1,"profile announces real format at old sequence")
    var badResume=false;do {try profileController.command(["type":"native_profile_resume","id":profileID,"generation":2,"baseSeq":2])} catch {badResume=true}
    try check(badResume && profileController.current?.seq==1,"profile refuses mismatched format ACK")
    profileClock=100;try profileController.command(["type":"native_profile_resume","id":profileID,"generation":2,"baseSeq":1])
    try check(profileOutput.last?["type"] as? String=="native_frame" && profileOutput.last?["generation"] as? Int==2 && profileOutput.last?["seq"] as? Int==2 && profileOutput.last?["width"] as? Int==32,"profile resume preserves id and sequence into new generation")
    profileController.stop(notify:false);profileEncoders[1].retire?();try check(spin({profileController.quiescent}),"profile replacement retired")

    var fenceClock:Double=0,fenceQuery:(()->Void)?,fenceEncoders=[GeneratedNativeEncoder](),fenceRecords=[[String:Any]]()
    let profileFence=NativeVideoController(gate:NSRecursiveLock(),active:{fenceQuery?();return true},now:{fenceClock},emit:{value,_ in fenceRecords.append(value)},adaptive:true,factory:{_ in let encoder=GeneratedNativeEncoder();fenceEncoders.append(encoder);return encoder})
    let fenceID=UUID().uuidString.lowercased();try profileFence.command(["type":"native_video","id":fenceID,"enabled":true,"fps":30,"bitrateKbps":2500]);profileFence.offer(image,captured:0);fenceEncoders[0].completions[0](.success(packet));try check(spin({profileFence.inflight==nil}),"profile fence initial completion")
    try profileFence.command(["type":"native_video_ack","id":fenceID,"seq":1]);try profileFence.command(["type":"native_profile","id":fenceID,"generation":2,"width":32,"height":32,"fps":15,"bitrateKbps":1200]);fenceClock=34;profileFence.offer(image,captured:34);fenceEncoders[0].retire?();try check(spin({profileFence.quiescent}),"profile fence old encoder retired")
    fenceClock=2500;profileFence.offer(image,captured:fenceClock);fenceEncoders[1].completions[0](.success(scaledPacket));try check(spin({profileFence.inflight==nil}),"profile fence held completion")
    fenceClock=2990;var fenceQueries=0;fenceQuery={fenceQueries+=1;if fenceQueries==2 {fenceClock=3001}}
    try profileFence.command(["type":"native_profile_resume","id":fenceID,"generation":2,"baseSeq":1])
    try check(profileFence.current==nil && fenceRecords.filter{$0["type"] as? String=="native_frame"}.count==1,"profile publication cannot extend original deadline")
    fenceEncoders[1].retire?();try check(spin({profileFence.quiescent}),"profile fence encoder retired")

    var profileQuery:(()->Void)?,reentryEncoders=[GeneratedNativeEncoder]()
    let reentrantProfile=NativeVideoController(gate:NSRecursiveLock(),active:{profileQuery?();return true},now:{34},emit:{_,_ in},adaptive:true,factory:{_ in let encoder=GeneratedNativeEncoder();reentryEncoders.append(encoder);return encoder})
    let reentryID=UUID().uuidString.lowercased();try reentrantProfile.command(["type":"native_video","id":reentryID,"enabled":true,"fps":30,"bitrateKbps":2500]);reentrantProfile.offer(image,captured:34);reentryEncoders[0].completions[0](.success(packet));try check(spin({reentrantProfile.inflight==nil}),"profile reentry initial completion")
    try reentrantProfile.command(["type":"native_video_ack","id":reentryID,"seq":1])
    profileQuery={profileQuery=nil;try? reentrantProfile.command(["type":"native_profile","id":reentryID,"generation":2,"width":16,"height":16,"fps":15,"bitrateKbps":1200])}
    try reentrantProfile.command(["type":"native_profile","id":reentryID,"generation":2,"width":32,"height":32,"fps":15,"bitrateKbps":1200])
    try check(reentrantProfile.current?.profile?.width==16,"profile scope query cannot overwrite a newer same-stream profile")
    reentrantProfile.stop(notify:false);reentryEncoders[0].retire?();try check(spin({reentrantProfile.quiescent}),"profile reentry encoder retired")

    for reason in ["timeout","source"] {
        var clock:Double=0,permitted=true,owned=[GeneratedNativeEncoder](),records=[[String:Any]]()
        let transaction=NativeVideoController(gate:NSRecursiveLock(),active:{permitted},now:{clock},emit:{value,_ in records.append(value)},adaptive:true,factory:{_ in let encoder=GeneratedNativeEncoder();owned.append(encoder);return encoder})
        let id=UUID().uuidString.lowercased();try transaction.command(["type":"native_video","id":id,"enabled":true,"fps":30,"bitrateKbps":2500]);transaction.offer(image,captured:0);owned[0].completions[0](.success(packet));try check(spin({transaction.inflight==nil}),"profile cancellation initial frame")
        try transaction.command(["type":"native_video_ack","id":id,"seq":1]);try transaction.command(["type":"native_profile","id":id,"generation":2,"width":32,"height":32,"fps":15,"bitrateKbps":1200])
        clock=34;transaction.offer(image,captured:clock);owned[0].retire?();try check(spin({transaction.quiescent}),"profile cancellation old retirement");transaction.offer(image,captured:clock);owned[1].completions[0](.success(scaledPacket));try check(spin({transaction.inflight==nil}),"profile cancellation held frame")
        let waiting=transaction.current?.profile
        if reason=="timeout" {clock=1035}else{permitted=false}
        transaction.tick();try check(transaction.current==nil && waiting?.held==nil && records.filter{$0["type"] as? String=="native_frame"}.count==1,"profile expiry or source loss discards held key")
        owned[1].retire?();try check(spin({transaction.quiescent}),"profile cancelled encoder retires")
    }

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
    let updatedBox=GeneratedNativePacketBox(),updated=DispatchSemaphore(value:0)
    encoder.rate(1200,valid:{true})
    encoder.encode(image,timestamp:33334,key:true,valid:{true}) {updatedBox.put($0);updated.signal()}
    try check(updated.wait(timeout:.now()+5) == .success,"generated VideoToolbox live bitrate update deadline")
    guard let updatedResult=updatedBox.get() else {throw GeneratedFailure(detail:"generated VideoToolbox rate output")}
    let updatedPacket=try updatedResult.get()
    try check(updatedPacket.key && updatedPacket.width==64 && updatedPacket.height==64,"generated VideoToolbox rate keeps source dimensions")
    let retired=DispatchSemaphore(value:0);encoder.stop {retired.signal()}
    try check(retired.wait(timeout:.now()+5) == .success,"generated VideoToolbox encoder retirement")
    guard completed,let result=box.get() else {throw GeneratedFailure(detail:"generated VideoToolbox encode deadline")}
    let actual=try result.get()
    try check(actual.key && actual.width==64 && actual.height==64 && actual.codec.hasPrefix("avc1.") && actual.data.count>20 && actual.data.count<512*1024,"generated VideoToolbox H264 output")
    var rateFailures=0
    let initialBox=GeneratedNativePacketBox(),failingEncoder=ToolboxH264Encoder(fps:30,kbps:2500,hardware:false,setRate:{_,_ in rateFailures+=1;return OSStatus(-1)}),initial=DispatchSemaphore(value:0),failed=DispatchSemaphore(value:0),failedBox=GeneratedNativePacketBox()
    failingEncoder.encode(image,timestamp:1,key:true,valid:{true}) {initialBox.put($0);initial.signal()}
    try check(initial.wait(timeout:.now()+5) == .success,"generated rate failure encoder initialized")
    guard let initialResult=initialBox.get() else {throw GeneratedFailure(detail:"generated rate initial result")}
    _=try initialResult.get()
    failingEncoder.rate(1200,valid:{true})
    failingEncoder.encode(image,timestamp:33334,key:true,valid:{true}) {failedBox.put($0);failed.signal()}
    try check(failed.wait(timeout:.now()+5) == .success,"generated rate failure completion")
    try check(rateFailures==1,"generated rate setter failure was exercised")
    guard let failedResult=failedBox.get() else {throw GeneratedFailure(detail:"generated rate failure missing completion")}
    switch failedResult {case .success:throw GeneratedFailure(detail:"generated rate failure must not publish frame");case .failure:try check(true,"generated rate failure publishes no frame")}
    let failedRetired=DispatchSemaphore(value:0);failingEncoder.stop {failedRetired.signal()}
    try check(failedRetired.wait(timeout:.now()+5) == .success,"generated rate failure retires owned encoder")
    let resizedEncoder=ToolboxH264Encoder(fps:15,kbps:1200,hardware:false,target:(32,32)),resizedBox=GeneratedNativePacketBox(),resizedDone=DispatchSemaphore(value:0)
    resizedEncoder.encode(image,timestamp:1,key:true,valid:{true}) {resizedBox.put($0);resizedDone.signal()}
    let resizedCompleted=resizedDone.wait(timeout:.now()+5) == .success
    let resizedRetired=DispatchSemaphore(value:0);resizedEncoder.stop {resizedRetired.signal()}
    try check(resizedRetired.wait(timeout:.now()+5) == .success,"generated resized encoder retirement")
    guard resizedCompleted,let resizedResult=resizedBox.get() else {throw GeneratedFailure(detail:"generated resized encode deadline")}
    let resizedPacket=try resizedResult.get();try check(resizedPacket.width==32 && resizedPacket.height==32 && resizedPacket.key,"generated actual resized packet")
    let resizedPixels=try generatedNativeDecode(resizedPacket.data,size:32)
    for index in 0..<4 {for channel in 0..<3 {try check(abs(Int(resizedPixels[index][channel])-Int(colors[index][channel]))<40,"generated resized decoded color order")}}
    try check(actual.codec==actual.codec.lowercased(),"generated VideoToolbox canonical codec spelling")
    let decoded=try generatedNativeDecode(actual.data)
    try check(decoded.count==4,"generated VideoToolbox decoded pixels")
    for index in 0..<4 {for channel in 0..<3 {try check(abs(Int(decoded[index][channel])-Int(colors[index][channel]))<40,"generated VideoToolbox orientation and color order")}}
    if ToolboxH264Encoder.hardwareHEVCAvailable() {
        let hevcEncoder=ToolboxH264Encoder(fps:30,kbps:2500,family:"hevc"),hevcBox=GeneratedNativePacketBox(),hevcDone=DispatchSemaphore(value:0)
        hevcEncoder.encode(image,timestamp:1,key:true,valid:{true}) {hevcBox.put($0);hevcDone.signal()}
        let hevcCompleted=hevcDone.wait(timeout:.now()+5) == .success
        let hevcRetired=DispatchSemaphore(value:0);hevcEncoder.stop {hevcRetired.signal()}
        try check(hevcRetired.wait(timeout:.now()+5) == .success,"generated HEVC encoder retirement")
        guard hevcCompleted,let hevcResult=hevcBox.get() else {throw GeneratedFailure(detail:"generated HEVC encode deadline")}
        let hevcPacket=try hevcResult.get()
        try check(hevcPacket.key && hevcPacket.codec.hasPrefix("hev1.") && hevcPacket.width==64 && hevcPacket.height==64,"generated actual VT HEVC parameter extraction")
        let hevcPixels=try generatedNativeDecode(hevcPacket.data,hevc:true)
        print("generated HEVC encode and software decode completed")
        for index in 0..<4 {for channel in 0..<3 {try check(abs(Int(hevcPixels[index][channel])-Int(colors[index][channel]))<40,"generated HEVC decoded color order")}}
    } else {print("generated HEVC hardware encode unavailable; SPS/controller checks completed")}
    return count
}

/** Test-only software decoder for the generated Annex B record, no OS source. */
func generatedNativeDecode(_ data:Data,hevc:Bool=false,size:Int=64) throws -> [[UInt8]] {
    let bytes=Array(data);var units=[Data](),start=0,index=4
    guard bytes.count>4,Array(bytes.prefix(4))==[0,0,0,1] else {throw GeneratedFailure(detail:"generated H264 Annex B")}
    while index+4<=bytes.count {
        if bytes[index]==0 && bytes[index+1]==0 && bytes[index+2]==0 && bytes[index+3]==1 {units.append(Data(bytes[start+4..<index]));start=index;index+=4}
        else {index+=1}
    }
    units.append(Data(bytes[start+4..<bytes.count]))
    let parameterKinds=hevc ? Set([32,33,34]):Set([7,8])
    func kind(_ unit:Data)->Int {guard let first=unit.first else {return -1};return hevc ? Int((first>>1)&63):Int(first&31)}
    guard let sps=units.first(where:{kind($0)==(hevc ? 33:7)}),let pps=units.first(where:{kind($0)==(hevc ? 34:8)}) else {throw GeneratedFailure(detail:"generated codec parameter sets")}
    var format:CMFormatDescription?
    let formatStatus:OSStatus
    if hevc {
        guard let vps=units.first(where:{kind($0)==32}) else {throw GeneratedFailure(detail:"generated HEVC VPS")}
        formatStatus=vps.withUnsafeBytes {v in sps.withUnsafeBytes {s in pps.withUnsafeBytes {p in
            CMVideoFormatDescriptionCreateFromHEVCParameterSets(allocator:kCFAllocatorDefault,parameterSetCount:3,parameterSetPointers:[v.bindMemory(to:UInt8.self).baseAddress!,s.bindMemory(to:UInt8.self).baseAddress!,p.bindMemory(to:UInt8.self).baseAddress!],parameterSetSizes:[vps.count,sps.count,pps.count],nalUnitHeaderLength:4,extensions:nil,formatDescriptionOut:&format)
        }}}
    } else {
        formatStatus=sps.withUnsafeBytes {s in pps.withUnsafeBytes {p in
            CMVideoFormatDescriptionCreateFromH264ParameterSets(allocator:kCFAllocatorDefault,parameterSetCount:2,parameterSetPointers:[s.bindMemory(to:UInt8.self).baseAddress!,p.bindMemory(to:UInt8.self).baseAddress!],parameterSetSizes:[sps.count,pps.count],nalUnitHeaderLength:4,formatDescriptionOut:&format)
        }}
    }
    guard formatStatus==noErr,let description=format else {throw GeneratedFailure(detail:"generated codec format")}
    var avc=Data()
    for unit in units where !parameterKinds.contains(kind(unit)) {
        var size=UInt32(unit.count).bigEndian;withUnsafeBytes(of:&size) {avc.append(contentsOf:$0)};avc.append(unit)
    }
    var createdBlock:CMBlockBuffer?
    guard CMBlockBufferCreateWithMemoryBlock(allocator:kCFAllocatorDefault,memoryBlock:nil,blockLength:avc.count,blockAllocator:kCFAllocatorDefault,customBlockSource:nil,offsetToData:0,dataLength:avc.count,flags:0,blockBufferOut:&createdBlock)==noErr,let block=createdBlock else {throw GeneratedFailure(detail:"generated decode block")}
    let copied=avc.withUnsafeBytes {CMBlockBufferReplaceDataBytes(with:$0.baseAddress!,blockBuffer:block,offsetIntoDestination:0,dataLength:avc.count)}
    guard copied==noErr else {throw GeneratedFailure(detail:"generated decode bytes")}
    var timing=CMSampleTimingInfo(duration:CMTime(value:1,timescale:30),presentationTimeStamp:CMTime(value:1,timescale:1000000),decodeTimeStamp:.invalid),sampleSize=avc.count,sample:CMSampleBuffer?
    guard CMSampleBufferCreateReady(allocator:kCFAllocatorDefault,dataBuffer:block,formatDescription:description,sampleCount:1,sampleTimingEntryCount:1,sampleTimingArray:&timing,sampleSizeEntryCount:1,sampleSizeArray:&sampleSize,sampleBufferOut:&sample)==noErr,let frame=sample else {throw GeneratedFailure(detail:"generated decode sample")}
    var created:VTDecompressionSession?
    let spec=[kVTVideoDecoderSpecification_EnableHardwareAcceleratedVideoDecoder:false] as CFDictionary,attributes=[kCVPixelBufferPixelFormatTypeKey:kCVPixelFormatType_32BGRA] as CFDictionary
    guard VTDecompressionSessionCreate(allocator:kCFAllocatorDefault,formatDescription:description,decoderSpecification:spec,imageBufferAttributes:attributes,outputCallback:nil,decompressionSessionOut:&created)==noErr,let decoder=created else {throw GeneratedFailure(detail:"generated software decoder")}
    defer {VTDecompressionSessionInvalidate(decoder)}
    var result=[[UInt8]]()
    // Empty flags require the callback to complete before DecodeFrame returns.
    let status=VTDecompressionSessionDecodeFrame(decoder,sampleBuffer:frame,flags:[],infoFlagsOut:nil) {status,_,image,_,_ in
        guard status==noErr,let image=image,CVPixelBufferGetWidth(image)==size,CVPixelBufferGetHeight(image)==size,CVPixelBufferGetPixelFormatType(image)==kCVPixelFormatType_32BGRA,CVPixelBufferLockBaseAddress(image,.readOnly)==kCVReturnSuccess else {return}
        defer {CVPixelBufferUnlockBaseAddress(image,.readOnly)}
        guard let base=CVPixelBufferGetBaseAddress(image)?.assumingMemoryBound(to:UInt8.self) else {return}
        let stride=CVPixelBufferGetBytesPerRow(image)
        for (x,y) in [(size/8,size/8),(size*3/4,size/8),(size/8,size*3/4),(size*3/4,size*3/4)] {let offset=y*stride+x*4;result.append([base[offset+2],base[offset+1],base[offset]])}
    }
    guard status==noErr,result.count==4 else {throw GeneratedFailure(detail:"generated software decode")}
    return result
}

struct NativeEncoderSettings {
    let fps:Int,kbps:Int,family:String,size:(Int,Int)?
}
final class NativeVideoProfile {
    let generation:Int,width:Int,height:Int,fps:Int,kbps:Int,at:Double
    var phase="draining",held:NativeH264Packet?,captured:Double=0,baseSeq=0
    init(generation:Int,width:Int,height:Int,fps:Int,kbps:Int,at:Double) {self.generation=generation;self.width=width;self.height=height;self.fps=fps;self.kbps=kbps;self.at=at}
    func clear() {held=nil}
}
final class NativeVideoStream {
    let id:String,window:Int,maxFPS:Int,maxKbps:Int,family:String
    var fps:Int,kbps:Int
    var dead=false,seq=0,timestamp:Int64 = -1,key=true,next:Double=0,codec:String?,width:Int?,height:Int?
    var pending=[(seq:Int,at:Double)]()
    var generation=1,maximum:(Int,Int)?,profile:NativeVideoProfile?
    init(id:String,fps:Int,kbps:Int,window:Int,family:String="h264") { self.id=id;self.fps=fps;self.kbps=kbps;self.window=window;self.maxFPS=fps;self.maxKbps=kbps;self.family=family }
}
final class NativeVideoJob {
    let stream:NativeVideoStream,captured:Double,key:Bool,profile:NativeVideoProfile?
    init(_ stream:NativeVideoStream,_ captured:Double,_ key:Bool,profile:NativeVideoProfile?=nil) { self.stream=stream;self.captured=captured;self.key=key;self.profile=profile }
}
/** Source.gate serializes kernel, callback admission and final publication. */
final class NativeVideoController {
    let gate:NSRecursiveLock,active:()->Bool,now:()->Double,emit:([String:Any],(() -> Bool)?) throws -> Void
    let factory:(NativeEncoderSettings)throws->NativeH264Encoder
    private(set) var current:NativeVideoStream?,inflight:NativeVideoJob?
    private var encoder:NativeH264Encoder?,retiring=false,seen=Set<String>(),revision=UUID()
    private var pendingStart:(stream:NativeVideoStream,at:Double)?
    let cadence:Bool,codecs:Bool,adaptive:Bool
    init(gate:NSRecursiveLock,active:@escaping()->Bool,now:@escaping()->Double=milliseconds,emit:@escaping([String:Any],(() -> Bool)?)throws->Void,cadence:Bool=false,codecs:Bool=false,adaptive:Bool=false,factory:@escaping(NativeEncoderSettings)throws->NativeH264Encoder={ToolboxH264Encoder(fps:$0.fps,kbps:$0.kbps,family:$0.family,target:$0.size)}) {
        self.gate=gate;self.active=active;self.now=now;self.emit=emit;self.factory=factory;self.cadence=cadence;self.codecs=codecs;self.adaptive=adaptive
    }
    func locked<T>(_ action:()throws->T) rethrows -> T { gate.lock();defer {gate.unlock()};return try action() }
    func live(_ stream:NativeVideoStream,captured:Double?=nil) -> Bool {
        let granted=active(),time=now();let profile=stream.profile
        return granted && current===stream && !stream.dead && (captured==nil || (time>=captured! && time<=captured!+1000)) && (stream.pending.first==nil || (time>=stream.pending[0].at && time<=stream.pending[0].at+2000)) && (profile==nil || (time>=profile!.at && time<profile!.at+3000 && (profile!.held==nil || (time>=profile!.captured && time<=profile!.captured+1000))))
    }
    func stop(_ expected:NativeVideoStream?=nil,notify:Bool=true) {
        locked {
            if let expected=expected,current !== expected { return };revision=UUID()
            if let waiting=pendingStart {pendingStart=nil;waiting.stream.dead=true;if notify {try? emit(["type":"native_video_stopped","id":waiting.stream.id],nil)}}
            if let stream=current { current=nil;stream.dead=true;stream.pending.removeAll();stream.profile?.clear();stream.profile=nil;if notify {try? emit(["type":"native_video_stopped","id":stream.id],nil)} }
            retireEncoder()
        }
    }
    private func retireEncoder() {
        guard let old=encoder,!retiring else {return};retiring=true
        old.stop { [weak self] in DispatchQueue.main.async {
            guard let self=self else {return};self.locked {if self.encoder===old {self.encoder=nil;self.retiring=false;self.inflight=nil};self.activatePending()}
        }}
    }
    /** One bounded explicit replacement; never create a second physical encoder. */
    private func activatePending() {
        guard let waiting=pendingStart else {return}
        let permitted=active(),time=now()
        guard pendingStart?.stream === waiting.stream else {return}
        guard permitted,time>=waiting.at,time<=waiting.at+2000 else {
            pendingStart=nil;waiting.stream.dead=true;try? emit(["type":"native_video_stopped","id":waiting.stream.id],nil);return
        }
        guard quiescent else {return}
        pendingStart=nil;current=waiting.stream
    }
    func command(_ value:[String:Any]) throws {
        try locked {
            guard let kind=value["type"] as? String,let rawID=value["id"] as? String,rawID.count==36,let uuid=UUID(uuidString:rawID) else { throw NativeError("backend_failure") }
            let id=uuid.uuidString.lowercased()
            if kind=="native_video" {
                guard Set(value.keys).isSubset(of:["type","id","enabled","fps","bitrateKbps","window","codec"]),let enabled=boolean(value["enabled"]) else { throw NativeError("backend_failure") }
                if !enabled {if current?.id==id || pendingStart?.stream.id==id {stop(notify:false)};return}
                guard let fps=integer(value["fps"],1,60),let kbps=integer(value["bitrateKbps"],128,50000),let window=integer(value["window"] ?? 1,1,3),[1,3].contains(window),(value["codec"]==nil || (value["codec"] is String && (codecs ? ["h264","h264-444","hevc","av1"]:["h264"]).contains(value["codec"] as? String ?? ""))),!seen.contains(id),seen.count<1024,current?.id != id else { throw NativeError("unsupported") }
                stop();let started=revision,granted=active()
                guard started==revision else {return}
                guard granted else {try emit(["type":"native_video_stopped","id":id],nil);return}
                seen.insert(id);let stream=NativeVideoStream(id:id,fps:Int(fps),kbps:Int(kbps),window:Int(window),family:value["codec"] as? String ?? "h264");revision=UUID()
                if quiescent {current=stream} else {pendingStart=(stream,now())};return
            }
            guard let stream=current,stream.id==id else {return}
            if kind=="native_profile" {
                guard adaptive,Set(value.keys)==Set(["type","id","generation","width","height","fps","bitrateKbps"]),stream.profile==nil,let maximum=stream.maximum,
                      let generation=integer(value["generation"],2,0xffffffff),Int(generation)==stream.generation+1,
                      let width=integer(value["width"],2,Int64(maximum.0)),let height=integer(value["height"],2,Int64(maximum.1)),width%2==0,height%2==0,
                      abs(Double(width)/Double(height)-Double(maximum.0)/Double(maximum.1))<=0.02,
                      let fps=integer(value["fps"],1,Int64(stream.maxFPS)),let kbps=integer(value["bitrateKbps"],128,Int64(stream.maxKbps)) else {throw NativeError("unsupported")}
                let started=revision
                guard live(stream) else {stop(stream);return}
                guard revision==started,stream.profile==nil else {return};revision=UUID()
                stream.profile=NativeVideoProfile(generation:Int(generation),width:Int(width),height:Int(height),fps:Int(fps),kbps:Int(kbps),at:now());return
            }
            if kind=="native_profile_resume" {
                guard adaptive,Set(value.keys)==Set(["type","id","generation","baseSeq"]),let profile=stream.profile,profile.phase=="waiting",
                      let generation=integer(value["generation"],2,0xffffffff),Int(generation)==profile.generation,
                      let base=integer(value["baseSeq"],1,0xffffffff),Int(base)==profile.baseSeq,profile.baseSeq==stream.seq,stream.pending.isEmpty,
                      let packet=profile.held else {throw NativeError("backend_failure")}
                guard live(stream,captured:profile.captured),stream.profile===profile else {if current===stream {stop(stream)};return}
                revision=UUID();profile.held=nil;stream.profile=nil;stream.generation=profile.generation;stream.codec=nil;stream.width=nil;stream.height=nil;stream.fps=profile.fps;stream.kbps=profile.kbps;stream.next=now()
                do {try publish(stream,captured:profile.captured,key:true,packet:packet,deadline:profile.at+3000)} catch {stop(stream)};return
            }
            if kind=="native_rate" || kind=="native_bitrate" {
                guard kind != "native_rate" || cadence else {throw NativeError("unsupported")}
                let keys:Set<String>=kind=="native_rate" ? ["type","id","fps","kbps"]:["type","id","kbps"]
                guard Set(value.keys)==keys,let fps=integer(value["fps"] ?? stream.fps,1,Int64(stream.maxFPS)),let kbps=integer(value["kbps"],128,Int64(stream.maxKbps)) else {throw NativeError("unsupported")}
                guard live(stream) else {stop(stream);return}
                if stream.profile==nil {stream.fps=Int(fps);stream.kbps=Int(kbps)};return
            }
            if kind=="native_keyframe" {stream.key=true;return}
            guard kind=="native_video_ack",Set(value.keys).isSubset(of:["type","id","seq"]),let seq=integer(value["seq"],1,0xffffffff) else {throw NativeError("backend_failure")}
            guard live(stream) else {stop(stream);return}
            guard stream.pending.first?.seq==Int(seq) else {throw NativeError("backend_failure")};stream.pending.removeFirst()
        }
    }
    func tick() {
        locked { activatePending();guard let stream=current else {return};if !live(stream) || (inflight != nil && now()-inflight!.captured>1000) {stop(stream)} }
    }
    var quiescent:Bool {locked {encoder==nil && !retiring && inflight==nil}}
    var captureFPS:Int { locked {current?.fps ?? 0} }
    func offer(_ image:CGImage,captured:Double) {
        locked {
            guard let stream=current else {return}
            guard captured.isFinite,captured>=0,captured<=safeInteger/1000,live(stream,captured:captured) else {stop(stream);return}
            guard inflight==nil,!retiring,stream.pending.count<stream.window,captured>=stream.next else {return}
            let profile=stream.profile
            if let profile=profile {
                guard profile.phase=="draining",stream.pending.isEmpty else {return}
                if encoder != nil {retireEncoder();return}
                profile.phase="encoding"
            }
            let job=NativeVideoJob(stream,captured,profile != nil || stream.key,profile:profile);inflight=job;stream.key=false;stream.next=captured+1000/Double(profile?.fps ?? stream.fps)
            do {
                if encoder==nil {encoder=try factory(NativeEncoderSettings(fps:profile?.fps ?? stream.fps,kbps:profile?.kbps ?? stream.kbps,family:stream.family,size:profile.map{($0.width,$0.height)} ?? (stream.width != nil && stream.height != nil ? (stream.width!,stream.height!):nil)))}
                guard current===stream,!retiring,let encoder=encoder else {throw NativeError("source_changed")}
                encoder.rate(profile?.kbps ?? stream.kbps,valid:{ [weak self] in
                    guard let self=self else {return false};return self.locked {self.inflight===job && self.current===stream && !stream.dead && (job.profile==nil || stream.profile===job.profile) && self.now()>=job.captured && self.now()<=job.captured+1000}
                })
                encoder.encode(image,timestamp:Int64(captured*1000),key:job.key,valid:{ [weak self] in
                    guard let self=self else {return false};return self.locked {self.inflight===job && self.current===stream && !stream.dead && (job.profile==nil || stream.profile===job.profile) && self.now()>=job.captured && self.now()<=job.captured+1000}
                },completion:{ [weak self] result in DispatchQueue.main.async {self?.complete(job,result)} })
            } catch {if encoder==nil {inflight=nil};stop(stream)}
        }
    }
    func complete(_ job:NativeVideoJob,_ result:Result<NativeH264Packet,Error>) {
        locked {
            guard inflight===job else {return};inflight=nil
            let stream=job.stream;guard current===stream else {activatePending();return}
            do {
                let packet=try result.get()
                if let profile=job.profile {
                    guard stream.profile===profile,profile.phase=="encoding",stream.pending.isEmpty,live(stream,captured:job.captured),packet.key,
                          packet.width==profile.width,packet.height==profile.height,packet.data.count>0,packet.data.count<=512*1024-9,
                          packet.codec.lowercased().hasPrefix(stream.family=="hevc" ? "hev1.":stream.family=="av1" ? "av01.":stream.family=="h264-444" ? "avc1.f4":"avc1.") else {throw NativeError("backend_failure")}
                    profile.phase="waiting";profile.held=packet;profile.captured=job.captured;profile.baseSeq=stream.seq
                    try emit(["type":"native_profile_applied","id":stream.id,"generation":profile.generation,"baseSeq":stream.seq,"width":packet.width,"height":packet.height,"codec":packet.codec],{ [weak self] in
                        guard let self=self else {return false};return self.locked {let permitted=self.live(stream,captured:job.captured);return permitted && self.current===stream && stream.profile===profile && profile.phase=="waiting"}
                    });return
                }
                try publish(stream,captured:job.captured,key:job.key,packet:packet)
            } catch {stop(stream)}
        }
    }
    private func publish(_ stream:NativeVideoStream,captured:Double,key:Bool,packet:NativeH264Packet,deadline:Double?=nil) throws {
                guard packet.codec.lowercased().hasPrefix(stream.family=="hevc" ? "hev1.":stream.family=="av1" ? "av01.":stream.family=="h264-444" ? "avc1.f4":"avc1.") else {throw NativeError("backend_failure")}
                guard live(stream,captured:captured),(deadline==nil || now()<deadline!),packet.data.count<=512*1024-9,packet.data.count>0,packet.width>=2,packet.width<=1920,packet.height>=2,packet.height<=2400,packet.width%2==0,packet.height%2==0,!key || packet.key,stream.seq<0xffffffff,(stream.codec==nil || stream.codec==packet.codec),(stream.width==nil || stream.width==packet.width && stream.height==packet.height) else {throw NativeError("backend_failure")}
                let timestamp=Int64(captured*1000);guard timestamp>stream.timestamp else {throw NativeError("backend_failure")}
                if stream.maximum==nil {stream.maximum=(packet.width,packet.height)}
                stream.codec=packet.codec;stream.width=packet.width;stream.height=packet.height;stream.timestamp=timestamp;stream.seq+=1;stream.pending.append((stream.seq,now()))
                var record:[String:Any]=["type":"native_frame","id":stream.id,"seq":stream.seq,"timestamp":timestamp,"key":packet.key,"codec":packet.codec,"width":packet.width,"height":packet.height,"captureMs":0,"conversionMs":0,"encodeMs":max(0,now()-captured),"data":packet.data.base64EncodedString()]
                if codecs {record["codecName"]=stream.family}
                if adaptive {record["generation"]=stream.generation}
                try emit(record,{ [weak self] in
                    guard let self=self else {return false};return self.locked {if self.live(stream,captured:captured) && (deadline==nil || self.now()<deadline!) {return true};self.stop(stream);return false}
                })
    }
}
