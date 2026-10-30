import Foundation
import CoreMedia
import AudioToolbox

// Pure conversion/framing helpers. No capture, permission or playback on import.
struct NativePCMError: Error { let code: String; init(_ code:String) { self.code=code } }
struct NativePCMFrame { let sequence:UInt32;let timestamp:Int64;let record:Data }
let nativePCMHello=Data([83,68,65,80,1,2,16,0,128,187,0,0,192,3,0,0])

func nativeFloatPCM(_ planes:[Data],frames:Int,planar:Bool) throws -> Data {
    guard frames>0,frames<=4800,planes.count==(planar ? 2:1),
          planes.allSatisfy({$0.count==frames*(planar ? 4:8)}) else { throw NativePCMError("pcm_format") }
    var output=Data(capacity:frames*4)
    for index in 0..<frames {
        for channel in 0..<2 {
            let plane=planar ? channel:0,offset=(planar ? index:index*2+channel)*4
            let bits=planes[plane].withUnsafeBytes { $0.loadUnaligned(fromByteOffset:offset,as:UInt32.self).littleEndian }
            let value=Float(bitPattern:bits)
            let number:Int16
            if !value.isFinite { number=0 }
            else if value>=1 { number=32767 }
            else if value<=(-1) { number = -32768 }
            else { number=Int16((Double(value)*32767).rounded()) }
            var little=number.littleEndian
            withUnsafeBytes(of:&little) { output.append(contentsOf:$0) }
        }
    }
    return output
}

func nativeSamplePCM(_ sample:CMSampleBuffer) throws -> Data {
    let frames=CMSampleBufferGetNumSamples(sample)
    guard CMSampleBufferDataIsReady(sample),frames>0,frames<=4800,
          let description=CMSampleBufferGetFormatDescription(sample),
          let raw=CMAudioFormatDescriptionGetStreamBasicDescription(description) else { throw NativePCMError("pcm_format") }
    let format=raw.pointee,planar=(format.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0
    guard format.mFormatID==kAudioFormatLinearPCM,format.mSampleRate==48000,format.mChannelsPerFrame==2,
          format.mBitsPerChannel==32,(format.mFormatFlags & kAudioFormatFlagIsFloat) != 0,
          (format.mFormatFlags & kAudioFormatFlagIsBigEndian)==0,format.mFramesPerPacket==1,
          format.mBytesPerFrame==(planar ? 4:8) else { throw NativePCMError("pcm_format") }
    let bytes=MemoryLayout<AudioBufferList>.size+MemoryLayout<AudioBuffer>.size
    let storage=UnsafeMutableRawPointer.allocate(byteCount:bytes,alignment:16)
    storage.initializeMemory(as:UInt8.self,repeating:0,count:bytes)
    defer { storage.deallocate() }
    let list=storage.assumingMemoryBound(to:AudioBufferList.self)
    var block:CMBlockBuffer?
    guard CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sample,bufferListSizeNeededOut:nil,
        bufferListOut:list,bufferListSize:bytes,blockBufferAllocator:kCFAllocatorDefault,
        blockBufferMemoryAllocator:kCFAllocatorDefault,flags:0,blockBufferOut:&block)==noErr else { throw NativePCMError("pcm_buffers") }
    return try withExtendedLifetime(block) {
        guard list.pointee.mNumberBuffers==(planar ? 2:1) else { throw NativePCMError("pcm_buffers") }
        let buffers=UnsafeMutableAudioBufferListPointer(list)
        var planes=[Data]()
        for buffer in buffers {
            guard buffer.mNumberChannels==(planar ? 1:2),Int(buffer.mDataByteSize)==frames*(planar ? 4:8),let address=buffer.mData else { throw NativePCMError("pcm_buffers") }
            planes.append(Data(bytes:address,count:Int(buffer.mDataByteSize)))
        }
        return try nativeFloatPCM(planes,frames:frames,planar:planar)
    }
}

final class NativePCMFramer {
    private(set) var pending=Data()
    private var start:Double?,expected:Double?
    private(set) var sequence:UInt32=0
    private var last:Int64=0
    func clear() { pending.resetBytes(in:0..<pending.count);pending.removeAll(keepingCapacity:false);start=nil;expected=nil }
    func push(_ data:Data,captured:Double,now:Double) throws -> [NativePCMFrame] {
        guard !data.isEmpty,data.count<=19200,data.count%4==0,captured.isFinite,now.isFinite,
              captured>=0,captured<=9_000_000_000,captured+Double(data.count)/192000<=now+0.005,now-captured<=0.1 else { clear();throw NativePCMError("pcm_bound") }
        if let previous=expected,abs(captured-previous)>0.002 { clear() }
        if start==nil { start=captured }
        pending.append(data);expected=captured+Double(data.count)/192000
        var frames=[NativePCMFrame]()
        while pending.count>=3840 {
            let timestamp=Int64((start!*1000000).rounded())
            if now-start!<=0.1 && timestamp>last {
                guard sequence<UInt32.max else { clear();throw NativePCMError("pcm_sequence") }
                sequence+=1
                var size=UInt32(3840).littleEndian,seq=sequence.littleEndian,time=UInt64(timestamp).littleEndian
                var record=Data()
                withUnsafeBytes(of:&size) {record.append(contentsOf:$0)}
                withUnsafeBytes(of:&seq) {record.append(contentsOf:$0)}
                withUnsafeBytes(of:&time) {record.append(contentsOf:$0)}
                record.append(pending.prefix(3840));last=timestamp
                frames.append(NativePCMFrame(sequence:sequence,timestamp:timestamp,record:record))
            }
            pending.resetBytes(in:0..<3840);pending.removeSubrange(0..<3840);start! += 0.02
        }
        if pending.isEmpty { start=nil }
        return frames
    }
}

