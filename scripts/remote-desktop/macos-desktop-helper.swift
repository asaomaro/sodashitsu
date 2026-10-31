import Foundation
import CryptoKit
import AppKit
import ScreenCaptureKit
import ApplicationServices
import CoreMedia
import Darwin

// Probe and generated tests branch before any capture, permission or event API.
let safeInteger: Double = 9_007_199_254_740_991
func integer(_ raw: Any?, _ low: Int64, _ high: Int64) -> Int64? {
    guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
    let d = n.doubleValue
    guard d.isFinite, d.rounded() == d, abs(d) <= safeInteger,
          d >= Double(low), d <= Double(high) else { return nil }
    return n.int64Value
}
func boolean(_ raw: Any?) -> Bool? {
    guard let n = raw as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { return nil }
    return n.boolValue
}
func normalized(_ raw: Any?) -> Double? {
    guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(),
          n.doubleValue.isFinite, (0...1).contains(n.doubleValue) else { return nil }
    return n.doubleValue
}
func milliseconds() -> Double { ProcessInfo.processInfo.systemUptime * 1000 }
func utcMilliseconds() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
struct NativeError: Error { let code: String; init(_ code: String) { self.code = code } }

let keyCodes: [String: UInt16] = [
    "KeyA":0,"KeyS":1,"KeyD":2,"KeyF":3,"KeyH":4,"KeyG":5,"KeyZ":6,"KeyX":7,"KeyC":8,"KeyV":9,"IntlBackslash":10,"KeyB":11,
    "KeyQ":12,"KeyW":13,"KeyE":14,"KeyR":15,"KeyY":16,"KeyT":17,"Digit1":18,"Digit2":19,"Digit3":20,"Digit4":21,"Digit6":22,"Digit5":23,
    "Equal":24,"Digit9":25,"Digit7":26,"Minus":27,"Digit8":28,"Digit0":29,"BracketRight":30,"KeyO":31,"KeyU":32,"BracketLeft":33,"KeyI":34,"KeyP":35,
    "Enter":36,"KeyL":37,"KeyJ":38,"Quote":39,"KeyK":40,"Semicolon":41,"Backslash":42,"Comma":43,"Slash":44,"KeyN":45,"KeyM":46,"Period":47,
    "Tab":48,"Space":49,"Backquote":50,"Backspace":51,"Escape":53,"MetaRight":54,"MetaLeft":55,"ShiftLeft":56,"AltLeft":58,"ControlLeft":59,"ShiftRight":60,"AltRight":61,"ControlRight":62,
    "F17":64,"NumpadDecimal":65,"NumpadMultiply":67,"NumpadAdd":69,"NumpadDivide":75,"NumpadEnter":76,"NumpadSubtract":78,"F18":79,"F19":80,"NumpadEqual":81,
    "Numpad0":82,"Numpad1":83,"Numpad2":84,"Numpad3":85,"Numpad4":86,"Numpad5":87,"Numpad6":88,"Numpad7":89,"F20":90,"Numpad8":91,"Numpad9":92,"IntlYen":93,"IntlRo":94,"NumpadComma":95,
    "F5":96,"F6":97,"F7":98,"F3":99,"F8":100,"F9":101,"Lang2":102,"F11":103,"Lang1":104,"KanaMode":104,"NonConvert":102,"Convert":104,"F13":105,"F16":106,"F14":107,"F10":109,"F12":111,"F15":113,
    "Insert":114,"Home":115,"PageUp":116,"Delete":117,"F4":118,"End":119,"F2":120,"PageDown":121,"F1":122,"ArrowLeft":123,"ArrowRight":124,"ArrowDown":125,"ArrowUp":126
]
struct InjectedEvent {
    var kind: String
    var code: UInt16 = 0
    var down = false
    var x: Double = 0
    var y: Double = 0
    var button = 0
    var wheel = 0
    var text = ""
    var modifiers: Set<UInt16> = []
    var repeatKey = false
    var expires: Int64 = 0
}
protocol EventSink: AnyObject { func post(_ event: InjectedEvent) throws }
final class InputGuard {
    let sink: EventSink
    var allowed: Bool
    var active: () -> Bool
    var releaseAllowed: () -> Bool
    var control = false
    var revision: UInt64 = 0
    var seq: Int64 = 0
    private(set) var keys = Set<UInt16>()
    private(set) var buttons = Set<Int>()
    private var x: Double = 0, y: Double = 0
    init(sink: EventSink, allowed: Bool, active: @escaping () -> Bool, releaseAllowed: (() -> Bool)?=nil) {
        self.sink = sink; self.allowed = allowed; self.active = active;self.releaseAllowed=releaseAllowed ?? active
    }
    var modifiers: Set<UInt16> { keys.intersection([54,55,56,58,59,60,61,62]) }
    var capabilities: [String: Any] {
        ["keys": allowed ? keyCodes.keys.sorted() : [], "text": allowed,
         "pointerButtons": allowed ? [0,1,2,3,4] : [], "wheel": allowed]
    }
    func release() {
        revision &+= 1
        for button in buttons.sorted() where releaseAllowed() { try? sink.post(InjectedEvent(kind:"pointer",down:false,x:x,y:y,button:button,modifiers:modifiers)) }
        buttons.removeAll()
        for key in keys.sorted().reversed() {
            keys.remove(key)
            if releaseAllowed() { try? sink.post(InjectedEvent(kind:"key",code:key,down:false,modifiers:modifiers)) }
        }
        control = false
    }
    func input(_ message: [String: Any], now: Int64 = utcMilliseconds()) throws -> Int64? {
        guard let next = integer(message["seq"], 1, Int64(safeInteger)),
              let expires = integer(message["expiresAt"], 1, Int64(safeInteger)),
              let value = message["input"] as? [String: Any], let kind = value["kind"] as? String else { throw NativeError("backend_failure") }
        guard allowed, control, active(), next > seq, expires >= now, expires <= now + 1500 else { return nil }
        var event = InjectedEvent(kind:kind,modifiers:modifiers,expires:expires)
        switch kind {
        case "key":
            guard Set(value.keys) == ["kind","code","down"], let name=value["code"] as? String,
                  let code=keyCodes[name], let down=boolean(value["down"]) else { throw NativeError("input_unavailable") }
            event.code=code; event.down=down; event.repeatKey=down && keys.contains(code)
            if down { keys.insert(code) } else { keys.remove(code) }
            event.modifiers=modifiers
        case "pointer":
            guard Set(value.keys) == ["kind","event","x","y","button"], let px=normalized(value["x"]),let py=normalized(value["y"]),
                  let button=integer(value["button"],0,4),let action=value["event"] as? String,["move","down","up"].contains(action) else { throw NativeError("input_unavailable") }
            x=px;y=py;event.x=px;event.y=py;event.button=Int(button)
            if action == "move" { event.kind="move";event.button=buttons.sorted().first ?? -1 }
            else { event.down=action == "down";if event.down { buttons.insert(Int(button)) } else { buttons.remove(Int(button)) } }
        case "wheel":
            guard Set(value.keys) == ["kind","delta"], let delta=integer(value["delta"],-1200,1200) else { throw NativeError("input_unavailable") }
            event.wheel=Int(delta)
        case "text":
            guard Set(value.keys) == ["kind","text"], let text=value["text"] as? String, !text.isEmpty,
                  text.utf16.count<=8192, !text.contains("\0"), modifiers.isEmpty else { throw NativeError("input_unavailable") }
            event.text=text
        default: throw NativeError("input_unavailable")
        }
        revision &+= 1
        try sink.post(event)
        guard active() else { release(); throw NativeError("source_changed") }
        seq=next
        return next
    }
}

