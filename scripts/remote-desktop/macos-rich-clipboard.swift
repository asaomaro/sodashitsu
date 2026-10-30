import Foundation
import AppKit

// Prepended to the native helper by build-macos-desktop.sh. No pasteboard is opened
// by declaring these types or constructing the guard; the sink is created on a request.
let richBundleLimit=4*1024*1024,richTextLimit=512*1024,richPngLimit=2*1024*1024,richChunkLimit=16*1024
func richBinary(_ raw: Any?,_ limit: Int) throws -> Data {
    guard let text=raw as? String,text.utf8.count<=((limit+2)/3)*4,let data=Data(base64Encoded:text),data.count<=limit,data.base64EncodedString()==text else { throw NativeError("backend_failure") }
    return data
}
func richBundle(_ raw: Any) throws -> [String:Any] {
    guard let value=raw as? [String:Any],!value.isEmpty,Set(value.keys).isSubset(of:Set(["text","html","rtf","png"])) else { throw NativeError("unsupported") }
    for (key,item) in value {
        if key=="text" || key=="html" {
            guard let text=item as? String,!text.contains("\0"),text.utf8.count<=richTextLimit else { throw NativeError("backend_failure") }
        } else if key=="rtf" {
            var data=try richBinary(item,richTextLimit)
            guard data.starts(with:Data("{\\rtf".utf8)) else { throw NativeError("backend_failure") }
            while let last=data.last,[9,10,13,32].contains(Int(last)) { data.removeLast() }
            guard data.last==125 else { throw NativeError("backend_failure") }
        } else {
            let data=try richBinary(item,richPngLimit)
            guard data.count>=33,Array(data.prefix(16))==[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82] else { throw NativeError("backend_failure") }
            let width=data.dropFirst(16).prefix(4).reduce(0) { ($0<<8)|Int($1) },height=data.dropFirst(20).prefix(4).reduce(0) { ($0<<8)|Int($1) }
            guard width>0,height>0,width<=4096,height<=4096,width*height<=8000000 else { throw NativeError("backend_failure") }
        }
    }
    return value
}
protocol RichClipboardSink {
    var sequence: Int { get }
    func read(valid: () -> Bool) throws -> [String:Any]
    func write(_ bundle: [String:Any],expected: Int,valid: (Int?) -> Bool) throws
}
final class PasteboardRichSink: RichClipboardSink {
    var sequence: Int { NSPasteboard.general.changeCount }
    func read(valid: () -> Bool) throws -> [String:Any] {
        let board=NSPasteboard.general,version=board.changeCount
        guard valid(),let items=board.pasteboardItems,items.count==1 else { throw NativeError("unsupported") }
        let item=items[0];var value=[String:Any]()
        for (key,type) in [("text",NSPasteboard.PasteboardType.string),("html",.html),("rtf",.rtf),("png",.png)] {
            guard valid(),board.changeCount==version else { throw NativeError("source_changed") }
            if !item.types.contains(type) { continue }
            if key=="text" { if let text=item.string(forType:type) { value[key]=text } }
            else if let data=item.data(forType:type) {
                guard data.count<=(key=="png" ? richPngLimit:richTextLimit) else { throw NativeError("backend_failure") }
                if key=="html" { guard let text=String(data:data,encoding:.utf8) else { throw NativeError("unsupported") };value[key]=text }
                else { value[key]=data.base64EncodedString() }
            }
        }
        guard valid(),board.changeCount==version else { throw NativeError("source_changed") }
        return try richBundle(value)
    }
    func write(_ bundle: [String:Any],expected: Int,valid: (Int?) -> Bool) throws {
        let value=try richBundle(bundle),item=NSPasteboardItem()
        for (key,type) in [("text",NSPasteboard.PasteboardType.string),("html",.html),("rtf",.rtf),("png",.png)] {
            guard let raw=value[key] else { continue }
            let data: Data
            if key=="text" || key=="html" { guard let text=raw as? String else { throw NativeError("backend_failure") };data=Data(text.utf8) }
            else { data=try richBinary(raw,key=="png" ? richPngLimit:richTextLimit) }
            guard item.setData(data,forType:type) else { throw NativeError("backend_failure") }
        }
        let board=NSPasteboard.general
        guard board.changeCount==expected,valid(nil) else { throw NativeError("source_changed") }
        let cleared=board.clearContents()
        guard board.changeCount==cleared,valid(cleared) else { throw NativeError("source_changed") }
        guard board.writeObjects([item]) else { throw NativeError("backend_failure") }
    }
}
final class RichClipboardTransaction {
    let id: String,generation: Int64,reading: Bool,version: Int,started: Double
    var last: Double,offset=0,cancelled=false,data: Data?
    init(id: String,generation: Int64,reading: Bool,version: Int,now: Double) { self.id=id;self.generation=generation;self.reading=reading;self.version=version;self.started=now;self.last=now }
}
struct RichClipboardReply { let value: [String:Any];let valid: () -> Bool }
/** Same wire contract as Windows/Portal. DesktopSource.gate serializes all operations. */
final class RichClipboardGuard {
    let clipboard: TextClipboardGuard,factory: () -> RichClipboardSink
    private var sink: RichClipboardSink?
    private(set) var current: RichClipboardTransaction?
    private var retired=[String](),cancelled=[String]()
    private var publications=[RichClipboardTransaction]()
    init(clipboard: TextClipboardGuard,factory: @escaping () -> RichClipboardSink) { self.clipboard=clipboard;self.factory=factory }
    func finish(cancel: Bool=false) {
        guard let c=current else { return };current=nil;c.cancelled=c.cancelled || cancel
        let size=c.data?.count ?? 0;c.data?.resetBytes(in:0..<size);c.data=nil
        retired.append(c.id);if retired.count>32 { retired.removeFirst() }
    }
    func clear() { finish(cancel:true) }
    func expire() {
        guard let c=current else { return };let now=clipboard.monotonic()
        if now<c.started || now-c.started>60000 || now-c.last>5000 || !clipboard.enabled || c.generation != clipboard.generation { finish(cancel:true) }
    }
    func allowed(_ ticket: TextClipboardTicket,write: Bool=false) -> Bool {
        let writable = !write || clipboard.canWrite(),granted=clipboard.authorized(ticket),now=clipboard.monotonic()
        return writable && granted && clipboard.ceiling && clipboard.enabled && clipboard.generation==ticket.owner && now>=ticket.started && now<=ticket.deadline
    }
    func live(_ c: RichClipboardTransaction,_ ticket: TextClipboardTicket,write: Bool=false,expectedVersion: Int?=nil) -> Bool {
        let version=sink?.sequence,granted=allowed(ticket,write:write),now=clipboard.monotonic()
        return granted && current===c && !c.cancelled && c.generation==ticket.owner && clipboard.enabled && clipboard.generation==ticket.owner && version==(expectedVersion ?? c.version) && now>=ticket.started && now<=ticket.deadline && now>=c.started && now-c.started<=60000 && now>=c.last && now-c.last<=5000
    }
    func witness(_ c: RichClipboardTransaction,_ ticket: TextClipboardTicket) -> () -> Bool {
        if !publications.contains(where:{$0===c}) {
            publications.append(c);if publications.count>32 { publications.removeFirst().cancelled=true }
        }
        return { [weak self] in
            guard let self=self else { return false }
            let version=c.reading ? self.sink?.sequence:nil,granted=self.allowed(ticket),now=self.clipboard.monotonic()
            return granted && !c.cancelled && !self.cancelled.contains(c.id) && c.generation==ticket.owner && self.clipboard.enabled && self.clipboard.generation==ticket.owner && now>=ticket.started && now<=ticket.deadline && now>=c.started && now-c.started<=60000 && now>=c.last && now-c.last<=5000 && (!c.reading || version==c.version)
        }
    }
    func evaluate(_ value: [String:Any]) throws -> RichClipboardReply {
        let started=clipboard.monotonic(),utc=clipboard.clock()
        guard let id=value["id"] as? String,id.count==36,UUID(uuidString:id) != nil else { throw NativeError("backend_failure") }
        let failure=RichClipboardReply(value:["type":"clipboard_rich_result","id":id,"ok":false,"stage":"done"],valid:{true})
        guard let owner=integer(value["generation"],1,Int64(safeInteger)),let expires=integer(value["expiresAt"],utc,utc+1500),let operation=value["operation"] as? String else { return failure }
        let ticket=TextClipboardTicket(owner:owner,expires:expires,started:started,deadline:started+Double(expires-utc))
        var keys=Set(["type","id","operation","generation","expiresAt"])
        if operation=="begin" { keys.insert("size") };if operation=="pull" || operation=="push" { keys.insert("offset") };if operation=="push" { keys.insert("data") }
        guard value["type"] as? String=="clipboard_rich",Set(value.keys)==keys,["read","begin","pull","push","commit","cancel"].contains(operation),allowed(ticket) else { return failure }
        if operation=="begin" && integer(value["size"],1,Int64(richBundleLimit))==nil { return failure }
        if operation=="cancel" {
            for pending in publications where pending.id==id { pending.cancelled=true };cancelled.append(id);if cancelled.count>32 { cancelled.removeFirst() };if current?.id==id { finish(cancel:true) }
            return RichClipboardReply(value:["type":"clipboard_rich_result","id":id,"ok":true,"stage":"cancelled"],valid:{true})
        }
        do {
            expire()
            if operation=="read" || operation=="begin" {
                guard current==nil,!retired.contains(id),!cancelled.contains(id),allowed(ticket,write:operation=="begin") else { return failure }
                if sink==nil { sink=factory() };guard let board=sink else { return failure };let version=board.sequence
                guard allowed(ticket,write:operation=="begin"),!cancelled.contains(id) else { return failure }
                let c=RichClipboardTransaction(id:id,generation:owner,reading:operation=="read",version:version,now:clipboard.monotonic());current=c
                guard live(c,ticket,write:operation=="begin") else { throw NativeError("source_changed") }
                if c.reading { let bundle=try richBundle(board.read(valid:{self.live(c,ticket)}));let data=try JSONSerialization.data(withJSONObject:bundle,options:[.sortedKeys]);guard data.count>0,data.count<=richBundleLimit,live(c,ticket) else { throw NativeError("source_changed") };c.data=data }
                else { guard let size=integer(value["size"],1,Int64(richBundleLimit)) else { throw NativeError("backend_failure") };c.data=Data(count:Int(size)) }
                return RichClipboardReply(value:["type":"clipboard_rich_result","id":id,"ok":true,"stage":"begin","size":c.data!.count],valid:witness(c,ticket))
            }
            guard let c=current,c.id==id,live(c,ticket),let size=c.data?.count else { throw NativeError("source_changed") };c.last=clipboard.monotonic()
            if operation=="pull" || operation=="push" {
                guard let offset=integer(value["offset"],0,Int64(richBundleLimit)),Int(offset)==c.offset else { throw NativeError("backend_failure") }
                if operation=="pull" {
                    guard c.reading,c.offset<size else { throw NativeError("backend_failure") };let next=min(size,c.offset+richChunkLimit),chunk=c.data!.subdata(in:c.offset..<next).base64EncodedString();c.offset=next
                    let reply=RichClipboardReply(value:["type":"clipboard_rich_result","id":id,"ok":true,"stage":"chunk","offset":next,"data":chunk],valid:witness(c,ticket));if next==size { finish() };return reply
                }
                let piece=try richBinary(value["data"],richChunkLimit);guard !c.reading,!piece.isEmpty,c.offset+piece.count<=size,live(c,ticket,write:true) else { throw NativeError("backend_failure") }
                c.data!.replaceSubrange(c.offset..<(c.offset+piece.count),with:piece);c.offset+=piece.count
                return RichClipboardReply(value:["type":"clipboard_rich_result","id":id,"ok":true,"stage":"chunk","offset":c.offset],valid:witness(c,ticket))
            }
            guard !c.reading,c.offset==size,let data=c.data,let board=sink,live(c,ticket,write:true) else { throw NativeError("permission_denied") }
            let bundle=try richBundle(JSONSerialization.jsonObject(with:data));guard live(c,ticket,write:true) else { throw NativeError("source_changed") }
            try board.write(bundle,expected:c.version,valid:{self.live(c,ticket,write:true,expectedVersion:$0)})
            guard allowed(ticket),!c.cancelled else { throw NativeError("source_changed") };let reply=RichClipboardReply(value:["type":"clipboard_rich_result","id":id,"ok":true,"stage":"done"],valid:witness(c,ticket));finish();return reply
        } catch { if current?.id==id { finish(cancel:true) };return failure }
    }
}

