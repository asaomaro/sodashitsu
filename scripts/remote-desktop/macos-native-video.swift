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
                    context.draw(image,in:CGRect(x:0,y:0,width:width,height:height))
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
    private var encoder:NativeH264Encoder?,retiring=false,retired=[String](),revision=UUID()
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
            if let stream=current { current=nil;stream.dead=true;stream.pending.removeAll();retired.append(stream.id);if retired.count>32 {retired.removeFirst()};if notify {try? emit(["type":"native_video_stopped","id":stream.id],nil)} }
            guard let old=encoder,!retiring else {return};retiring=true
            old.stop { [weak self] in DispatchQueue.main.async {
                guard let self=self else {return};self.locked { if self.encoder===old {self.encoder=nil;self.retiring=false;self.inflight=nil} }
            } }
        }
    }
    func command(_ value:[String:Any]) throws {
        try locked {
            guard let kind=value["type"] as? String,let id=value["id"] as? String,id.count==36,UUID(uuidString:id) != nil else { throw NativeError("backend_failure") }
            if kind=="native_video" {
                guard Set(value.keys).isSubset(of:["type","id","enabled","fps","bitrateKbps","window","codec"]),let enabled=boolean(value["enabled"]) else { throw NativeError("backend_failure") }
                if !enabled {if current?.id==id {stop(notify:false)};return}
                guard let fps=integer(value["fps"],1,60),let kbps=integer(value["bitrateKbps"],128,50000),let window=integer(value["window"] ?? 1,1,3),[1,3].contains(window),(value["codec"]==nil || value["codec"] as? String=="h264"),!retired.contains(id),current?.id != id else { throw NativeError("unsupported") }
                stop();let started=revision,granted=active()
                guard started==revision else {return}
                guard granted,!retiring,encoder==nil else {try emit(["type":"native_video_stopped","id":id],nil);return}
                current=NativeVideoStream(id:id,fps:Int(fps),kbps:Int(kbps),window:Int(window));revision=UUID();return
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