func unicodeChunks(_ text: String) -> [[UInt16]] {
    var chunks=[[UInt16]](),current=[UInt16]()
    for scalar in text.unicodeScalars {
        let units=Array(String(scalar).utf16)
        if current.count+units.count>20 { chunks.append(current);current=[] }
        current.append(contentsOf:units)
    }
    if !current.isEmpty { chunks.append(current) };return chunks
}

func postText(_ text: String, expires: Int64, active: () -> Bool, now: () -> Int64,
              emit: ([UInt16], Bool) throws -> Void, cleanup: () -> Void) throws {
    var down=false
    defer { if down && active() { cleanup() } }
    for chunk in unicodeChunks(text) {
        guard active(),now()<=expires else { throw NativeError("source_changed") }
        try emit(chunk,true);down=true
        guard active(),now()<=expires else { throw NativeError("source_changed") }
        try emit(chunk,false);down=false
    }
}

final class QuartzSink: EventSink {
    let bounds: CGRect
    let active: () -> Bool
    private var lastClick: (Int,Double,CGPoint,Int)?
    init(bounds: CGRect, active: @escaping () -> Bool) { self.bounds=bounds;self.active=active }
    func flags(_ keys: Set<UInt16>) -> CGEventFlags {
        var result: CGEventFlags = []
        if !keys.isDisjoint(with:[56,60]) { result.insert(.maskShift) }
        if !keys.isDisjoint(with:[59,62]) { result.insert(.maskControl) }
        if !keys.isDisjoint(with:[58,61]) { result.insert(.maskAlternate) }
        if !keys.isDisjoint(with:[54,55]) { result.insert(.maskCommand) }
        return result
    }
    func post(_ value: InjectedEvent) throws {
        guard active() else { throw NativeError("source_changed") }
        let event: CGEvent?
        switch value.kind {
        case "key":
            event=CGEvent(keyboardEventSource:nil,virtualKey:value.code,keyDown:value.down)
            event?.setIntegerValueField(.keyboardEventAutorepeat,value:value.repeatKey ? 1 : 0)
        case "pointer","move":
            let point=CGPoint(x:bounds.minX+min(bounds.width-1,value.x*bounds.width),y:bounds.minY+min(bounds.height-1,value.y*bounds.height))
            let buttons: [CGMouseButton] = [.left,.center,.right,CGMouseButton(rawValue:3)!,CGMouseButton(rawValue:4)!]
            let button=value.button>=0 ? buttons[value.button] : .left
            let type: CGEventType
            if value.kind == "move" { type=value.button<0 ? .mouseMoved : value.button==0 ? .leftMouseDragged : value.button==2 ? .rightMouseDragged : .otherMouseDragged }
            else { type=value.button==0 ? (value.down ? .leftMouseDown:.leftMouseUp) : value.button==2 ? (value.down ? .rightMouseDown:.rightMouseUp) : (value.down ? .otherMouseDown:.otherMouseUp) }
            event=CGEvent(mouseEventSource:nil,mouseType:type,mouseCursorPosition:point,mouseButton:button)
            if value.kind == "pointer" {
                var count=1
                if let last=lastClick,last.0==value.button,milliseconds()-last.1<500,abs(last.2.x-point.x)<4,abs(last.2.y-point.y)<4 { count=value.down ? min(3,last.3+1):last.3 }
                if value.down { lastClick=(value.button,milliseconds(),point,count) }
                event?.setIntegerValueField(.mouseEventClickState,value:Int64(count))
            }
        case "wheel":
            event=CGEvent(scrollWheelEvent2Source:nil,units:.line,wheelCount:1,wheel1:Int32(value.wheel*3/120),wheel2:0,wheel3:0)
        case "text":
            try postText(value.text,expires:value.expires,active:active,now:utcMilliseconds,emit:{ chars,down in
                guard let text=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down) else { throw NativeError("input_unavailable") }
                chars.withUnsafeBufferPointer { buffer in text.keyboardSetUnicodeString(stringLength:chars.count,unicodeString:buffer.baseAddress!) }
                text.post(tap:.cghidEventTap)
            },cleanup:{ if self.active() { CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:false)?.post(tap:.cghidEventTap) } })
            return
        default: throw NativeError("input_unavailable")
        }
        guard let event=event else { throw NativeError("input_unavailable") }
        if value.expires>0 { guard active(),utcMilliseconds()<=value.expires else { throw NativeError("source_changed") } }
        event.flags=flags(value.modifiers)
        guard active() else { throw NativeError("source_changed") }
        event.post(tap:.cghidEventTap)
    }
}

struct DisplayStamp: Equatable {
    let bounds: CGRect
    let pixelWidth: Int
    let pixelHeight: Int
}
func displayStamp(_ id: CGDirectDisplayID) -> DisplayStamp? {
    guard CGDisplayIsActive(id) != 0,let mode=CGDisplayCopyDisplayMode(id) else { return nil }
    return DisplayStamp(bounds:CGDisplayBounds(id),pixelWidth:mode.pixelWidth,pixelHeight:mode.pixelHeight)
}

struct FrameTicket { let revision: UInt64; let started: Double; let inputSeq: Int64 }
func canPublish(_ ticket: FrameTicket, revision: UInt64, now: Double, active: Bool) -> Bool {
    active && ticket.revision == revision && now >= ticket.started && now-ticket.started < 1000
}
enum RecordWriteResult: Equatable { case complete, discarded, failed }
enum WriteAttempt { case wrote(Int), again, interrupted, failed }
func writeRecord(_ data: Data, valid: () -> Bool, clock: () -> Double,
                 attempt: (Int) -> WriteAttempt, wait: () -> Void) -> RecordWriteResult {
    let deadline=clock()+500
    var offset=0
    while offset<data.count {
        guard valid() else { return offset==0 ? .discarded:.failed }
        guard clock()<=deadline else { return .failed }
        switch attempt(offset) {
        case .wrote(let count):
            guard count>0,count<=data.count-offset else { return .failed };offset+=count
        case .again:wait()
        case .interrupted:continue
        case .failed:return .failed
        }
    }
    return .complete
}

final class BoundedWriter {
    private let queue=DispatchQueue.main
    private let countLock=NSLock()
    private let gate: NSRecursiveLock
    private let fd: Int32
    private let failure: () -> Void
    private var bytes=0, count=0
    private var failed=false
    init(fd: Int32, gate: NSRecursiveLock, failure: @escaping () -> Void) {
        self.fd=fd;self.gate=gate;self.failure=failure
        let flags=fcntl(fd,F_GETFL)
        if flags>=0 { _=fcntl(fd,F_SETFL,flags|O_NONBLOCK) }
    }
    func send(_ value: [String: Any], valid: (() -> Bool)?=nil, discarded: (() -> Void)?=nil) throws {
        var mutable=try JSONSerialization.data(withJSONObject:value,options:[.sortedKeys]);mutable.append(10);let data=mutable
        countLock.lock()
        guard !failed,data.count<=3*1024*1024,count<64,bytes+data.count<=4*1024*1024 else {
            countLock.unlock();throw NativeError("backend_failure")
        }
        bytes+=data.count;count+=1;countLock.unlock()
        queue.async {
            defer { self.countLock.lock();self.bytes-=data.count;self.count-=1;self.countLock.unlock() }
            self.gate.lock();defer { self.gate.unlock() }
            let result=writeRecord(data,valid:{valid?() ?? true},clock:milliseconds,attempt:{ offset in
                let written=data.withUnsafeBytes { raw in Darwin.write(self.fd,raw.baseAddress!.advanced(by:offset),data.count-offset) }
                if written>0 { return .wrote(written) }
                if written<0 && errno==EINTR { return .interrupted }
                if written<0 && (errno==EAGAIN || errno==EWOULDBLOCK) { return .again }
                return .failed
            },wait:{
                var descriptor=pollfd(fd:self.fd,events:Int16(POLLOUT),revents:0)
                _=Darwin.poll(&descriptor,1,10)
            })
            if result == .discarded { discarded?() }
            else if result == .failed { self.fail() }

        }
    }
    private func fail() {
        countLock.lock();let first = !failed;failed=true;countLock.unlock()
        if first { failure() }
    }
    func finish(_ completion: @escaping () -> Void) { queue.async(execute:completion) }
}