func generatedNativeAudioTests() throws -> Int {
    var checks=0
    func check(_ valid:Bool,_ label:String) throws { guard valid else { throw NativePCMError("generated: "+label) };checks+=1 }
    func floatBytes(_ values:[Float]) -> Data {
        var data=Data()
        for value in values { var bits=value.bitPattern.littleEndian;withUnsafeBytes(of:&bits) {data.append(contentsOf:$0)} }
        return data
    }
    func sample(_ data:Data,planar:Bool,rate:Double=48000,channels:UInt32=2) throws -> CMSampleBuffer {
        let width:UInt32=planar ? 4:channels*4
        var format=AudioStreamBasicDescription(mSampleRate:rate,mFormatID:kAudioFormatLinearPCM,
            mFormatFlags:kAudioFormatFlagIsFloat|kAudioFormatFlagIsPacked|(planar ? kAudioFormatFlagIsNonInterleaved:0),
            mBytesPerPacket:width,mFramesPerPacket:1,mBytesPerFrame:width,mChannelsPerFrame:channels,mBitsPerChannel:32,mReserved:0)
        var createdFormat:CMAudioFormatDescription?
        guard CMAudioFormatDescriptionCreate(allocator:kCFAllocatorDefault,asbd:&format,layoutSize:0,layout:nil,
            magicCookieSize:0,magicCookie:nil,extensions:nil,formatDescriptionOut:&createdFormat)==noErr,let description=createdFormat else { throw NativePCMError("generated_format") }
        var createdBlock:CMBlockBuffer?
        guard CMBlockBufferCreateWithMemoryBlock(allocator:kCFAllocatorDefault,memoryBlock:nil,blockLength:data.count,
            blockAllocator:kCFAllocatorDefault,customBlockSource:nil,offsetToData:0,dataLength:data.count,flags:0,
            blockBufferOut:&createdBlock)==noErr,let block=createdBlock else { throw NativePCMError("generated_block") }
        let copied=data.withUnsafeBytes { CMBlockBufferReplaceDataBytes(with:$0.baseAddress!,blockBuffer:block,offsetIntoDestination:0,dataLength:data.count) }
        guard copied==noErr else { throw NativePCMError("generated_block") }
        var createdSample:CMSampleBuffer?
        guard CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator:kCFAllocatorDefault,dataBuffer:block,
            formatDescription:description,sampleCount:3,presentationTimeStamp:CMTime(value:10000000,timescale:1000000),
            packetDescriptions:nil,sampleBufferOut:&createdSample)==noErr,let value=createdSample else { throw NativePCMError("generated_sample") }
        return value
    }
    let interleaved=try nativeFloatPCM([floatBytes([0.5,-0.5,1,-1,.nan,.infinity])],frames:3,planar:false)
    let planar=try nativeFloatPCM([floatBytes([0.5,1,.nan]),floatBytes([-0.5,-1,.infinity])],frames:3,planar:true)
    try check(interleaved==planar,"planar/interleaved channel order")
    let values=interleaved.withUnsafeBytes { raw in (0..<6).map {Int16(littleEndian:raw.loadUnaligned(fromByteOffset:$0*2,as:Int16.self))} }
    try check(values==[16384,-16384,32767,-32768,0,0],"float clamp and nonfinite handling")
    let sampledInterleaved=try nativeSamplePCM(sample(floatBytes([0.5,-0.5,1,-1,.nan,.infinity]),planar:false))
    let sampledPlanar=try nativeSamplePCM(sample(floatBytes([0.5,1,.nan,-0.5,-1,.infinity]),planar:true))
    try check(sampledInterleaved==interleaved,"CMSampleBuffer interleaved extraction")
    try check(sampledPlanar==interleaved,"CMSampleBuffer planar extraction")
    for format in [(16000.0,UInt32(2)),(48000.0,UInt32(1))] {
        let invalid=try sample(floatBytes([0.5,-0.5,1,-1,.nan,.infinity]),planar:false,rate:format.0,channels:format.1)
        do { _=try nativeSamplePCM(invalid);throw NativePCMError("generated invalid format accepted") }
        catch let e as NativePCMError { try check(e.code=="pcm_format","CMSampleBuffer format rejected") }
    }
    do { let short=try sample(Data(count:20),planar:false);_=try nativeSamplePCM(short);throw NativePCMError("generated short buffer accepted") }
    catch let e as NativePCMError { try check(e.code=="generated_sample" || e.code=="pcm_buffers","CMSampleBuffer short buffer rejected") }
    let f=NativePCMFramer()
    try check(try f.push(Data(repeating:1,count:1920),captured:10,now:10.01).isEmpty,"bounded partial")
    let frames=try f.push(Data(repeating:2,count:1920),captured:10.01,now:10.02)
    try check(frames.count==1 && frames[0].sequence==1 && frames[0].timestamp==10000000 && frames[0].record.count==3856,"wire framing")
    try check(frames[0].record[16]==1 && frames[0].record[3855]==2 && f.pending.isEmpty,"owned frame payload")
    do { _=try f.push(Data(repeating:0,count:19200),captured:11,now:11);throw NativePCMError("generated future accepted") } catch let e as NativePCMError { try check(e.code=="pcm_bound","future buffer rejected") }
    do { _=try nativeFloatPCM([Data(count:8)],frames:1,planar:true);throw NativePCMError("generated planes accepted") } catch let e as NativePCMError { try check(e.code=="pcm_format","plane mismatch rejected") }
    return checks
}
