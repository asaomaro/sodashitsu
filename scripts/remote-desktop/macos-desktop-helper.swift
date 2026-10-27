import Foundation
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
final class DesktopSource {
    private let factsOverride: (() -> Bool)?
    init(facts: (() -> Bool)?=nil) { factsOverride=facts }
    let gate=NSRecursiveLock()
    var dead=false,ready=false,stopping=false
    var input: InputGuard?
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
            for key in ["allowNativeVideo","allowClipboard","allowMonitors","allowVirtualDisplay","allowElevated","allowDisplayResize","allowMicrophone","allowSystemAudio","separateCursor"] {
                if boolean(value[key])==true { throw NativeError("unsupported") }
            }
            if boolean(options["deltas"])==true || boolean(options["adaptive"])==true { throw NativeError("unsupported") }
            if let image=options["image"] as? [String:Any] {
                guard image["colorMode"] as? String == "full",let show=boolean(image["showCursor"]) else { throw NativeError("unsupported") };showCursor=show
            }
            self.width=Int(width);self.fps=Int(fps);self.quality=Int(quality);initialFPS=self.fps;initialQuality=self.quality
            inputCeiling=boolean(value["allowInput"])==true && CommandLine.arguments.contains("--allow-input") && AXIsProcessTrusted() && CGPreflightPostEventAccess()
            configured=true;configuredAt=milliseconds()
            captureTask=Task { @MainActor in await self.capture() }
            return
        }
        guard configured else { throw NativeError("backend_failure") }
        switch kind {
        case "ack":
            guard pending != 0,integer(value["seq"],1,Int64(safeInteger))==pending else { throw NativeError("backend_failure") };pending=0
        case "keyframe":break
        case "control","release":
            guard let input=input else { return }
            let keep=input.control
            input.release()
            if kind=="control" { guard let enabled=boolean(value["enabled"]) else { throw NativeError("backend_failure") };input.control=enabled && input.allowed && sourceActive() }
            else { input.control=keep && sourceActive() }
        case "input":
            if let seq=try input?.input(value) { try output.send(["type":"input_ack","seq":seq]) }
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
            while !dead && !Task.isCancelled {
                let ticket=locked { FrameTicket(revision:input!.revision,started:milliseconds(),inputSeq:input!.seq) }
                guard sourceActive() else { throw NativeError("source_changed") }
                let image=try await SCScreenshotManager.captureImage(contentFilter:filter!,configuration:configuration)
                guard !dead else { return }
                lastCapture=milliseconds()
                guard image.width==width,image.height==height else { throw NativeError("source_changed") }
                if pending==0 && canPublish(ticket,revision:input!.revision,now:milliseconds(),active:sourceActive()) {
                    let captureMs=milliseconds()-ticket.started,encodedAt=milliseconds()
                    guard let jpeg=NSBitmapImageRep(cgImage:image).representation(using:.jpeg,properties:[.compressionFactor:Double(quality)/100]),jpeg.count<=2*1024*1024 else { throw NativeError("backend_failure") }
                    let encodeMs=milliseconds()-encodedAt
                    try locked {
                        guard canPublish(ticket,revision:input!.revision,now:milliseconds(),active:sourceActive()) else { return }
                        if !ready {
                            ready=true
                            try output.send(["type":"ready","title":"macOS / ScreenCaptureKit / \(selected.displayID)","backend":"macos-sck","width":sourceWidth,"height":sourceHeight,"allowInput":inputCeiling,"inputCapabilities":input!.capabilities,"extendedInput":true,"image":["colorMode":"full","showCursor":showCursor]])
                        }
                        guard sequence<Int64(safeInteger) else { throw NativeError("backend_failure") }
                        sequence+=1;pending=sequence;pendingAt=milliseconds();let seq=sequence
                        try output.send(["type":"frame","info":["seq":seq,"width":width,"height":height,"format":"image/jpeg","captureMs":captureMs,"encodeMs":encodeMs,"timing":"measured","sourceInputSeq":ticket.inputSeq],"data":jpeg.base64EncodedString()],valid:{ [weak self] in
                            self?.publishable(ticket)==true
                        },discarded:{ [weak self] in DispatchQueue.main.async { if self?.pending==seq { self?.pending=0 } } })
                    }
                }
                let delay=max(1.0,1000.0/Double(fps)-(milliseconds()-ticket.started))
                try await Task.sleep(nanoseconds:UInt64(delay*1_000_000))
            }
        } catch { if !dead { stop((error as? NativeError)?.code ?? "backend_failure") } }
    }
    func stop(_ code: String?) {
        locked {
            if dead || stopping { return };stopping=true;input?.release();dead=true;captureTask?.cancel();timer?.invalidate()
            for observer in observers { NSWorkspace.shared.notificationCenter.removeObserver(observer) };observers.removeAll()
            if let code=code { try? output.send(["type":"platform_failure","backend":"macos-sck","code":code]) }
            output.finish { Darwin.exit(code==nil ? 0 : 1) }
            DispatchQueue.main.asyncAfter(deadline:.now()+1.5) { Darwin.exit(1) }
        }
    }
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
        let ticket=FrameTicket(revision:0,started:milliseconds(),inputSeq:0)
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