@available(macOS 14.0, *)
struct AgentRegionSpec {
    let id: String
    let x,y,width,height: Int
    var json: [String:Any] { ["id":id,"x":x,"y":y,"width":width,"height":height] }
}
final class AgentRegionProofs {
    private(set) var specs: [AgentRegionSpec]=[]
    func configure(_ raw: Any,width: Int,height: Int) throws {
        guard let values=raw as? [[String:Any]],values.count<=8 else { throw NativeError("unsupported") }
        var next: [AgentRegionSpec]=[],ids=Set<String>()
        for value in values {
            guard Set(value.keys)==Set(["id","x","y","width","height"]),let id=value["id"] as? String,
                  UUID(uuidString:id)?.uuidString.lowercased()==id,!ids.contains(id),
                  let x=integer(value["x"],0,4095),let y=integer(value["y"],0,2399),
                  let w=integer(value["width"],1,4096),let h=integer(value["height"],1,2400),
                  w*h<=1_048_576,x+w<=Int64(width),y+h<=Int64(height) else { throw NativeError("unsupported") }
            ids.insert(id);next.append(AgentRegionSpec(id:id,x:Int(x),y:Int(y),width:Int(w),height:Int(h)))
        }
        specs=next
    }
    func proofs(_ image: CGImage) throws -> [[String:Any]] {
        var result: [[String:Any]]=[]
        for r in specs {
            guard r.x+r.width<=image.width,r.y+r.height<=image.height,
                  let cropped=image.cropping(to:CGRect(x:r.x,y:r.y,width:r.width,height:r.height)) else { throw NativeError("source_changed") }
            var pixels=[UInt8](repeating:0,count:r.width*r.height*4)
            try pixels.withUnsafeMutableBytes { (memory: UnsafeMutableRawBufferPointer) in
                guard let context=CGContext(data:memory.baseAddress,width:r.width,height:r.height,bitsPerComponent:8,bytesPerRow:r.width*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue|CGBitmapInfo.byteOrder32Big.rawValue) else { throw NativeError("backend_failure") }
                context.draw(cropped,in:CGRect(x:0,y:0,width:r.width,height:r.height))
            }
            var hash=SHA256();hash.update(data:Data("\(r.id):\(image.width):\(image.height):\(r.x):\(r.y):\(r.width):\(r.height):".utf8));hash.update(data:Data(pixels))
            result.append(r.json.merging(["digest":hash.finalize().map { String(format:"%02x",$0) }.joined()]) { _,new in new })
        }
        return result
    }
    func clear() { specs.removeAll() }
}

protocol TextClipboardSink {
    func read() throws -> String
    func write(_ text: String) throws
}
final class PasteboardTextSink: TextClipboardSink {
    func read() throws -> String {
        let board=NSPasteboard.general,revision=board.changeCount
        let value=board.string(forType:.string) ?? ""
        guard board.changeCount==revision else { throw NativeError("backend_failure") }
        return value
    }
    func write(_ text: String) throws {
        let board=NSPasteboard.general;board.clearContents()
        if !text.isEmpty && !board.setString(text,forType:.string) { throw NativeError("backend_failure") }
    }
}
struct TextClipboardTicket { let owner: Int64;let expires: Int64;let started: Double;let deadline: Double }
struct TextClipboardReply { let value: [String:Any];let ticket: TextClipboardTicket? }
/** Source-local clipboard generation. Parent source gate serializes commands and final publication. */
final class TextClipboardGuard {
    let sink: TextClipboardSink
    let ceiling: Bool
    let active: () -> Bool
    let canWrite: () -> Bool
    let clock: () -> Int64
    let monotonic: () -> Double
    private(set) var generation: Int64=0
    private(set) var enabled=false
    private var lastId: Int64=0
    init(sink: TextClipboardSink,ceiling: Bool,active: @escaping () -> Bool,canWrite: @escaping () -> Bool,clock: @escaping () -> Int64=utcMilliseconds,monotonic: @escaping () -> Double=milliseconds) {
        self.sink=sink;self.ceiling=ceiling;self.active=active;self.canWrite=canWrite;self.clock=clock;self.monotonic=monotonic
    }
    func control(_ value: [String:Any]) throws {
        guard let next=integer(value["generation"],1,Int64(safeInteger)),let requested=boolean(value["enabled"]) else { throw NativeError("backend_failure") }
        if next<=generation { return }
        generation=next;enabled=false
        let alive=requested && ceiling && active()
        if generation==next { enabled=alive }
    }
    func authorized(_ ticket: TextClipboardTicket) -> Bool {
        guard ceiling,enabled,ticket.owner==generation else { return false }
        let alive=active(),utc=clock(),now=monotonic()
        if !alive && generation==ticket.owner { enabled=false }
        return alive && ceiling && enabled && ticket.owner==generation && utc<=ticket.expires && now.isFinite && now>=ticket.started && now<=ticket.deadline
    }
    func request(_ value: [String:Any]) throws -> [String:Any] { try evaluate(value).value }
    func evaluate(_ value: [String:Any]) throws -> TextClipboardReply {
        let started=monotonic(),now=clock()
        guard let id=integer(value["id"],1,Int64(safeInteger)) else { throw NativeError("backend_failure") }
        let failure=TextClipboardReply(value:["type":"clipboard_result","id":id,"ok":false],ticket:nil)
        guard let owner=integer(value["generation"],1,Int64(safeInteger)),let expires=integer(value["expiresAt"],now,now+1500),id>lastId,let operation=value["operation"] as? String else { return failure }
        // Fix the original budget before active/canWrite perform native queries.
        let ticket=TextClipboardTicket(owner:owner,expires:expires,started:started,deadline:started+Double(expires-now))
        guard authorized(ticket) else { return failure }
        lastId=id
        do {
            if operation=="read" {
                guard authorized(ticket) else { return failure }
                let text=try sink.read()
                guard text.utf16.count<=8192,authorized(ticket) else { return failure }
                return TextClipboardReply(value:["type":"clipboard_result","id":id,"ok":true,"text":text],ticket:ticket)
            }
            if operation=="write",let text=value["text"] as? String,text.utf16.count<=8192,canWrite(),authorized(ticket) {
                try sink.write(text)
                guard authorized(ticket) else { return failure }
                return TextClipboardReply(value:["type":"clipboard_result","id":id,"ok":true],ticket:nil)
            }
        } catch { return failure }
        return failure
    }
    func clear() { enabled=false;generation+=1 }
}