final class GeneratedRichClipboard: RichClipboardSink {
    var version=1,reads=0,writes=0
    var value: [String:Any]=["text":"generated"]
    var sequenceHook: (() -> Void)?,writeHook: (() -> Void)?,clearHook: (() -> Void)?
    var sequence: Int { sequenceHook?();return version }
    func read(valid: () -> Bool) throws -> [String:Any] { guard valid() else { throw NativeError("source_changed") };reads+=1;return value }
    func write(_ bundle: [String:Any],expected: Int,valid: (Int?) -> Bool) throws {
        writeHook?();guard expected==version,valid(nil) else { throw NativeError("source_changed") };version+=1;let cleared=version;clearHook?();guard version==cleared,valid(cleared) else { throw NativeError("source_changed") };writes+=1;value=bundle;version+=1
    }
}
func generatedRichClipboardTests() throws -> Int {
    var count=0
    func check(_ condition: @autoclosure () -> Bool,_ detail: String) throws { guard condition() else { throw GeneratedFailure(detail:detail) };count+=1 }
    var alive=true,writable=true,now:Double=0;let board=GeneratedRichClipboard();var factories=0
    let text=TextClipboardGuard(sink:GeneratedTextClipboard(),ceiling:true,active:{alive},canWrite:{writable},clock:{1000},monotonic:{now})
    let rich=RichClipboardGuard(clipboard:text,factory:{factories+=1;return board})
    func command(_ id: String,_ op: String,_ fields: [String:Any]=[:]) -> [String:Any] {
        return ["type":"clipboard_rich","id":id,"operation":op,"generation":text.generation,"expiresAt":1400].merging(fields) { _,new in new }
    }
    let disabled=try rich.evaluate(command(UUID().uuidString,"read"));try check(disabled.value["ok"] as? Bool==false && factories==0,"rich clipboard disabled never opens pasteboard")
    try text.control(["generation":1,"enabled":true])
    let png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII="
    let bundle: [String:Any]=["text":String(repeating:"generated ",count:3000),"html":"<b>generated</b>","rtf":Data("{\\rtf1 generated}".utf8).base64EncodedString(),"png":png]
    board.value=bundle
    let id=UUID().uuidString,begin=try rich.evaluate(command(id,"read"));try check(begin.value["stage"] as? String=="begin" && begin.valid(),"rich clipboard read begins with original ticket")
    let size=Int(integer(begin.value["size"],1,Int64(richBundleLimit))!);var restored=Data();var finalReply=begin
    while restored.count<size {
        let result=try rich.evaluate(command(id,"pull",["offset":restored.count])),chunk=try richBinary(result.value["data"],richChunkLimit)
        try check(integer(result.value["offset"],0,Int64(richBundleLimit))==Int64(restored.count+chunk.count) && result.valid(),"rich clipboard pull replies next offset")
        restored.append(chunk);finalReply=result
    }
    let expected=try JSONSerialization.data(withJSONObject:bundle,options:[.sortedKeys]);try check(restored==expected && rich.current==nil,"rich clipboard chunked bundle round trip")
    let independent=UUID().uuidString,newReply=try rich.evaluate(command(independent,"read"));_ = try rich.evaluate(command(id,"cancel"))
    try check(newReply.valid(),"rich clipboard old cancel does not revoke another transaction");rich.clear()
    let replay=try rich.evaluate(command(id,"read"));try check(replay.value["ok"] as? Bool==false && board.reads==2,"rich clipboard id not replayed")
    let cancel=try rich.evaluate(command(id,"cancel"));try check(cancel.value["stage"] as? String=="cancelled" && !finalReply.valid(),"rich clipboard cancelled final output is not published")
    for _ in 0..<32 { _ = try rich.evaluate(command(UUID().uuidString,"cancel")) }
    try check(!finalReply.valid(),"rich clipboard cancelled output never revives after cache eviction")
    func stage(_ id: String) throws {
        let first=try rich.evaluate(command(id,"begin",["size":expected.count]));try check(first.value["ok"] as? Bool==true,"rich clipboard write admitted")
        for offset in stride(from:0,to:expected.count,by:richChunkLimit) {
            let next=min(expected.count,offset+richChunkLimit),chunk=expected.subdata(in:offset..<next)
            let result=try rich.evaluate(command(id,"push",["offset":offset,"data":chunk.base64EncodedString()]))
            try check(integer(result.value["offset"],0,Int64(richBundleLimit))==Int64(next),"rich clipboard push contiguous offset")
        }
    }
    let writeId=UUID().uuidString;try stage(writeId);let committed=try rich.evaluate(command(writeId,"commit"))
    try check(committed.value["stage"] as? String=="done" && committed.valid() && board.writes==1,"rich clipboard write commits all formats")
    let noInput=UUID().uuidString;try stage(noInput);writable=false;let refused=try rich.evaluate(command(noInput,"commit"));writable=true
    try check(refused.value["ok"] as? Bool==false && board.writes==1,"rich clipboard write requires input ceiling")
    let changed=UUID().uuidString;try stage(changed);board.version+=1;let replaced=try rich.evaluate(command(changed,"commit"))
    try check(replaced.value["ok"] as? Bool==false && board.writes==1,"rich clipboard write preserves changed local clipboard")
    let late=UUID().uuidString;try stage(late);board.writeHook={now=500};let expired=try rich.evaluate(command(late,"commit"));board.writeHook=nil
    try check(expired.value["ok"] as? Bool==false && board.writes==1,"rich clipboard final write query cannot extend deadline");now=0
    let clearLate=UUID().uuidString;try stage(clearLate);board.clearHook={now=500};let clearExpired=try rich.evaluate(command(clearLate,"commit"));board.clearHook=nil
    try check(clearExpired.value["ok"] as? Bool==false && board.writes==1,"rich clipboard clear cannot extend write deadline");now=0
    let reads=board.reads;board.sequenceHook={now=500};let slow=try rich.evaluate(command(UUID().uuidString,"read"));board.sequenceHook=nil
    try check(slow.value["ok"] as? Bool==false && board.reads==reads,"rich clipboard native sequence query uses original budget");now=0
    let pending=UUID().uuidString,prepared=try rich.evaluate(command(pending,"read"));board.version+=1
    try check(!prepared.valid(),"rich clipboard source version fences queued read");rich.clear()
    let idle=UUID().uuidString;_ = try rich.evaluate(command(idle,"begin",["size":10]));now=5001;rich.expire();try check(rich.current==nil,"rich clipboard idle clears buffer");now=0
    let revoked=UUID().uuidString;_ = try rich.evaluate(command(revoked,"read"));try text.control(["generation":2,"enabled":false]);rich.clear()
    try check(rich.current==nil,"rich clipboard grant teardown clears buffer")
    var oversized=Data(base64Encoded:png)!;oversized[18]=16;oversized[19]=1
    let invalids: [[String:Any]]=[[:],["unknown":"x"],["text":"bad\0"],["html":String(repeating:"x",count:richTextLimit+1)],["rtf":"YWJjZA=="],["png":oversized.base64EncodedString()]]
    for invalid in invalids { var rejected=false;do { _ = try richBundle(invalid) } catch { rejected=true };try check(rejected,"rich clipboard bundle content bounds") }
    alive=false;try check(board.writes==1,"rich clipboard generated tests never use native pasteboard")
    return count
}