final class DesktopSource {
    private let factsOverride: (() -> Bool)?
    init(facts: (() -> Bool)?=nil) { factsOverride=facts }
    let regions=AgentRegionProofs()
    let gate=NSRecursiveLock()
    var dead=false,ready=false,stopping=false
    var input: InputGuard?
    var clipboard: TextClipboardGuard?
    var richClipboard: RichClipboardGuard?
    var nativeVideo: NativeVideoController?
    var audioCeiling=false
    var systemAudio:NativeSystemAudioActor?
    var videoCeiling=false,lastJPEG:Double=0
    var richRequested=false
    var clipboardCeiling=false
    var display: SCDisplay?
    var bounds=CGRect.zero
    var stamp: DisplayStamp?
    var filter: SCContentFilter?
    var configuration: SCStreamConfiguration?
    var width=0,height=0,fps=0,quality=0
    var initialFPS=0,initialQuality=0
    var lastCapture=milliseconds(),lastHeartbeat=milliseconds()
    var pending: Int64=0,sequence: Int64=0
    var pendingAt=milliseconds()
    var configured=false
    var configuredAt=milliseconds()
    var inputCeiling=false
    var showCursor=true
    var captureTask: Task<Void,Never>?
    var timer: Timer?
    var observers: [NSObjectProtocol]=[]
    private var queuedCommands=0
    private var commandFailed=false
    private let commandLock=NSLock()
    lazy var output=BoundedWriter(fd:STDOUT_FILENO,gate:gate,failure:{ [weak self] in DispatchQueue.main.async { self?.stop("backend_failure") } })
    func locked<T>(_ body: () throws -> T) rethrows -> T { gate.lock();defer { gate.unlock() };return try body() }
    func sessionActive() -> Bool {
        guard let raw=CGSessionCopyCurrentDictionary() as? [String:Any],
              (raw[kCGSessionOnConsoleKey as String] as? NSNumber)?.boolValue==true,
              (raw[kCGSessionLoginDoneKey as String] as? NSNumber)?.boolValue==true,
              (raw[kCGSessionUserIDKey as String] as? NSNumber)?.uint32Value==getuid(),geteuid()==getuid(),
              let application=NSWorkspace.shared.frontmostApplication,
              let bundle=application.bundleIdentifier,bundle != "com.apple.loginwindow" else { return false }
        return true
    }
    func sourceActive() -> Bool {
        if let facts=factsOverride { return !dead && facts() }
        guard !dead,sessionActive(),CGPreflightScreenCaptureAccess(),let display=display,
              stamp != nil,displayStamp(display.displayID)==stamp else { return false }
        return !inputCeiling || (AXIsProcessTrusted() && CGPreflightPostEventAccess())
    }
    func publishable(_ ticket:FrameTicket) -> Bool {
        !dead && !stopping && input != nil && canPublish(ticket,revision:input!.revision,now:milliseconds(),active:sourceActive())
    }
    func start() {
        signal(SIGPIPE,SIG_IGN)
        let center=NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.sessionDidResignActiveNotification,NSWorkspace.screensDidSleepNotification,NSWorkspace.willPowerOffNotification] {
            observers.append(center.addObserver(forName:name,object:nil,queue:.main) { [weak self] _ in self?.stop("source_changed") })
        }
        timer=Timer.scheduledTimer(withTimeInterval:0.1,repeats:true) { [weak self] _ in
            guard let self=self,!self.dead else { return }
            self.locked {
                self.richClipboard?.expire()
                self.nativeVideo?.tick()
                if let audio=self.systemAudio,!self.audioLive(audio.id) {audio.stop()}
                if milliseconds()-self.lastHeartbeat>8000 { self.stop("source_changed") }
                else if self.ready && !self.sourceActive() { self.stop("source_changed") }
                else if self.ready && milliseconds()-self.lastCapture>1500 { self.stop("source_stalled") }
                else if self.configured && !self.ready && milliseconds()-self.configuredAt>15000 { self.stop("backend_failure") }
                else if self.pending != 0 && milliseconds()-self.pendingAt>5000 { self.stop("backend_failure") }
            }
        }
        DispatchQueue.global(qos:.userInitiated).async { [weak self] in self?.readCommands() }
    }
    func readCommands() {
        var buffer=Data()
        do {
            while true {
                guard let part=try FileHandle.standardInput.read(upToCount:4096),!part.isEmpty else { enqueue(nil);return }
                buffer.append(part)
                while let end=buffer.firstIndex(of:10) {
                    let line=buffer.prefix(upTo:end);buffer.removeSubrange(...end)
                    guard line.count<=65536,let value=try JSONSerialization.jsonObject(with:Data(line)) as? [String:Any] else { throw NativeError("backend_failure") }
                    enqueue(value)
                }
                if buffer.count>65536 { throw NativeError("backend_failure") }
            }
        } catch { enqueue(["type":"invalid"]) }
    }
    func enqueue(_ value: [String:Any]?) {
        commandLock.lock()
        if commandFailed { commandLock.unlock();return }
        if queuedCommands>=64 { commandFailed=true;commandLock.unlock();DispatchQueue.main.async { self.stop("backend_failure") };return }
        queuedCommands+=1;commandLock.unlock()
        DispatchQueue.main.async {
            self.commandLock.lock();self.queuedCommands-=1;self.commandLock.unlock()
            self.locked {
                if self.dead { return }
                guard let value=value else { self.stop(nil);return }
                do { try self.command(value) } catch { self.stop((error as? NativeError)?.code ?? "backend_failure") }
            }
        }
    }
    func command(_ value: [String:Any]) throws {
        guard let kind=value["type"] as? String else { throw NativeError("backend_failure") }
        if kind=="stop" { stop(nil);return }
        if kind=="heartbeat" { lastHeartbeat=milliseconds();return }
        if kind=="configure" {
            guard !configured,let options=value["options"] as? [String:Any],
                  let width=integer(options["width"],320,1920),let fps=integer(options["fps"],1,30),let quality=integer(options["quality"],20,90) else { throw NativeError("backend_failure") }
            for key in ["allowMonitors","allowVirtualDisplay","allowElevated","allowDisplayResize","allowMicrophone","separateCursor"] {
                if boolean(value[key])==true { throw NativeError("unsupported") }
            }
            if boolean(options["deltas"])==true || boolean(options["adaptive"])==true { throw NativeError("unsupported") }
            if let image=options["image"] as? [String:Any] {
                guard image["colorMode"] as? String == "full",let show=boolean(image["showCursor"]) else { throw NativeError("unsupported") };showCursor=show
            }
            self.width=Int(width);self.fps=Int(fps);self.quality=Int(quality);initialFPS=self.fps;initialQuality=self.quality
            inputCeiling=boolean(value["allowInput"])==true && CommandLine.arguments.contains("--allow-input") && AXIsProcessTrusted() && CGPreflightPostEventAccess()
            clipboardCeiling=boolean(value["allowClipboard"])==true && CommandLine.arguments.contains("--allow-clipboard")
            richRequested=boolean(options["richClipboard"])==true
            videoCeiling=boolean(value["allowNativeVideo"])==true
            audioCeiling=videoCeiling && boolean(value["allowSystemAudio"])==true && CommandLine.arguments.contains("--allow-system-audio")
            if videoCeiling { nativeVideo=NativeVideoController(gate:gate,active:{ [weak self] in
                guard let self=self else {return false};let granted=self.ready && self.videoCeiling && self.sourceActive()
                return granted && !self.dead && self.ready && milliseconds()-self.lastHeartbeat<8000
            },emit:{ [weak self] value,valid in guard let self=self else {return};try self.output.send(value,valid:valid ?? {true}) }) }
            configured=true;configuredAt=milliseconds()
            captureTask=Task { @MainActor in await self.capture() }
            return
        }
        guard configured else { throw NativeError("backend_failure") }
        switch kind {
        case "ack":
            guard pending != 0,integer(value["seq"],1,Int64(safeInteger))==pending else { throw NativeError("backend_failure") };pending=0
        case "keyframe":
            if let requested=value["regions"] {
                guard ready,let input=input else { throw NativeError("unsupported") }
                try regions.configure(requested,width:width,height:height);input.revision &+= 1
            }
        case "control","release":
            guard let input=input else { return }
            let keep=input.control
            input.release()
            if kind=="control" { guard let enabled=boolean(value["enabled"]) else { throw NativeError("backend_failure") };input.control=enabled && input.allowed && sourceActive() }
            else { input.control=keep && sourceActive() }
        case "input":
            if let seq=try input?.input(value) { try output.send(["type":"input_ack","seq":seq]) }
        case "native_video","native_video_ack","native_keyframe":
            guard let nativeVideo=nativeVideo else {throw NativeError("unsupported")};try nativeVideo.command(value)
            if let audio=systemAudio,!audioLive(audio.id) {audio.stop()}
        case "native_audio":
            try audioCommand(value)
        case "clipboard_control":
            guard let clipboard=clipboard else { throw NativeError("unsupported") };let old=clipboard.generation;try clipboard.control(value);if clipboard.generation != old { richClipboard?.clear() }
        case "clipboard_rich":
            guard let rich=richClipboard else { throw NativeError("unsupported") };let reply=try rich.evaluate(value);try output.send(reply.value,valid:reply.valid)
        case "clipboard":
            guard let clipboard=clipboard else { throw NativeError("unsupported") }
            let reply=try clipboard.evaluate(value)
            try output.send(reply.value,valid:{ reply.value["text"]==nil || (reply.ticket.map { clipboard.authorized($0) } ?? false) })
        case "policy":
            guard let fps=integer(value["fps"],1,Int64(initialFPS)),let quality=integer(value["quality"],20,Int64(initialQuality)) else { throw NativeError("backend_failure") };self.fps=Int(fps);self.quality=Int(quality)
        default:throw NativeError("backend_failure")
        }
    }
    @MainActor func capture() async {
        do {
            guard CGPreflightScreenCaptureAccess(),sessionActive() else { throw NativeError("permission_denied") }
            let contents=try await SCShareableContent.excludingDesktopWindows(false,onScreenWindowsOnly:true)
            guard !dead else { return }
            let args=CommandLine.arguments
            let requested: UInt32?
            if let i=args.firstIndex(of:"--display-id") {
                guard i+1<args.count,let id=UInt32(args[i+1]) else { throw NativeError("unsupported") };requested=id
            } else { requested=nil }
            guard let selected=contents.displays.first(where:{$0.displayID==(requested ?? CGMainDisplayID())}) else { throw NativeError("source_changed") }
            guard let selectedStamp=displayStamp(selected.displayID) else { throw NativeError("source_changed") }
            display=selected;stamp=selectedStamp;bounds=selectedStamp.bounds
            guard sourceActive() else { throw NativeError("source_changed") }
            let sourceWidth=selectedStamp.pixelWidth,sourceHeight=selectedStamp.pixelHeight
            guard sourceWidth>0,sourceHeight>0,sourceWidth<=32768,sourceHeight<=32768 else { throw NativeError("unsupported") }
            let scale=min(1.0,Double(width)/Double(sourceWidth),2400.0/Double(sourceHeight))
            width=max(1,Int(Double(sourceWidth)*scale));height=max(1,Int(Double(sourceHeight)*scale))
            let configuration=SCStreamConfiguration();configuration.width=width;configuration.height=height;configuration.showsCursor=showCursor
            self.configuration=configuration;filter=SCContentFilter(display:selected,excludingApplications:[],exceptingWindows:[])
            input=InputGuard(sink:QuartzSink(bounds:bounds,active:{ [weak self] in self?.sourceActive()==true }),allowed:inputCeiling,active:{ [weak self] in
                guard let self=self else { return false };return self.ready && milliseconds()-self.lastCapture<1500 && self.sourceActive()
            },releaseAllowed:{ [weak self] in self?.sourceActive()==true })
            clipboard=TextClipboardGuard(sink:PasteboardTextSink(),ceiling:clipboardCeiling,active:{ [weak self] in
                guard let self=self else { return false };return self.ready && milliseconds()-self.lastHeartbeat<8000 && self.sourceActive()
            },canWrite:{ [weak self] in self?.inputCeiling==true && self?.sourceActive()==true })
            if richRequested,let clipboard=clipboard { richClipboard=RichClipboardGuard(clipboard:clipboard,factory:{PasteboardRichSink()}) }
            while !dead && !Task.isCancelled {
                let ticket=locked { FrameTicket(revision:input!.revision,started:milliseconds(),inputSeq:input!.seq) }
                guard sourceActive() else { throw NativeError("source_changed") }
                let image=try await SCScreenshotManager.captureImage(contentFilter:filter!,configuration:configuration)
                guard !dead else { return }
                lastCapture=milliseconds()
                guard image.width==width,image.height==height else { throw NativeError("source_changed") }
                nativeVideo?.offer(image,captured:ticket.started)
                if pending==0 && milliseconds()-lastJPEG>=1000/Double(fps) && canPublish(ticket,revision:input!.revision,now:milliseconds(),active:sourceActive()) {
                    let captureMs=milliseconds()-ticket.started,encodedAt=milliseconds()
                    guard let jpeg=NSBitmapImageRep(cgImage:image).representation(using:.jpeg,properties:[.compressionFactor:Double(quality)/100]),jpeg.count<=2*1024*1024 else { throw NativeError("backend_failure") }
                    let regionProofs=try regions.proofs(image)
                    let encodeMs=milliseconds()-encodedAt
                    try locked {
                        guard canPublish(ticket,revision:input!.revision,now:milliseconds(),active:sourceActive()) else { return }
                        if !ready {
                            ready=true
                            var hello:[String:Any]=["type":"ready","title":"macOS / ScreenCaptureKit / \(selected.displayID)","backend":"macos-sck","width":sourceWidth,"height":sourceHeight,"allowInput":inputCeiling,"allowClipboard":clipboardCeiling,"inputCapabilities":input!.capabilities,"extendedInput":true,"agentRegions":true,"image":["colorMode":"full","showCursor":showCursor]]
                            if richClipboard != nil { hello["richClipboard"]=true }
                            if videoCeiling {hello["nativeVideo"]=true;hello["nativeVideoWindow"]=3;hello["nativeMaxFps"]=60}
                            if audioCeiling {hello["nativeAudio"]=true}
                            try output.send(hello)
                        }
                        guard sequence<Int64(safeInteger) else { throw NativeError("backend_failure") }
                        lastJPEG=milliseconds();sequence+=1;pending=sequence;pendingAt=milliseconds();let seq=sequence
                        var info: [String:Any]=["seq":seq,"width":width,"height":height,"format":"image/jpeg","captureMs":captureMs,"encodeMs":encodeMs,"timing":"measured","sourceInputSeq":ticket.inputSeq]
                        if !regionProofs.isEmpty { info["regions"]=regionProofs }
                        try output.send(["type":"frame","info":info,"data":jpeg.base64EncodedString()],valid:{ [weak self] in
                            self?.publishable(ticket)==true
                        },discarded:{ [weak self] in DispatchQueue.main.async { if self?.pending==seq { self?.pending=0 } } })
                    }
                }
                let delay=max(1.0,1000.0/Double(max(fps,nativeVideo?.captureFPS ?? 0))-(milliseconds()-ticket.started))
                try await Task.sleep(nanoseconds:UInt64(delay*1_000_000))
            }
        } catch { if !dead { stop((error as? NativeError)?.code ?? "backend_failure") } }
    }
    // The IO owner asks the main thread for current OS/session authority; it never calls AppKit itself.
    func audioLive(_ id:String) -> Bool {
        if !Thread.isMainThread {return DispatchQueue.main.sync {self.audioLive(id)}}
        return locked {
            guard !dead,!stopping,ready,videoCeiling,audioCeiling,
                  let video=nativeVideo,let stream=video.current,stream.id==id else {return false}
            let valid=sourceActive() && video.live(stream)
            return valid && !dead && !stopping && ready && videoCeiling && audioCeiling && nativeVideo === video && video.current === stream && !stream.dead && milliseconds()-lastHeartbeat<8000
        }
    }
    func audioCommand(_ value:[String:Any]) throws {
        guard let raw=value["id"] as? String,raw.count==36,let uuid=UUID(uuidString:raw),let enabled=boolean(value["enabled"]) else {throw NativeError("backend_failure")}
        let id=uuid.uuidString.lowercased()
        if !enabled {
            guard Set(value.keys)==Set(["type","id","enabled"]) else {throw NativeError("backend_failure")}
            if systemAudio?.id==id {systemAudio?.stop()};return
        }
        guard Set(value.keys)==Set(["type","id","enabled","pipeName","pipePath","clientPid"]),
              let name=value["pipeName"] as? String,let path=value["pipePath"] as? String,
              let pid=integer(value["clientPid"],2,Int64(Int32.max)) else {throw NativeError("backend_failure")}
        guard audioLive(id),let selectedFilter=filter else {return}
        if let old=systemAudio {guard old.retired else {return};systemAudio=nil}
        systemAudio=NativeSystemAudioActor(id:id,active:{[weak self] in self?.audioLive(id)==true},
            pipe:{try NativePCMParentPipe(path:path,name:name,clientPID:pid_t(pid))},
            producer:{SCKSystemAudioProducer(filter:selectedFilter)},
            fatal:{DispatchQueue.main.async {Darwin.exit(1)}})
    }
    private func finishStopped(_ code:String?) {
        if let audio=systemAudio,!audio.retired,!audio.retirementFailed {
            DispatchQueue.main.asyncAfter(deadline:.now()+0.02) {self.finishStopped(code)};return
        }
        output.finish {Darwin.exit(code==nil ? 0:1)}
    }
    func stop(_ code: String?) {
        locked {
            if dead || stopping { return };stopping=true;systemAudio?.stop();nativeVideo?.stop(notify:false);input?.release();clipboard?.clear();richClipboard?.clear();regions.clear();dead=true;captureTask?.cancel();timer?.invalidate()
            for observer in observers { NSWorkspace.shared.notificationCenter.removeObserver(observer) };observers.removeAll()
            if let code=code { try? output.send(["type":"platform_failure","backend":"macos-sck","code":code]) }
            finishStopped(code)
            DispatchQueue.main.asyncAfter(deadline:.now()+7) { Darwin.exit(1) }
        }
    }
}

final class GeneratedTextClipboard: TextClipboardSink {
    var text="generated clipboard",reads=0,writes=0
    var afterRead: (() -> Void)?
    func read() throws -> String { reads+=1;afterRead?();return text }
    func write(_ text: String) throws { writes+=1;self.text=text }
}
final class GeneratedSink: EventSink {
    var events=[InjectedEvent]()
    func post(_ event: InjectedEvent) throws { events.append(event) }
}
struct GeneratedFailure: Error { let detail: String }
func generatedTests() throws -> Int {
    var count=0
    func check(_ condition: @autoclosure () -> Bool,_ detail: String) throws {
        guard condition() else { throw GeneratedFailure(detail:detail) };count+=1
    }
    try check(integer(true,0,5)==nil,"reject boolean integer")
    let regional=AgentRegionProofs(),regionId=UUID().uuidString.lowercased()
    let spec: [String:Any]=["id":regionId,"x":1,"y":0,"width":2,"height":1]
    try regional.configure([spec],width:4,height:4)
    func generatedImage(_ changed: Int?) throws -> CGImage {
        var pixels=[UInt8](repeating:0,count:64)
        for i in stride(from:3,to:64,by:4) { pixels[i]=255 }
        if let offset=changed { pixels[offset]=255 }
        let data=Data(pixels) as CFData
        guard let provider=CGDataProvider(data:data),let image=CGImage(width:4,height:4,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:16,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue|CGBitmapInfo.byteOrder32Big.rawValue),provider:provider,decode:nil,shouldInterpolate:false,intent:.defaultIntent) else { throw GeneratedFailure(detail:"generated ROI image") }
        return image
    }
    let image=try generatedImage(nil),first=try regional.proofs(image)[0]["digest"] as! String
    try check(first.count==64,"regional SHA256")
    let outside=try regional.proofs(generatedImage(0))[0]["digest"] as! String
    let inside=try regional.proofs(generatedImage(1*4))[0]["digest"] as! String
    try check(first==outside,"regional background remains stable");try check(first != inside,"regional pixel change")
    try regional.configure([spec.merging(["id":UUID().uuidString.lowercased()]) { _,new in new }],width:4,height:4)
    let nonce=try regional.proofs(image)[0]["digest"] as! String;try check(first != nonce,"regional nonce binding")
    var invalidRejected=false
    do { try regional.configure([spec.merging(["x":3]) { _,new in new }],width:4,height:4) } catch { invalidRejected=true }
    try check(invalidRejected && regional.specs.count==1,"regional invalid configuration is atomic")
    regional.clear();try check(regional.specs.isEmpty,"regional cleanup")
    let clipboardSink=GeneratedTextClipboard();var clipboardAlive=true,clipboardNow:Int64=1000,writePermitted=true,clipboardMono:Double=0,writeDelay:Double=0,activeDelay:Double=0
    var clipboardHook: (() -> Void)?
    let clipboard=TextClipboardGuard(sink:clipboardSink,ceiling:true,active:{clipboardMono+=activeDelay;activeDelay=0;let hook=clipboardHook;clipboardHook=nil;hook?();return clipboardAlive},canWrite:{clipboardMono+=writeDelay;return writePermitted},clock:{clipboardNow},monotonic:{clipboardMono})
    func clip(_ id: Int64,_ operation: String,_ owner: Int64=1,_ expires: Int64=1400,_ text: String="copy") -> [String:Any] { ["type":"clipboard","id":id,"operation":operation,"generation":owner,"expiresAt":expires,"text":text] }
    let beforeGrant=try clipboard.request(clip(1,"read"));try check(beforeGrant["ok"] as? Bool==false && clipboardSink.reads==0,"clipboard explicit grant required")
    try clipboard.control(["generation":1,"enabled":true])
    let read=try clipboard.request(clip(1,"read"));try check(read["text"] as? String=="generated clipboard","clipboard granted read")
    let copied=try clipboard.request(clip(2,"write",1,1400,"日本語😀"));try check(copied["ok"] as? Bool==true && clipboardSink.text=="日本語😀","clipboard granted Unicode write")
    let clipboardReplay=try clipboard.request(clip(2,"write"));try check(clipboardReplay["ok"] as? Bool==false && clipboardSink.writes==1,"clipboard request not replayed")
    writePermitted=false;let readOnly=try clipboard.request(clip(3,"write"));try check(readOnly["ok"] as? Bool==false && clipboardSink.writes==1,"clipboard write requires input ceiling")
    writePermitted=true;let oversized=try clipboard.request(clip(4,"write",1,1400,String(repeating:"😀",count:4097)));try check(oversized["ok"] as? Bool==false,"clipboard UTF16 size bound")
    clipboardSink.text=String(repeating:"a",count:8193);let tooMuch=try clipboard.request(clip(5,"read"));try check(tooMuch["ok"] as? Bool==false && tooMuch["text"]==nil,"clipboard oversized read discarded");clipboardSink.text="valid"
    clipboardSink.afterRead={clipboardAlive=false};let lost=try clipboard.request(clip(6,"read"));try check(lost["ok"] as? Bool==false && lost["text"]==nil,"clipboard revoked during read is not published")
    clipboardAlive=true;try clipboard.control(["generation":2,"enabled":true]);clipboardSink.afterRead={clipboardNow=1500};let clipboardExpired=try clipboard.request(clip(7,"read",2));try check(clipboardExpired["ok"] as? Bool==false && clipboardExpired["text"]==nil,"clipboard deadline rechecked after read")
    clipboardNow=1000;clipboardSink.afterRead={clipboardNow=900;clipboardMono=500};let monoExpired=try clipboard.request(clip(8,"read",2));try check(monoExpired["ok"] as? Bool==false && monoExpired["text"]==nil,"clipboard monotonic deadline survives wall clock rollback");clipboardMono=0;clipboardNow=1000;clipboardSink.afterRead=nil;try clipboard.control(["generation":3,"enabled":false]);try clipboard.control(["generation":2,"enabled":true])
    let old=try clipboard.request(clip(9,"read",2));try check(old["ok"] as? Bool==false && !clipboard.enabled,"clipboard generation cannot resurrect")
    try clipboard.control(["generation":4,"enabled":true]);try check(!clipboard.authorized(TextClipboardTicket(owner:1,expires:1400,started:0,deadline:400)),"clipboard queued old generation invalidated");
    let readsBefore=clipboardSink.reads,writesBefore=clipboardSink.writes
    activeDelay=500;let slowRead=try clipboard.request(clip(10,"read",4));try check(slowRead["ok"] as? Bool==false && clipboardSink.reads==readsBefore,"clipboard native source query consumes original read budget")
    activeDelay=0;clipboardMono=0;writeDelay=500;let slowWrite=try clipboard.request(clip(11,"write",4));try check(slowWrite["ok"] as? Bool==false && clipboardSink.writes==writesBefore,"clipboard native write query cannot extend deadline")
    writeDelay=0;clipboardMono=0;let queued=try clipboard.evaluate(clip(12,"read",4));try check(queued.ticket != nil,"clipboard queued read has original ticket")
    activeDelay=500;try check(!clipboard.authorized(queued.ticket!),"clipboard queued publisher rechecks native query time");activeDelay=0
    clipboardMono=0;try clipboard.control(["generation":5,"enabled":true]);let beforeRevokeReads=clipboardSink.reads
    clipboardHook={clipboard.clear()};let revokedQuery=try clipboard.request(clip(13,"read",5));try check(revokedQuery["ok"] as? Bool==false && clipboardSink.reads==beforeRevokeReads,"clipboard source query cannot resurrect revoked grant")
    clipboard.clear();try check(!clipboard.enabled,"clipboard teardown")
    try check(integer(1.5,0,5)==nil,"reject fractional integer")
    try check(boolean(1)==nil,"reject numeric boolean")
    try check(normalized(Double.nan)==nil,"reject nonfinite coordinates")
    let sink=GeneratedSink();var alive=true
    let guardInput=InputGuard(sink:sink,allowed:true,active:{alive})
    func key(_ seq: Int64,_ code: String,_ down: Bool) -> [String:Any] { ["type":"input","seq":seq,"expiresAt":1100,"input":["kind":"key","code":code,"down":down]] }
    let inactive=try guardInput.input(key(1,"KeyA",true),now:1000)
    try check(inactive==nil && sink.events.isEmpty,"explicit control required")
    guardInput.control=true
    _=try guardInput.input(key(1,"ControlLeft",true),now:1000)
    _=try guardInput.input(key(2,"Space",true),now:1000)
    _=try guardInput.input(key(3,"Space",false),now:1000)
    try check(sink.events[1].code==49 && sink.events[1].modifiers.contains(59),"Ctrl+Space stays raw")
    try check(!sink.events[2].down && sink.events[2].modifiers.contains(59),"modifier maintained on keyup")
    let expired=try guardInput.input(key(4,"KeyB",true),now:2000)
    try check(expired==nil && !guardInput.keys.contains(11),"expired input discarded")
    let replay=try guardInput.input(key(2,"KeyB",true),now:1000)
    try check(replay==nil,"input replay discarded")
    let revision=guardInput.revision
    let ticket=FrameTicket(revision:revision,started:1000,inputSeq:guardInput.seq)
    try check(canPublish(ticket,revision:revision,now:1001,active:true),"fresh ticket")
    try check(!canPublish(ticket,revision:revision,now:2000,active:true),"stale ticket")
    try check(!canPublish(ticket,revision:revision,now:999,active:true),"clock rollback")
    try check(!canPublish(ticket,revision:revision,now:1001,active:false),"source revoked")
    guardInput.release()
    try check(!canPublish(ticket,revision:guardInput.revision,now:1001,active:true),"release invalidates queued image")
    try check(guardInput.keys.isEmpty && guardInput.buttons.isEmpty && !guardInput.control,"release clears held state")
    try check(sink.events.last?.code==59 && sink.events.last?.down==false,"release sends modifier up")
    guardInput.control=true
    for button in 0...4 {
        _=try guardInput.input(["type":"input","seq":Int64(10+button),"expiresAt":1100,"input":["kind":"pointer","event":"down","button":button,"x":0.25,"y":0.5]],now:1000)
    }
    try check(guardInput.buttons==[0,1,2,3,4],"five pointer buttons")
    guardInput.release()
    try check(sink.events.suffix(5).allSatisfy{!$0.down},"release all pointer buttons")
    guardInput.control=true;alive=false
    let changed=try guardInput.input(key(30,"KeyA",true),now:1000)
    try check(changed==nil,"source inactive blocks input")
    alive=true;guardInput.allowed=false
    try check(guardInput.capabilities["text"] as? Bool==false,"read-only capability")
    let denied=try guardInput.input(key(31,"KeyA",true),now:1000)
    try check(denied==nil,"read-only injection blocked")
    let unicode=String(repeating:"a",count:19)+"😀日本語"+String(repeating:"🧭",count:40)
    let chunks=unicodeChunks(unicode)
    try check(chunks.allSatisfy{$0.count<=20},"unicode event chunks bounded")
    try check(String(decoding:chunks.flatMap{$0},as:UTF16.self)==unicode,"unicode chunks preserve content")
    try check(chunks.allSatisfy{!($0.last.map{(0xD800...0xDBFF).contains($0)} ?? false)},"unicode never splits surrogate")
    if #available(macOS 14.0, *) {
        var currentFacts=true
        let source=DesktopSource(facts:{currentFacts})
        source.input=InputGuard(sink:GeneratedSink(),allowed:false,active:{false})
        source.configured=true;source.ready=true;source.width=4;source.height=4
        let regionTicket=FrameTicket(revision:source.input!.revision,started:milliseconds(),inputSeq:0)
        try check(source.publishable(regionTicket),"regional capture begins with valid ticket")
        try source.command(["type":"keyframe","regions":[spec]])
        try check(!source.publishable(regionTicket),"regional config invalidates in-flight capture")
        var regionWrites=0
        let regionBefore=writeRecord(Data([1,2,3]),valid:{source.publishable(regionTicket)},clock:milliseconds,attempt:{_ in regionWrites+=1;return .wrote(3)},wait:{})
        try check(regionBefore == .discarded && regionWrites==0,"regional config invalidates queued publication")
        let newTicket=FrameTicket(revision:source.input!.revision,started:milliseconds(),inputSeq:0)
        try check(source.publishable(newTicket),"regional config permits a new capture")
        try source.command(["type":"keyframe","regions":[]])
        try check(!source.publishable(newTicket) && source.regions.specs.isEmpty,"regional clear invalidates capture and authority")
        let ticket=FrameTicket(revision:source.input!.revision,started:milliseconds(),inputSeq:0)
        currentFacts=false;var writes=0
        let before=writeRecord(Data([1,2,3]),valid:{source.publishable(ticket)},clock:milliseconds,attempt:{_ in writes+=1;return .wrote(3)},wait:{})
        try check(before == .discarded && writes==0,"queued source revocation never writes")
        currentFacts=true
        let during=writeRecord(Data([1,2,3]),valid:{source.publishable(ticket)},clock:milliseconds,attempt:{_ in writes+=1;currentFacts=false;return .wrote(1)},wait:{})
        try check(during == .failed && writes==1,"source revoked during partial publication stops record")
    }
    var textActive=true,textEvents=[String]()
    do {
        try postText("first and second generated chunks",expires:2000,active:{textActive},now:{1000},emit:{_,down in textEvents.append(down ? "down":"up");textActive=false},cleanup:{textEvents.append("release")})
        throw GeneratedFailure(detail:"text continued after source revocation")
    } catch is NativeError {}
    try check(textEvents == ["down"],"text revocation posts no further events")
    var textNow:Int64=1000;var expiredEvents=[String]()
    do {
        try postText("expiry",expires:1500,active:{true},now:{textNow},emit:{_,down in expiredEvents.append(down ? "down":"up");textNow=2000},cleanup:{expiredEvents.append("release")})
        throw GeneratedFailure(detail:"text ignored expiration")
    } catch is NativeError {}
    try check(expiredEvents==["down","release"],"expired text releases only in same active source")
    let releaseSink=GeneratedSink();var releaseScope=true
    let releaseGuard=InputGuard(sink:releaseSink,allowed:true,active:{releaseScope})
    releaseGuard.control=true;_ = try releaseGuard.input(key(1,"KeyA",true),now:1000)
    let sent=releaseSink.events.count;releaseScope=false;releaseGuard.release()
    try check(releaseSink.events.count==sent && releaseGuard.keys.isEmpty,"source revocation clears trackers without injection")
    let logical=CGRect(x:0,y:0,width:100,height:100)
    try check(DisplayStamp(bounds:logical,pixelWidth:100,pixelHeight:100) != DisplayStamp(bounds:logical,pixelWidth:200,pixelHeight:200),"retina backing change retires same logical bounds")
    var clock:Double=0
    let blocked=writeRecord(Data([1]),valid:{true},clock:{clock},attempt:{_ in .again},wait:{clock+=501})
    try check(blocked == .failed,"blocked output has a finite deadline")
    guard let bitmap=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:8,pixelsHigh:8,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:32,bitsPerPixel:32),let pixels=bitmap.bitmapData else { throw GeneratedFailure(detail:"generated bitmap allocation") }
    for p in stride(from:0,to:256,by:4) { pixels[p]=0;pixels[p+1]=255;pixels[p+2]=0;pixels[p+3]=255 }
    guard let jpeg=bitmap.representation(using:.jpeg,properties:[.compressionFactor:0.65]),let decoded=NSBitmapImageRep(data:jpeg) else { throw GeneratedFailure(detail:"generated JPEG encode") }
    try check(decoded.pixelsWide==8 && decoded.pixelsHigh==8,"generated JPEG dimensions")
    try check(jpeg.count<2*1024*1024,"generated JPEG bound")
    count += try generatedRichClipboardTests()
    count += try generatedNativeVideoTests()
    count += try generatedNativeAudioTests()
    count += try generatedSystemAudioTests()
    count += try generatedSourceAudioTests()
    return count
}

// Source coupling only: no filter, SCK producer, pipe, window, audio or input is opened.
func generatedSourceAudioTests() throws -> Int {
    var count=0
    func check(_ condition:@autoclosure()->Bool,_ label:String) throws {if !condition() {throw NativePCMError("generated source audio \(label)")};count+=1}
    let id=UUID().uuidString.lowercased(),source=DesktopSource(facts:{true})
    let video=NativeVideoController(gate:source.gate,active:{true},emit:{_,_ in})
    source.nativeVideo=video;source.ready=true;source.videoCeiling=true;source.audioCeiling=true
    try video.command(["type":"native_video","id":id,"enabled":true,"fps":10,"bitrateKbps":2500,"window":1])
    try check(source.audioLive(id),"same video identity")
    try check(!source.audioLive(UUID().uuidString.lowercased()),"foreign video identity")
    source.audioCeiling=false;try check(!source.audioLive(id),"audio ceiling");source.audioCeiling=true
    source.videoCeiling=false;try check(!source.audioLive(id),"video ceiling");source.videoCeiling=true
    source.ready=false;try check(!source.audioLive(id),"ready");source.ready=true
    source.lastHeartbeat=milliseconds()-8001;try check(!source.audioLive(id),"heartbeat");source.lastHeartbeat=milliseconds()
    // A missing selected filter cannot create an actor, even with a matching video.
    try source.audioCommand(["type":"native_audio","id":id,"enabled":true,"pipeName":"unused","pipePath":"/unused","clientPid":Int(getpid())])
    try check(source.systemAudio==nil,"no filter no capture")
    video.stop(notify:false);try check(!source.audioLive(id),"video retirement")
    var changed:DesktopSource!
    changed=DesktopSource(facts:{changed.audioCeiling=false;return true})
    changed.ready=true;changed.audioCeiling=true;changed.videoCeiling=true
    let second=NativeVideoController(gate:changed.gate,active:{true},emit:{_,_ in});changed.nativeVideo=second
    try second.command(["type":"native_video","id":id,"enabled":true,"fps":10,"bitrateKbps":2500,"window":1])
    try check(!changed.audioLive(id),"reentrant permission retirement")
    second.stop(notify:false)
    do {
        let state=GeneratedAudioState(),pipe=GeneratedAudioPipe(GeneratedAudioState()),producer=GeneratedAudioProducer(state)
        let live=DesktopSource(facts:{state.bump(Thread.isMainThread ? "mainFacts":"foreignFacts");return Thread.isMainThread})
        live.ready=true;live.audioCeiling=true;live.videoCeiling=true
        let stream=NativeVideoController(gate:live.gate,active:{true},emit:{_,_ in});live.nativeVideo=stream
        try stream.command(["type":"native_video","id":id,"enabled":true,"fps":10,"bitrateKbps":2500,"window":1])
        producer.stopping={done in DispatchQueue.main.async {state.bump("mainStopCompletion");done(true)}}
        let actor=NativeSystemAudioActor(id:id,active:{[weak live] in live?.audioLive(id)==true},pipe:{pipe},producer:{producer},fatal:{state.bump("fatal")})
        live.systemAudio=actor
        func pump(_ ready:()->Bool) {
            let until=Date().addingTimeInterval(3)
            while !ready() && Date()<until {_=RunLoop.current.run(mode:.default,before:Date().addingTimeInterval(0.005))}
        }
        pump {pipe.state.value("hello")==1}
        try check(pipe.state.value("hello")==1 && state.value("mainFacts")>0 && state.value("foreignFacts")==0,"IO admission observes main-thread source authority")
        stream.stop(notify:false);actor.stop()
        pump {actor.retired}
        try check(actor.retired && !actor.retirementFailed && state.value("mainStopCompletion")==1 && pipe.state.value("pipeClose")==1 && state.value("fatal")==0,"main-queue completion retires background actor and pipe")
    }
    return count
}

func standalone(_ value: [String:Any],exitCode: Int32=0) -> Never {
    if let data=try? JSONSerialization.data(withJSONObject:value,options:[.sortedKeys]) {
        FileHandle.standardOutput.write(data);FileHandle.standardOutput.write(Data([10]))
    }
    Darwin.exit(exitCode)
}
if CommandLine.arguments.contains("--probe") {
    standalone(["backend":"macos-sck","dependencies":ProcessInfo.processInfo.operatingSystemVersion.majorVersion>=14])
}
if CommandLine.arguments.contains("--self-test") {
    do { let count=try generatedTests();standalone(["generatedTests":count,"capture":false,"input":false,"clipboard":false]) }
    catch { standalone(["generatedFailure":String(describing:error)],exitCode:1) }
}
if CommandLine.arguments.contains("--request-screen-permission") {
    standalone(["screenPermission":CGRequestScreenCaptureAccess()])
}
if #available(macOS 14.0, *) {
    _=NSApplication.shared
    NSApplication.shared.setActivationPolicy(.prohibited)
    let source=DesktopSource();source.start();RunLoop.main.run()
} else {
    standalone(["type":"platform_failure","backend":"macos-sck","code":"unsupported"],exitCode:1)
}
