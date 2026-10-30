#!/usr/bin/python3
"""One explicit portal session. Probe/import/tests never open a display or inject input."""
import base64
import hashlib
import json
import math
import os
import queue
import select
import signal
import sys
import threading
import time
import uuid
import importlib.util
from pathlib import Path

_native_spec=importlib.util.spec_from_file_location("soda_owned_native_video",Path(__file__).with_name("linux-native-video.py"))
_native_video=importlib.util.module_from_spec(_native_spec)
_native_spec.loader.exec_module(_native_video)

KEYS = dict(zip(["Escape", *[f"Digit{i}" for i in range(1, 10)], "Digit0", "Minus", "Equal", "Backspace", "Tab"], range(1, 16)))
KEYS.update(dict(zip([f"Key{c}" for c in "QWERTYUIOP"], range(16, 26))))
KEYS.update({"BracketLeft":26,"BracketRight":27,"Enter":28,"ControlLeft":29,"Semicolon":39,"Quote":40,"Backquote":41,"ShiftLeft":42,"Backslash":43,"Comma":51,"Period":52,"Slash":53,"ShiftRight":54,"NumpadMultiply":55,"AltLeft":56,"Space":57,"CapsLock":58,"NumLock":69,"ScrollLock":70,"NumpadSubtract":74,"NumpadAdd":78,"NumpadDecimal":83,"ZenkakuHankaku":85,"IntlBackslash":86,"F11":87,"F12":88,"IntlRo":89,"Lang3":90,"Lang4":91,"Convert":92,"KanaMode":93,"NonConvert":94,"NumpadEnter":96,"ControlRight":97,"NumpadDivide":98,"PrintScreen":99,"AltRight":100,"Home":102,"ArrowUp":103,"PageUp":104,"ArrowLeft":105,"ArrowRight":106,"End":107,"ArrowDown":108,"PageDown":109,"Insert":110,"Delete":111,"AudioVolumeMute":113,"AudioVolumeDown":114,"AudioVolumeUp":115,"NumpadEqual":117,"Pause":119,"NumpadComma":121,"IntlYen":124,"MetaLeft":125,"MetaRight":126,"ContextMenu":127,"BrowserStop":128,"MediaStop":166,"MediaPlayPause":164,"MediaTrackNext":163,"MediaTrackPrevious":165,"LaunchMail":155,"BrowserFavorites":156,"BrowserBack":158,"BrowserForward":159,"BrowserRefresh":173,"BrowserHome":172,"BrowserSearch":217,"MediaSelect":226})
KEYS.update(dict(zip([f"Key{c}" for c in "ASDFGHJKL"], range(30, 39))))
KEYS.update(dict(zip([f"Key{c}" for c in "ZXCVBNM"], range(44, 51))))
KEYS.update({f"F{i}":58+i for i in range(1,11)})
KEYS.update({f"F{i}":170+i for i in range(13,25)})
KEYS.update(dict(zip(["Numpad7","Numpad8","Numpad9","Numpad4","Numpad5","Numpad6","Numpad1","Numpad2","Numpad3","Numpad0"],[71,72,73,75,76,77,79,80,81,82])))
BUTTONS = [272,274,273,275,276]

class NativeFailure(Exception):
    def __init__(self, code): self.code=code

def integer(value, low, high):
    return isinstance(value,int) and not isinstance(value,bool) and low<=value<=high

def finite(value, low, high):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and low<=value<=high

class InputGuard:
    """All methods use an injected notify function; generated tests call no OS API."""
    def __init__(self, notify, alive, dimensions, node, devices, clock=None):
        self.notify=notify;self.alive=alive;self.dimensions=dimensions;self.node=node;self.devices=devices
        self.clock=clock or (lambda:time.time()*1000);self.control=False;self.held_keys=set();self.held_buttons=set();self.revision=0;self.seq=0
    def capabilities(self):
        return {"keys":sorted(KEYS) if self.devices&1 else [],"text":bool(self.devices&1),"pointerButtons":list(range(5)) if self.devices&2 else [],"wheel":bool(self.devices&2)}
    def call(self, method, signature, *args):
        if not self.alive(): raise NativeFailure("source_changed")
        self.notify(method,signature,args)
        if not self.alive(): raise NativeFailure("source_changed")
    def release(self):
        self.revision+=1
        if self.alive():
            for code in list(self.held_keys): self.call("NotifyKeyboardKeycode","iu",code,0)
            for code in list(self.held_buttons): self.call("NotifyPointerButton","iu",code,0)
        self.held_keys.clear();self.held_buttons.clear();self.control=False
    def input(self, message):
        seq=message.get("seq");expiry=message.get("expiresAt");value=message.get("input")
        if not self.control or not self.alive() or not integer(seq,1,9007199254740991) or seq<=self.seq or not finite(expiry,self.clock(),self.clock()+1000) or not isinstance(value,dict): return False
        kind=value.get("kind");plan=[]
        if kind=="key" and self.devices&1:
            code=KEYS.get(value.get("code"));down=value.get("down")
            if code is None or not isinstance(down,bool) or set(value)!={"kind","code","down"}:return False
            plan=[("NotifyKeyboardKeycode","iu",code,int(down))]
        elif kind=="pointer" and self.devices&2:
            if set(value)!={"kind","x","y","event","button"} or not finite(value["x"],0,1) or not finite(value["y"],0,1) or value["event"] not in ["move","down","up"] or not integer(value["button"],0,4):return False
            width,height=self.dimensions
            plan=[("NotifyPointerMotionAbsolute","udd",self.node,value["x"]*max(0,width-1),value["y"]*max(0,height-1))]
            if value["event"]!="move":plan.append(("NotifyPointerButton","iu",BUTTONS[value["button"]],int(value["event"]=="down")))
        elif kind=="wheel" and self.devices&2:
            if set(value)!={"kind","delta"} or not integer(value["delta"],-1200,1200):return False
            plan=[("NotifyPointerAxis","dd",0.0,-float(value["delta"])/120*15)]
        elif kind=="text" and self.devices&1:
            text=value.get("text")
            if set(value)!={"kind","text"} or not isinstance(text,str) or not text or len(text.encode("utf-16-le",errors="surrogatepass"))>2048 or any(ord(c)<32 and c not in "\r\n\t" or 0xd800<=ord(c)<=0xdfff or ord(c)==127 for c in text):return False
            if self.held_keys.intersection([29,97,42,54,56,100,125,126]):return False
            for char in text:
                number=ord(char);sym={10:0xff0d,13:0xff0d,9:0xff09}.get(number,number if number<256 else 0x1000000+number)
                plan.extend([("NotifyKeyboardKeysym","iu",sym,1),("NotifyKeyboardKeysym","iu",sym,0)])
        else:return False
        self.revision+=1
        for method,signature,*args in plan:
            if self.clock()>expiry and not (method=="NotifyKeyboardKeysym" and args[-1]==0): self.release();return False
            self.call(method,signature,*args)
            if method=="NotifyKeyboardKeycode":
                if args[-1]:self.held_keys.add(args[0])
                else:self.held_keys.discard(args[0])
            elif method=="NotifyPointerButton":
                if args[-1]:self.held_buttons.add(args[0])
                else:self.held_buttons.discard(args[0])
        self.seq=seq;return True

class LoginScope:
    """Read-only logind identity fence. No lock/unlock, activation or device takeover."""
    def __init__(self,Gio,GLib,connection=None,uid=None,gate=None):
        self.Gio=Gio;self.GLib=GLib;self.uid=os.getuid() if uid is None else uid;self.valid=True;self.gate=gate or threading.RLock();self.subscriptions=[];self.invalidated=threading.Event();self.filter_id=None
        self.connection=connection if connection is not None else Gio.bus_get_sync(Gio.BusType.SYSTEM,None)
        self.owner=self.connection.call_sync("org.freedesktop.DBus","/org/freedesktop/DBus","org.freedesktop.DBus","GetNameOwner",GLib.Variant("(s)",("org.freedesktop.login1",)),GLib.VariantType.new("(s)"),Gio.DBusCallFlags.NONE,100,None).unpack()[0]
        user=self.connection.call_sync(self.owner,"/org/freedesktop/login1","org.freedesktop.login1.Manager","GetUser",GLib.Variant("(u)",(self.uid,)),GLib.VariantType.new("(o)"),Gio.DBusCallFlags.NONE,100,None).unpack()[0]
        display=self.properties(user,"org.freedesktop.login1.User").get("Display")
        if not isinstance(display,(tuple,list)) or len(display)!=2 or not display[0] or not display[1].startswith("/org/freedesktop/login1/session/"):raise NativeFailure("unsupported")
        self.session_id,self.path=display
        # Subscribe before the first snapshot. A filter observes invalidating
        # messages on GIO's I/O thread, before queued main-context callbacks and
        # before a later GetAll reply. Never block or make D-Bus calls here.
        if hasattr(self.connection,"add_filter"):
            def observe(_connection,message,incoming,*_):
                if incoming and message.get_message_type()==Gio.DBusMessageType.SIGNAL and message.get_sender()==self.owner and message.get_path()==self.path and message.get_interface()=="org.freedesktop.DBus.Properties" and message.get_member()=="PropertiesChanged":
                    try:
                        interface,values,invalidated=message.get_body().unpack()
                        if interface=="org.freedesktop.login1.Session" and self.changed(values,invalidated):self.invalidated.set()
                    except Exception:self.invalidated.set()
                return message
            self.filter_id=self.connection.add_filter(observe,None)
        if hasattr(self.connection,"signal_subscribe"):
            # Also installs the bus match rule; the filter alone is not a match.
            self.subscriptions.append(self.connection.signal_subscribe(self.owner,"org.freedesktop.DBus.Properties","PropertiesChanged",self.path,None,Gio.DBusSignalFlags.NONE,lambda *_:None))
        if not self.alive():raise NativeFailure("source_changed")
    def changed(self,values,invalidated):
        security={"Active","LockedHint","User","Id","Class","Type"}
        return bool(security.intersection(invalidated) or values.get("Active") is False or values.get("LockedHint") is True or "User" in values and values["User"][0]!=self.uid or "Id" in values and values["Id"]!=self.session_id or "Class" in values and values["Class"]!="user" or "Type" in values and values["Type"] not in ["wayland","x11"])
    def close(self):
        self.invalidated.set()
        with self.gate:self.valid=False
        if self.filter_id is not None:self.connection.remove_filter(self.filter_id);self.filter_id=None
        for sub in self.subscriptions:self.connection.signal_unsubscribe(sub)
        self.subscriptions=[]
    def properties(self,path,interface):
        return self.connection.call_sync(self.owner,path,"org.freedesktop.DBus.Properties","GetAll",self.GLib.Variant("(s)",(interface,)),None,self.Gio.DBusCallFlags.NONE,100,None).unpack()[0]
    def alive(self):
        if not self.valid or self.invalidated.is_set():return False
        try:
            props=self.properties(self.path,"org.freedesktop.login1.Session");user=props.get("User")
            if props.get("Id")!=self.session_id or not isinstance(user,(tuple,list)) or user[0]!=self.uid or props.get("Active") is not True or props.get("LockedHint") is not False or props.get("Type") not in ["wayland","x11"] or props.get("Class")!="user":self.valid=False
        except Exception:self.valid=False
        return self.valid and not self.invalidated.is_set()

class RegionProofs:
    """Bounded raw BGR evidence, paired to JPEG by source PTS, never retained pixels."""
    def __init__(self):
        self.lock=threading.RLock();self.specs=[];self.frames={};self.generation=0
    def configure(self,items,width,height):
        if not isinstance(items,list) or len(items)>8:raise NativeFailure("unsupported")
        next_specs=[];ids=set()
        for spec in items:
            if not isinstance(spec,dict) or set(spec)!={"id","x","y","width","height"}:raise NativeFailure("unsupported")
            identifier=spec["id"]
            try:canonical=str(uuid.UUID(identifier)) if isinstance(identifier,str) else None
            except (ValueError,AttributeError):raise NativeFailure("unsupported")
            if canonical!=identifier or identifier in ids:raise NativeFailure("unsupported")
            x,y,w,h=[spec[key] for key in ["x","y","width","height"]]
            if not integer(x,0,4095) or not integer(y,0,2399) or not integer(w,1,4096) or not integer(h,1,2400) or w*h>1048576 or x+w>width or y+h>height:raise NativeFailure("unsupported")
            ids.add(identifier);next_specs.append(dict(spec))
        with self.lock:self.specs=next_specs;self.frames.clear();self.generation+=1
    def capture(self,pts,pixels,width,height,stride,offset=0):
        with self.lock:
            if not self.specs:return
            if not integer(width,1,4096) or not integer(height,1,2400) or width*height>8000000 or not integer(stride,width*3,32768) or not integer(offset,0,len(pixels)) or offset+(height-1)*stride+width*3>len(pixels):raise NativeFailure("backend_failure")
            result=[]
            for r in self.specs:
                if r["x"]+r["width"]>width or r["y"]+r["height"]>height:raise NativeFailure("source_changed")
                prefix=f"{r['id']}:{width}:{height}:{r['x']}:{r['y']}:{r['width']}:{r['height']}:".encode("ascii");digest=hashlib.sha256(prefix)
                for y in range(r["y"],r["y"]+r["height"]):
                    start=offset+y*stride+r["x"]*3;digest.update(pixels[start:start+r["width"]*3])
                result.append({**r,"digest":digest.hexdigest()})
            self.frames[pts]=(width,height,self.generation,result)
            while len(self.frames)>8:del self.frames[next(iter(self.frames))]
    def take(self,pts,width,height):
        with self.lock:
            value=self.frames.pop(pts,None)
            return value[3] if value and value[:3]==(width,height,self.generation) else None
    def clear(self):
        with self.lock:self.specs=[];self.frames.clear();self.generation+=1

class RichClipboardProtocol:
    """One bounded transaction on the parent's explicit clipboard grant. No OS calls here."""
    BUNDLE=4*1024*1024;TEXT=512*1024;PNG=2*1024*1024;CHUNK=16*1024
    def __init__(self,parent):
        self.parent=parent;self.current=None;self.retired=[];self.cancelled=[];self.publications=[]
    @staticmethod
    def uuid(value):
        try:return isinstance(value,str) and len(value)==36 and str(uuid.UUID(value))==value.lower()
        except Exception:return False
    @staticmethod
    def binary(value,limit):
        if not isinstance(value,str) or len(value)>((limit+2)//3)*4:raise NativeFailure("backend_failure")
        data=base64.b64decode(value,validate=True)
        if len(data)>limit or base64.b64encode(data).decode("ascii")!=value:raise NativeFailure("backend_failure")
        return data
    @classmethod
    def bundle(cls,value):
        if not isinstance(value,dict) or not value or any(k not in ("text","html","rtf","png") for k in value):raise NativeFailure("unsupported")
        for key,item in value.items():
            if key in ("text","html"):
                if not isinstance(item,str) or "\0" in item or len(item.encode("utf-8"))>cls.TEXT:raise NativeFailure("backend_failure")
            elif key=="rtf":
                data=cls.binary(item,cls.TEXT)
                if not data.startswith(b"{\\rtf") or not data.rstrip(b"\t\r\n ").endswith(b"}"):raise NativeFailure("backend_failure")
            else:
                data=cls.binary(item,cls.PNG)
                if len(data)<33 or data[:8]!=b"\x89PNG\r\n\x1a\n" or data[8:16]!=b"\0\0\0\rIHDR":raise NativeFailure("backend_failure")
                width=int.from_bytes(data[16:20],"big");height=int.from_bytes(data[20:24],"big")
                if not 1<=width<=4096 or not 1<=height<=4096 or width*height>8000000:raise NativeFailure("backend_failure")
        return value
    def finish(self,cancel=False):
        c=self.current;self.current=None
        if c:
            c["cancelled"]=c["cancelled"] or cancel
            if c["data"] is not None:c["data"][:]=b"\0"*len(c["data"]);c["data"]=None
            self.retired=(self.retired+[c["id"]])[-32:]
    def expire(self):
        with self.parent.helper.output_gate:
            c=self.current
            if c and (self.parent.mono()-c["last"]>5000 or self.parent.mono()-c["started"]>60000 or not self.parent.scope() or c["generation"]!=self.parent.generation):self.finish(True)
    def live(self,c,ticket,write=False):
        p=self.parent;allowed=p.can_write(ticket) if write else p.authorized(ticket);now=p.mono()
        return allowed and self.current is c and not c["cancelled"] and c["generation"]==ticket[0]==p.generation and p.enabled and not p.closed and ticket[2]<=now<=ticket[3] and c["started"]<=now<=c["started"]+60000 and c["last"]<=now<=c["last"]+5000 and c["version"]==p.owner_version
    def witness(self,c,ticket):
        if not any(item is c for item in self.publications):
            self.publications.append(c)
            if len(self.publications)>32:self.publications.pop(0)["cancelled"]=True
        def publish():
            p=self.parent;allowed=p.authorized(ticket);now=p.mono()
            return allowed and not c["cancelled"] and c["id"] not in self.cancelled and c["generation"]==ticket[0]==p.generation and p.enabled and not p.closed and ticket[2]<=now<=ticket[3] and c["started"]<=now<=c["started"]+60000 and c["last"]<=now<=c["last"]+5000 and (not c["read"] or c["version"]==p.owner_version)
        return publish
    def cancel(self,value,ticket):
        identifier=value.get("id")
        with self.parent.helper.output_gate:
            if value.get("type")!="clipboard_rich" or value.get("operation")!="cancel" or set(value)!={"type","id","operation","generation","expiresAt"} or not self.uuid(identifier) or not self.parent.authorized(ticket):raise NativeFailure("permission_denied")
            for c in self.publications:
                if c["id"]==identifier:c["cancelled"]=True
            self.cancelled=(self.cancelled+[identifier])[-32:]
            if self.current and self.current["id"]==identifier:self.finish(True)
        return {"type":"clipboard_rich_result","id":identifier,"ok":True,"stage":"cancelled"},None
    def request(self,value,ticket):
        p=self.parent;identifier=value.get("id");operation=value.get("operation")
        base={"type","id","operation","generation","expiresAt"}
        suffix={"read":set(),"begin":{"size"},"pull":{"offset"},"push":{"offset","data"},"commit":set()}
        if value.get("type")!="clipboard_rich" or operation not in suffix or set(value)!=base|suffix[operation] or not self.uuid(identifier):raise NativeFailure("backend_failure")
        with p.helper.output_gate:
            self.expire()
            if identifier in self.cancelled or not p.authorized(ticket):raise NativeFailure("permission_denied")
            if operation in ("read","begin"):
                if self.current or identifier in self.retired:raise NativeFailure("backend_failure")
                size=value.get("size",0)
                if operation=="begin" and (not integer(size,1,self.BUNDLE) or not p.can_write(ticket)):raise NativeFailure("permission_denied")
                c={"id":identifier,"generation":ticket[0],"read":operation=="read","version":p.owner_version,"started":p.mono(),"last":p.mono(),"data":None,"offset":0,"cancelled":False}
                self.current=c
            else:c=self.current
            if not c or c["id"]!=identifier or not self.live(c,ticket):raise NativeFailure("source_changed")
            c["last"]=p.mono()
        if operation=="read":
            value=self.bundle(p.read_rich(ticket))
            data=bytearray(json.dumps(value,ensure_ascii=False,separators=(",",":")).encode("utf-8"))
            with p.helper.output_gate:
                if not 1<=len(data)<=self.BUNDLE or not self.live(c,ticket):data[:]=b"\0"*len(data);raise NativeFailure("source_changed")
                c["data"]=data
        with p.helper.output_gate:
            if not self.live(c,ticket):raise NativeFailure("source_changed")
            reply={"type":"clipboard_rich_result","id":identifier,"ok":True}
            witness=self.witness(c,ticket)
            if operation in ("read","begin"):
                if operation=="begin":c["data"]=bytearray(size)
                return {**reply,"stage":"begin","size":len(c["data"])},witness
            data=c["data"]
            if data is None:raise NativeFailure("backend_failure")
            if operation in ("pull","push"):
                offset=value.get("offset")
                if not integer(offset,0,self.BUNDLE) or offset!=c["offset"]:raise NativeFailure("backend_failure")
                if operation=="pull":
                    if not c["read"] or offset>=len(data):raise NativeFailure("backend_failure")
                    chunk=base64.b64encode(data[offset:offset+self.CHUNK]).decode("ascii");c["offset"]+=min(self.CHUNK,len(data)-offset)
                    result={**reply,"stage":"chunk","offset":c["offset"],"data":chunk}
                    if c["offset"]==len(data):self.finish()
                    return result,witness
                chunk=self.binary(value.get("data"),self.CHUNK)
                if c["read"] or not chunk or offset+len(chunk)>len(data):raise NativeFailure("backend_failure")
                data[offset:offset+len(chunk)]=chunk;c["offset"]+=len(chunk)
                return {**reply,"stage":"chunk","offset":c["offset"]},witness
            if c["read"] or c["offset"]!=len(data) or not self.live(c,ticket,True):raise NativeFailure("permission_denied")
            bundle=self.bundle(json.loads(bytes(data).decode("utf-8")))
            if not self.live(c,ticket):raise NativeFailure("source_changed")
            p.write_rich(bundle,ticket,c["version"],lambda:self.live(c,ticket,True))
            if not p.authorized(ticket) or c["cancelled"]:raise NativeFailure("source_changed")
            self.finish()
            return {**reply,"stage":"done"},witness

class PortalTextClipboard:
    """One portal session, bounded UTF8 pipe transfers, no clipboard access in probe/tests."""
    INTERFACE="org.freedesktop.portal.Clipboard"
    MIMES=("text/plain;charset=utf-8","text/plain")
    def __init__(self,helper,clock=None,mono=None):
        self.helper=helper;self.session=helper.session;self.clock=clock or (lambda:time.time()*1000);self.mono=mono or (lambda:time.monotonic()*1000)
        self.os_enabled=False;self.enabled=False;self.generation=0;self.last_id=0;self.busy=False;self.closed=False
        self.types=None;self.owned=None;self.owned_formats={};self.owner=False;self.owner_version=0;self.transfers=threading.BoundedSemaphore(4);self.rich=RichClipboardProtocol(self)
    def scope(self):
        h=self.helper
        return not self.closed and self.os_enabled and not h.dead and h.ready and h.session==self.session and h.scope is not None and h.scope.alive() and time.monotonic()-h.last_heartbeat<8
    def authorized(self,ticket):
        owner,expires,started,deadline=ticket
        with self.helper.output_gate:
            if not self.enabled or owner!=self.generation:return False
            alive=self.scope();utc=self.clock();now=self.mono()
            if not alive and owner==self.generation:self.enabled=False
            return alive and self.enabled and owner==self.generation and utc<=expires and started<=now<=deadline
    def control(self,value):
        generation=value.get("generation");enabled=value.get("enabled")
        if not integer(generation,1,9007199254740991) or not isinstance(enabled,bool):raise NativeFailure("backend_failure")
        with self.helper.output_gate:
            if generation<=self.generation:return
            self.generation=generation;self.enabled=False;self.rich.finish(True)
            alive=enabled and self.scope()
            if self.generation==generation:self.enabled=alive
    def call(self,method,signature,args,fd=False):
        h=self.helper;variant=h.GLib.Variant("(o"+signature+")",(self.session,*args))
        if not fd:return h.connection.call_sync(h.NAME,h.PATH,self.INTERFACE,method,variant,None,h.Gio.DBusCallFlags.NONE,100,None)
        reply,fds=h.connection.call_with_unix_fd_list_sync(h.NAME,h.PATH,self.INTERFACE,method,variant,h.GLib.VariantType.new("(h)"),h.Gio.DBusCallFlags.NONE,100,None,None)
        index=reply.unpack()[0]
        if not integer(index,0,fds.get_length()-1):raise NativeFailure("backend_failure")
        return fds.get(index)
    def owner_changed(self,_connection,_sender,_path,_interface,_signal,parameters):
        session,options=parameters.unpack()
        if session!=self.session:return
        types=options.get("mime_types");owner=options.get("session_is_owner")
        if not isinstance(types,(tuple,list)) or len(types)>64 or any(not isinstance(t,str) or len(t)>128 for t in types) or not isinstance(owner,bool):return
        with self.helper.output_gate:
            if self.closed or self.helper.dead or self.helper.session!=self.session:return
            self.types=tuple(types);self.owner=owner;self.owner_version+=1
            self.rich.finish(True)
            if not owner:self.forget_owned()
    def forget_owned(self):
        if self.owned is not None:self.owned[:]=b"\0"*len(self.owned)
        for data in self.owned_formats.values():data[:]=b"\0"*len(data)
        self.owned=None;self.owned_formats={}
    def read(self,ticket):
        with self.helper.output_gate:
            if not self.authorized(ticket):raise NativeFailure("permission_denied")
            if self.owner and self.owned is not None:return self.owned.decode("utf-8")
            available=self.types;version=self.owner_version
            mime=next((t for t in self.MIMES if available is None or t in available),None)
            if mime is None:return ""
        fd=self.call("SelectionRead","s",(mime,),fd=True);data=bytearray()
        try:
            os.set_blocking(fd,False)
            while self.authorized(ticket):
                remaining=(ticket[3]-self.mono())/1000
                if remaining<=0:break
                if not select.select([fd],[],[],min(.025,remaining))[0]:continue
                if not self.authorized(ticket):break
                chunk=os.read(fd,min(4096,32769-len(data)))
                if not chunk:
                    text=data.decode("utf-8")
                    with self.helper.output_gate:
                        if self.owner_version!=version or not self.authorized(ticket) or len(text.encode("utf-16-le"))>16384:raise NativeFailure("source_changed")
                    return text
                data.extend(chunk)
                if len(data)>32768:raise NativeFailure("backend_failure")
            raise NativeFailure("source_changed")
        finally:
            os.close(fd);data[:]=b"\0"*len(data)
    def write(self,text,ticket):
        h=self.helper
        with h.output_gate:
            if not h.config["input"] or not h.guard or not h.guard.devices or not self.authorized(ticket):raise NativeFailure("permission_denied")
            self.forget_owned();self.owned=bytearray(text.encode("utf-8"));self.owner=True;self.owner_version+=1
            version=self.owner_version
            try:
                self.call("SetSelection","a{sv}",({"mime_types":h.GLib.Variant("as",list(self.MIMES))},))
                if not self.authorized(ticket):raise NativeFailure("source_changed")
            except Exception:
                if self.owner_version==version:self.forget_owned();self.owner=False
                raise
    def can_write(self,ticket):
        h=self.helper
        allowed=self.authorized(ticket)
        return bool(allowed and h.config["input"] and h.guard and h.guard.devices)
    def rich_bytes(self,mime,limit,ticket):
        with self.helper.output_gate:
            if not self.authorized(ticket):raise NativeFailure("permission_denied")
            version=self.owner_version
            if self.owner:
                owned=self.owned_formats.get(mime)
                if owned is None and mime in self.MIMES:owned=self.owned
                if owned is not None:
                    if len(owned)>limit:raise NativeFailure("backend_failure")
                    return bytes(owned)
        fd=self.call("SelectionRead","s",(mime,),fd=True);data=bytearray()
        try:
            os.set_blocking(fd,False)
            while self.authorized(ticket):
                remaining=(ticket[3]-self.mono())/1000
                if remaining<=0:break
                if not select.select([fd],[],[],min(.025,remaining))[0]:continue
                if not self.authorized(ticket):break
                chunk=os.read(fd,min(65536,limit+1-len(data)))
                if not chunk:
                    with self.helper.output_gate:
                        if self.owner_version!=version or not self.authorized(ticket):raise NativeFailure("source_changed")
                    return bytes(data)
                data.extend(chunk)
                if len(data)>limit:raise NativeFailure("backend_failure")
            raise NativeFailure("source_changed")
        finally:os.close(fd);data[:]=b"\0"*len(data)
    def read_rich(self,ticket):
        with self.helper.output_gate:
            if not self.authorized(ticket):raise NativeFailure("permission_denied")
            available=self.types;version=self.owner_version
        fields=[("text",self.MIMES,RichClipboardProtocol.TEXT),("html",("text/html",),RichClipboardProtocol.TEXT),("rtf",("application/rtf","text/rtf"),RichClipboardProtocol.TEXT),("png",("image/png",),RichClipboardProtocol.PNG)]
        bundle={}
        for key,mimes,limit in fields:
            mime=next((m for m in mimes if (available is None and key=="text") or (available is not None and m in available)),None)
            if mime is None:continue
            data=self.rich_bytes(mime,limit,ticket)
            bundle[key]=data.decode("utf-8") if key in ("text","html") else base64.b64encode(data).decode("ascii")
            with self.helper.output_gate:
                if self.owner_version!=version or not self.authorized(ticket):raise NativeFailure("source_changed")
        return RichClipboardProtocol.bundle(bundle)
    def write_rich(self,bundle,ticket,expected,valid):
        formats={};committed=False
        try:
            for key,value in bundle.items():
                mimes=self.MIMES if key=="text" else {"html":("text/html",),"rtf":("application/rtf","text/rtf"),"png":("image/png",)}[key]
                data=bytearray(value.encode("utf-8") if key in ("text","html") else RichClipboardProtocol.binary(value,RichClipboardProtocol.PNG if key=="png" else RichClipboardProtocol.TEXT))
                for mime in mimes:formats[mime]=data
            with self.helper.output_gate:
                if not valid() or self.owner_version!=expected:raise NativeFailure("source_changed")
                self.call("SetSelection","a{sv}",({"mime_types":self.helper.GLib.Variant("as",list(formats))},))
                if self.owner_version!=expected:raise NativeFailure("source_changed")
                self.forget_owned();self.owned_formats=formats;self.owned=formats.get(self.MIMES[0]);self.owner=True;self.types=tuple(formats);self.owner_version+=1;committed=True
                if not self.authorized(ticket):raise NativeFailure("source_changed")
        finally:
            if not committed:
                for data in formats.values():data[:]=b"\0"*len(data)
    def submit_rich(self,value):
        started=self.mono();utc=self.clock();identifier=value.get("id");owner=value.get("generation");expires=value.get("expiresAt")
        if not RichClipboardProtocol.uuid(identifier):raise NativeFailure("backend_failure")
        failure={"type":"clipboard_rich_result","id":identifier,"ok":False,"stage":"done"}
        ticket=(owner,expires,started,started+(expires-utc)) if finite(expires,utc,utc+1500) and integer(owner,1,9007199254740991) else None
        with self.helper.output_gate:
            if ticket is None or not self.helper.config.get("rich") or not self.authorized(ticket):self.helper.output(failure);return
            if value.get("operation")=="cancel":
                try:result,_=self.rich.cancel(value,ticket);self.helper.output(result)
                except Exception:self.helper.output(failure)
                return
            if self.busy:self.helper.output(failure);return
            self.busy=True
        def worker():
            result=failure;publish=None
            try:result,publish=self.rich.request(value,ticket)
            except Exception:
                with self.helper.output_gate:
                    if self.rich.current and self.rich.current["id"]==identifier:self.rich.finish(True)
            finally:
                with self.helper.output_gate:
                    self.busy=False
                    if publish and not publish():result=failure;publish=None
                    self.helper.output(result,publish=publish)
        try:threading.Thread(target=worker,daemon=True).start()
        except Exception:
            with self.helper.output_gate:self.busy=False;self.rich.finish(True);self.helper.output(failure)
    def submit(self,value):
        started=self.mono();utc=self.clock();identifier=value.get("id");owner=value.get("generation");expires=value.get("expiresAt");operation=value.get("operation")
        if not integer(identifier,1,9007199254740991):raise NativeFailure("backend_failure")
        failure={"type":"clipboard_result","id":identifier,"ok":False}
        ticket=(owner,expires,started,started+(expires-utc)) if finite(expires,utc,utc+1500) and integer(owner,1,9007199254740991) else None
        with self.helper.output_gate:
            if ticket is None or self.busy or identifier<=self.last_id or not self.authorized(ticket):self.helper.output(failure);return
            self.last_id=identifier;self.busy=True
        def worker():
            result=failure
            try:
                if operation=="read":
                    text=self.read(ticket)
                    if self.authorized(ticket) and len(text.encode("utf-16-le"))<=16384:result={"type":"clipboard_result","id":identifier,"ok":True,"text":text}
                elif operation=="write":
                    text=value.get("text")
                    if isinstance(text,str) and len(text.encode("utf-16-le"))<=16384:self.write(text,ticket);result={"type":"clipboard_result","id":identifier,"ok":True}
            except Exception:pass
            finally:
                with self.helper.output_gate:
                    self.busy=False
                    if "text" in result and not self.authorized(ticket):result=failure
                    self.helper.output(result,publish=lambda:"text" not in result or self.authorized(ticket))
        try:threading.Thread(target=worker,daemon=True).start()
        except Exception:
            with self.helper.output_gate:self.busy=False;self.helper.output(failure)
    def transfer(self,_connection,_sender,_path,_interface,_signal,parameters):
        session,mime,serial=parameters.unpack()
        if session!=self.session or not integer(serial,0,0xffffffff):return
        with self.helper.output_gate:
            owned=self.owned_formats.get(mime)
            if owned is None and mime in self.MIMES:owned=self.owned
            if owned is None or not self.owner or not self.scope() or not self.transfers.acquire(False):
                self.done(serial,False);return
            data=bytearray(owned);version=self.owner_version
        def valid():
            with self.helper.output_gate:return self.scope() and self.owner and self.owner_version==version
        def worker():
            fd=None;success=False;deadline=self.mono()+1000
            try:
                if not valid():return
                fd=self.call("SelectionWrite","u",(serial,),fd=True);os.set_blocking(fd,False);offset=0
                while offset<len(data) and valid() and self.mono()<deadline:
                    if not select.select([],[fd],[],min(.025,max(0,(deadline-self.mono())/1000)))[1]:continue
                    if not valid() or self.mono()>=deadline:break
                    offset+=os.write(fd,data[offset:offset+4096])
                success=offset==len(data) and valid() and self.mono()<=deadline
            except Exception:pass
            finally:
                if fd is not None:os.close(fd)
                data[:]=b"\0"*len(data);self.transfers.release();self.done(serial,success)
        try:threading.Thread(target=worker,daemon=True).start()
        except Exception:data[:]=b"\0"*len(data);self.transfers.release();self.done(serial,False)
    def done(self,serial,success):
        with self.helper.output_gate:
            if self.closed or self.helper.dead or self.helper.session!=self.session or not self.os_enabled:return
            h=self.helper
            h.connection.call(h.NAME,h.PATH,self.INTERFACE,"SelectionWriteDone",h.GLib.Variant("(oub)",(self.session,serial,success)),None,h.Gio.DBusCallFlags.NONE,100,None,None,None)
    def close(self):
        with self.helper.output_gate:self.closed=True;self.enabled=False;self.os_enabled=False;self.generation+=1;self.rich.finish(True);self.forget_owned()

class PortalHelper:
    NAME="org.freedesktop.portal.Desktop";PATH="/org/freedesktop/portal/desktop"
    SC="org.freedesktop.portal.ScreenCast";RD="org.freedesktop.portal.RemoteDesktop"
    def __init__(self, Gio, GLib, Gst, scope_factory=None, video=None):
        self.clipboard=None
        self.native_worker=None;self.native_raw=None;self.native_available=False
        self.native=_native_video.NativeVideoFlow(self.native_live,lambda:time.monotonic()*1000,lambda value,valid:self.output(value,publish=valid),maximum_fps=60)
        self.regions=RegionProofs();self.video=video;self.transfer_size=None
        self.output_gate=threading.RLock();self.Gio=Gio;self.GLib=GLib;self.Gst=Gst;self.loop=GLib.MainLoop();self.scope_factory=scope_factory or (lambda:LoginScope(Gio,GLib,gate=self.output_gate));self.scope=None;self.last_scope_check=0;self.connection=None;self.session=None;self.requests={};self.subscriptions=[]
        self.dead=False;self.closed=False;self.ready=False;self.barrier=-1;self.next_emit=0;self.config=None;self.pipeline=None;self.fd=None;self.guard=None;self.pending=0;self.seq=0;self.last_pts=None;self.last_sample=None;self.last_idle=0;self.idle_counter=0;self.last_heartbeat=time.monotonic();self.configured_at=None;self.commands=queue.Queue(maxsize=64);self.queued=None;self.output_queue=queue.Queue(maxsize=64)
    def output(self,value,revision=None,publish=None):
        if self.dead:return
        line=(json.dumps(value,separators=(",",":"),ensure_ascii=True)+"\n").encode()
        try:self.output_queue.put_nowait((line,revision,value.get("info",{}).get("seq"),None,False,publish))
        except queue.Full:raise NativeFailure("backend_failure")
    def commit(self,revision,action,failure=False):
        with self.output_gate:
            if not failure and self.scope and not self.scope.alive():
                self.GLib.idle_add(self.failure,"source_changed");return False
            if (self.dead and not failure) or revision is not None and (not self.guard or revision!=self.guard.revision):return False
            action();return True
    def writer(self):
        fd=sys.stdout.fileno();os.set_blocking(fd,False)
        while not self.closed:
            try:line,revision,seq,done,failure,publish=self.output_queue.get(timeout=0.1)
            except queue.Empty:continue
            # Serialize the entire bounded JSON record with ordinary input.
            # Revisions cannot change between chunks. An OS scope invalidation
            # still aborts before the terminating newline; it cannot be resumed.
            def record():
                offset=0;deadline=time.monotonic()+0.1
                while offset<len(line):
                    if time.monotonic()>deadline:os._exit(1)
                    if not select.select([], [fd], [], 0.01)[1]:continue
                    try:
                        if not self.commit(revision,lambda:None,failure) or publish and not publish():
                            if offset:os._exit(1)
                            break
                        offset+=os.write(fd,line[offset:offset+16384])
                    except BlockingIOError:continue
                    except OSError:os._exit(1)
            def admitted():
                if publish is None or publish():record()
            if not self.commit(revision,admitted,failure) and seq:self.GLib.idle_add(self.discard_pending,seq)
            if done:done.set()
    def discard_pending(self,seq):
        if self.pending==seq:self.pending=0
        return False
    def failure(self,code):
        if self.dead:return
        with self.output_gate:self.dead=True
        done=threading.Event()
        try:
            line=(json.dumps({"type":"platform_failure","backend":"linux-portal","code":code})+"\n").encode()
            self.output_queue.put_nowait((line,None,None,done,True,None));done.wait(0.1)
        except queue.Full:pass
        finally:self.close()
    def close(self):
        if self.closed:return
        with self.output_gate:
            self.dead=True;self.closed=True;self.queued=None;self.native.stop(False)
            if self.native_raw:self.native_raw[1][:]=b"\0"*len(self.native_raw[1]);self.native_raw=None
            if self.native_worker:self.native_worker.stop()
        self.regions.clear()
        if self.clipboard:self.clipboard.close()
        if self.guard:self.guard.control=False;self.guard.held_keys.clear();self.guard.held_buttons.clear()
        if self.scope and hasattr(self.scope,"close"):self.scope.close()
        if self.connection:
            for path in list(self.requests):
                try:self.connection.call(self.NAME,path,"org.freedesktop.portal.Request","Close",None,None,self.Gio.DBusCallFlags.NONE,500,None,None,None)
                except Exception:pass
            for sub in self.subscriptions:self.connection.signal_unsubscribe(sub)
            if self.session:
                try:self.connection.call(self.NAME,self.session,"org.freedesktop.portal.Session","Close",None,None,self.Gio.DBusCallFlags.NONE,500,None,None,None)
                except Exception:pass
        if self.pipeline:self.pipeline.set_state(self.Gst.State.NULL)
        if self.fd is not None:os.close(self.fd);self.fd=None
        self.loop.quit()
    def request(self, interface, method, prefix, arguments, options, continuation):
        token="soda"+uuid.uuid4().hex;options={**options,"handle_token":self.GLib.Variant("s",token)}
        sender=self.connection.get_unique_name()[1:].replace(".","_");path=f"{self.PATH}/request/{sender}/{token}"
        def response(_connection,_sender,_path,_interface,_signal,parameters):
            if self.dead or path not in self.requests:return
            sub=self.requests.pop(path);self.connection.signal_unsubscribe(sub)
            code,results=parameters.unpack()
            if code!=0:self.failure("permission_cancelled" if code==1 else "permission_denied");return
            try:continuation(results)
            except NativeFailure as error:self.failure(error.code)
            except Exception:self.failure("backend_failure")
        sub=self.connection.signal_subscribe(self.NAME,"org.freedesktop.portal.Request","Response",path,None,self.Gio.DBusSignalFlags.NONE,response)
        self.requests[path]=sub;self.subscriptions.append(sub)
        def finish(connection,result,*_):
            if self.dead:return
            try:
                reply=connection.call_finish(result)
                if reply.unpack()[0]!=path:raise NativeFailure("unsupported")
            except NativeFailure as error:self.failure(error.code)
            except Exception:self.failure("permission_denied")
        self.connection.call(self.NAME,self.PATH,interface,method,self.GLib.Variant("("+prefix+"a{sv})",(*arguments,options)),self.GLib.VariantType.new("(o)"),self.Gio.DBusCallFlags.NONE,3000,None,finish,None)
    def configure(self, message):
        if self.config is not None:raise NativeFailure("backend_failure")
        options=message.get("options",{});width=options.get("width",1280);fps=options.get("fps",10);quality=options.get("quality",65)
        if not integer(width,320,1920) or not integer(fps,1,30) or not integer(quality,20,90):raise NativeFailure("unsupported")
        image=options.get("image",{"colorMode":"full","showCursor":True})
        if not isinstance(image,dict) or image.get("colorMode")!="full" or not isinstance(image.get("showCursor"),bool):raise NativeFailure("unsupported")
        self.config={"width":width,"fps":fps,"quality":quality,"cursor":image["showCursor"],"input":message.get("allowInput") is True,"clipboard":message.get("allowClipboard") is True and "--allow-clipboard" in sys.argv,"rich":options.get("richClipboard") is True};self.configured_at=time.monotonic()
        self.scope=self.scope_factory()
        self.Gst.init(None)
        self.native_available=message.get("allowNativeVideo") is True and self.video is not None and _native_video.GstH264Encoder.available(self.Gst)
        for name in ["pipewiresrc","videoconvert","videoscale","jpegenc","appsink","identity","videorate"]:
            if self.Gst.ElementFactory.find(name) is None:raise NativeFailure("dependencies")
        self.connection=self.Gio.bus_get_sync(self.Gio.BusType.SESSION,None)
        props=self.connection.call_sync(self.NAME,self.PATH,"org.freedesktop.DBus.Properties","GetAll",self.GLib.Variant("(s)",(self.SC,)),None,self.Gio.DBusCallFlags.NONE,3000,None).unpack()[0]
        if props.get("version",0)<6:raise NativeFailure("unsupported")
        self.interface=self.RD if self.config["input"] or self.config["clipboard"] else self.SC
        token="soda"+uuid.uuid4().hex;sender=self.connection.get_unique_name()[1:].replace(".","_");self.expected_session=f"{self.PATH}/session/{sender}/{token}"
        self.request(self.interface,"CreateSession","",(),{"session_handle_token":self.GLib.Variant("s",token)},self.created)
    def created(self,results):
        session=results.get("session_handle")
        if session!=self.expected_session:raise NativeFailure("permission_denied")
        self.session=session
        self.subscriptions.append(self.connection.signal_subscribe(self.NAME,"org.freedesktop.portal.Session","Closed",session,None,self.Gio.DBusSignalFlags.NONE,lambda *_:self.failure("source_changed")))
        if self.config["clipboard"]:
            try:
                props=self.connection.call_sync(self.NAME,self.PATH,"org.freedesktop.DBus.Properties","GetAll",self.GLib.Variant("(s)",(PortalTextClipboard.INTERFACE,)),None,self.Gio.DBusCallFlags.NONE,100,None).unpack()[0]
                remote=self.connection.call_sync(self.NAME,self.PATH,"org.freedesktop.DBus.Properties","GetAll",self.GLib.Variant("(s)",(self.RD,)),None,self.Gio.DBusCallFlags.NONE,100,None).unpack()[0]
                if props.get("version",0)>=1 and remote.get("version",0)>=2:
                    self.connection.call_sync(self.NAME,self.PATH,PortalTextClipboard.INTERFACE,"RequestClipboard",self.GLib.Variant("(oa{sv})",(session,{})),None,self.Gio.DBusCallFlags.NONE,100,None)
                    self.clipboard=PortalTextClipboard(self)
                    for member,callback in [("SelectionOwnerChanged",self.clipboard.owner_changed),("SelectionTransfer",self.clipboard.transfer)]:self.subscriptions.append(self.connection.signal_subscribe(self.NAME,PortalTextClipboard.INTERFACE,member,self.PATH,None,self.Gio.DBusSignalFlags.NONE,callback))
            except Exception:self.clipboard=None
        if self.interface==self.RD:self.request(self.RD,"SelectDevices","o",(session,),{"types":self.GLib.Variant("u",3 if self.config["input"] else 0),"persist_mode":self.GLib.Variant("u",0)},lambda _:self.select_sources())
        else:self.select_sources()
    def select_sources(self):
        options={"types":self.GLib.Variant("u",1),"multiple":self.GLib.Variant("b",False),"cursor_mode":self.GLib.Variant("u",2 if self.config["cursor"] else 1)}
        if self.interface==self.SC:options["persist_mode"]=self.GLib.Variant("u",0)
        self.request(self.SC,"SelectSources","o",(self.session,),options,lambda _:self.request(self.interface,"Start","os",(self.session,""),{},self.started))
    def started(self,results):
        if self.clipboard:self.clipboard.os_enabled=results.get("clipboard_enabled") is True
        streams=results.get("streams",[])
        if len(streams)!=1:raise NativeFailure("unsupported")
        self.node,properties=streams[0];serial=properties.get("pipewire-serial");dimensions=properties.get("size")
        if not integer(self.node,1,0xffffffff) or not integer(serial,1,0xffffffffffffffff) or properties.get("source_type")!=1 or not isinstance(dimensions,(tuple,list)) or len(dimensions)!=2 or not all(integer(n,1,32768) for n in dimensions):raise NativeFailure("unsupported")
        self.dimensions=tuple(properties.get("logical_size",dimensions))
        if len(self.dimensions)!=2 or not all(integer(n,1,32768) for n in self.dimensions):raise NativeFailure("unsupported")
        devices=results.get("devices",0) if self.config["input"] else 0
        if not integer(devices,0,3):raise NativeFailure("permission_denied")
        self.guard=InputGuard(self.notify,lambda:not self.dead and self.session is not None and self.scope.alive(),self.dimensions,self.node,devices)
        reply,fds=self.connection.call_with_unix_fd_list_sync(self.NAME,self.PATH,self.SC,"OpenPipeWireRemote",self.GLib.Variant("(oa{sv})",(self.session,{})),self.GLib.VariantType.new("(h)"),self.Gio.DBusCallFlags.NONE,3000,None,None)
        index=reply.unpack()[0]
        if index<0 or index>=fds.get_length():raise NativeFailure("backend_failure")
        self.fd=fds.get(index)
        self.pipeline=self.Gst.parse_launch(f"pipewiresrc name=source ! videoconvert ! videoscale ! video/x-raw,format=BGR,width=(int)[1,{self.config['width']}],height=(int)[1,2400],pixel-aspect-ratio=(fraction)1/1 ! identity name=native_raw ! videorate name=image_rate drop-only=true max-rate={self.config['fps']} ! jpegenc name=encoder quality={self.config['quality']} ! appsink name=sink max-buffers=1 drop=true sync=false")
        if self.native_available:self.pipeline.get_by_name("native_raw").get_static_pad("src").add_probe(self.Gst.PadProbeType.BUFFER,self.native_probe)
        if self.video:self.pipeline.get_by_name("encoder").get_static_pad("sink").add_probe(self.Gst.PadProbeType.BUFFER,self.region_probe)
        self.source=self.pipeline.get_by_name("source");self.sink=self.pipeline.get_by_name("sink")
        for name in ["target-object","dont-reconnect","on-disconnect","resend-last","keepalive-time"]:
            if self.source.find_property(name) is None:raise NativeFailure("unsupported")
        self.source.set_property("fd",self.fd);self.source.set_property("target-object",str(serial));self.source.set_property("dont-reconnect",True);self.source.set_property("resend-last",False);self.source.set_property("keepalive-time",0);self.Gst.util_set_object_arg(self.source,"on-disconnect","error")
        if self.source.get_property("on-disconnect").value_nick!="error":raise NativeFailure("unsupported")
        self.pipeline.get_bus().add_signal_watch();self.pipeline.get_bus().connect("message",self.bus_message)
        if self.pipeline.set_state(self.Gst.State.PLAYING)==self.Gst.StateChangeReturn.FAILURE:raise NativeFailure("backend_failure")
    def native_live(self):
        session=self.session
        allowed=not self.dead and self.ready and self.native_available and self.scope is not None and self.scope.alive()
        return bool(allowed and not self.dead and self.ready and self.session==session and session is not None and time.monotonic()-self.last_heartbeat<8)
    def native_probe(self,pad,probe):
        if not self.output_gate.acquire(blocking=False):return self.Gst.PadProbeReturn.OK
        try:
            stream=self.native.current
            if self.dead or stream is None or self.native_raw is not None or self.native_worker is None or self.native_worker.stopped.is_set() or stream["encoding"] is not None or len(stream["pending"])>=stream["window"] or time.monotonic()*1000<stream["next"]:return self.Gst.PadProbeReturn.OK
            captured=time.monotonic()*1000;buffer=probe.get_buffer();info=self.video.VideoInfo.new_from_caps(pad.get_current_caps())
            if info.finfo.name!="BGR" or buffer.pts==self.Gst.CLOCK_TIME_NONE:raise _native_video.VideoFailure("raw_format")
            meta=self.video.buffer_get_video_meta(buffer)
            if meta and (meta.width!=info.width or meta.height!=info.height or meta.format!=info.finfo.format):raise _native_video.VideoFailure("raw_meta")
            stride,offset=(meta.stride[0],meta.offset[0]) if meta else (info.stride[0],info.offset[0])
            mapped,data=buffer.map(self.Gst.MapFlags.READ)
            if not mapped:raise _native_video.VideoFailure("raw_map")
            try:owned=_native_video.copy_bgr(memoryview(data.data),info.width,info.height,stride,offset)
            finally:buffer.unmap(data)
            self.native_raw=(stream,owned,info.width,info.height,captured)
        except Exception:self.native.stop()
        finally:self.output_gate.release()
        return self.Gst.PadProbeReturn.OK
    def pump_native(self):
        self.native.tick()
        if self.native_worker and self.native_worker.closed.is_set():
            if self.native.current:self.native.stop()
            self.native_worker=None
        if self.native.current is None:
            if self.native_worker:self.native_worker.stop()
            if self.native_raw:self.native_raw[1][:]=b"\0"*len(self.native_raw[1]);self.native_raw=None
        elif self.native_raw:
            stream,raw,width,height,captured=self.native_raw;self.native_raw=None
            reservation=self.native.reserve(captured) if self.native.current is stream else None
            if reservation is not None and self.native_worker:self.native_worker.submit(reservation,raw,width,height)
            else:raw[:]=b"\0"*len(raw)
    def native_command(self,value):
        kind=value.get("type")
        try:
            if kind=="native_video":
                if value.get("enabled") is True and self.native_worker is not None:
                    if not self.native_worker.closed.is_set():
                        self.native.start(value);self.native.stop();self.native_worker.stop();return
                    self.native_worker=None
                stream=self.native.start(value)
                if stream is not None:self.native_worker=_native_video.H264Worker(self.Gst,self.video,self.native,self.output_gate)
                elif self.native.current is None and self.native_worker:self.native_worker.stop()
            elif kind=="native_video_ack":self.native.acknowledge(value)
            elif kind=="native_keyframe":self.native.keyframe(value)
            else:raise _native_video.VideoFailure("unsupported_control")
        except Exception:
            self.native.stop()
            if self.native_worker:self.native_worker.stop()
    def region_probe(self,pad,probe):
        try:
            with self.regions.lock:
                if self.dead or not self.regions.specs:return self.Gst.PadProbeReturn.OK
                buffer=probe.get_buffer();caps=pad.get_current_caps();info=self.video.VideoInfo.new_from_caps(caps)
                if info.finfo.name!="BGR" or buffer.pts==self.Gst.CLOCK_TIME_NONE:raise NativeFailure("backend_failure")
                meta=self.video.buffer_get_video_meta(buffer)
                stride,offset=(meta.stride[0],meta.offset[0]) if meta else (info.stride[0],info.offset[0])
                if meta and (meta.width!=info.width or meta.height!=info.height or meta.format!=info.finfo.format):raise NativeFailure("backend_failure")
                mapped,data=buffer.map(self.Gst.MapFlags.READ)
                if not mapped:raise NativeFailure("backend_failure")
                try:self.regions.capture(buffer.pts,memoryview(data.data),info.width,info.height,stride,offset)
                finally:buffer.unmap(data)
            return self.Gst.PadProbeReturn.OK
        except Exception:
            self.GLib.idle_add(self.failure,"backend_failure");return self.Gst.PadProbeReturn.DROP
    def notify(self,method,signature,args):
        if self.dead or not self.session:raise NativeFailure("source_changed")
        self.connection.call_sync(self.NAME,self.PATH,self.RD,method,self.GLib.Variant("(oa{sv}"+signature+")",(self.session,{},*args)),None,self.Gio.DBusCallFlags.NONE,100,None)
    def bus_message(self,_bus,message):
        if message.type in [self.Gst.MessageType.ERROR,self.Gst.MessageType.EOS]:self.failure("source_changed")
    def mutate_input(self,action):
        with self.output_gate:
            previous=self.guard.revision;result=action()
            if previous!=self.guard.revision:
                self.queued=None
                if self.pipeline:self.barrier=self.pipeline.get_clock().get_time()-self.pipeline.get_base_time()
            return result
    def command(self,message):
        kind=message.get("type")
        if kind=="configure":self.configure(message)
        elif kind.startswith("native_"):self.native_command(message)
        elif kind=="policy":
            fps=message.get("fps");quality=message.get("quality")
            if not integer(fps,1,self.config["fps"]) or not integer(quality,20,self.config["quality"]):raise NativeFailure("unsupported")
            self.image_fps=fps;self.pipeline.get_by_name("image_rate").set_property("max-rate",fps);self.pipeline.get_by_name("encoder").set_property("quality",quality)
        elif kind=="heartbeat":self.last_heartbeat=time.monotonic()
        elif kind=="stop":self.close()
        elif kind=="ack":
            if message.get("seq")!=self.pending:raise NativeFailure("backend_failure")
            self.pending=0
        elif kind=="keyframe":
            if "regions" in message:
                if not self.video or not self.transfer_size:raise NativeFailure("unsupported")
                self.regions.configure(message["regions"],*self.transfer_size)
                if self.guard:
                    def invalidate():self.guard.revision+=1
                    self.mutate_input(invalidate)
        elif kind in ["control","release"]:
            if self.guard:
                if kind=="control" and message.get("enabled") is True:self.guard.control=bool(self.config["input"] and self.guard.devices)
                else:self.mutate_input(self.guard.release)
        elif kind=="clipboard_control":
            if self.clipboard:self.clipboard.control(message)
        elif kind=="clipboard_rich":
            if self.clipboard:self.clipboard.submit_rich(message)
            else:self.output({"type":"clipboard_rich_result","id":message["id"],"ok":False,"stage":"done"})
        elif kind=="clipboard":
            if self.clipboard:self.clipboard.submit(message)
            else:self.output({"type":"clipboard_result","id":message["id"],"ok":False})
        elif kind=="input":
            if self.guard:
                accepted=self.mutate_input(lambda:self.guard.input(message))
                if accepted:self.output({"type":"input_ack","seq":message["seq"]})
        else:raise NativeFailure("unsupported")
    def pump(self):
        # Sequence/ACK/quiet state and final output admission use the same lock.
        with self.output_gate:return self.pump_locked()
    def idle_valid(self,seq,revision):
        try:
            def current_scope():
                if self.dead or not self.ready or not self.session or not self.scope or not self.scope.alive() or not self.guard or revision!=self.guard.revision or self.pending or seq<1 or seq!=self.seq or self.last_sample is None or not self.pipeline:return False
                now=time.monotonic()
                return now-self.last_sample>=0.5 and now-self.last_heartbeat<8
            if not current_scope():return False
            result,current,_pending=self.pipeline.get_state(0)
            # A nonblocking native query can still cross an owner deadline.
            return result!=self.Gst.StateChangeReturn.FAILURE and current==self.Gst.State.PLAYING and current_scope()
        except Exception:return False
    def publish_idle(self):
        seq,revision=self.seq,self.guard.revision
        if time.monotonic()-self.last_idle<0.5 or not self.idle_valid(seq,revision):return
        if self.idle_counter>=9007199254740991:raise NativeFailure("backend_failure")
        self.last_idle=time.monotonic();self.idle_counter+=1
        self.output({"type":"platform_idle","backend":"linux-portal","seq":seq,"counter":self.idle_counter},revision,lambda:self.idle_valid(seq,revision))
    def pump_locked(self):
        if self.dead:return False
        try:
            if self.scope and time.monotonic()-self.last_scope_check>0.25:
                self.last_scope_check=time.monotonic()
                if not self.scope.alive():raise NativeFailure("source_changed")
            for _ in range(16):
                try:command=self.commands.get_nowait()
                except queue.Empty:break
                if command is None:self.close();return False
                self.command(command)
            if time.monotonic()-self.last_heartbeat>8:raise NativeFailure("source_changed")
            if self.configured_at and not self.ready and time.monotonic()-self.configured_at>115:raise NativeFailure("permission_cancelled")
            if self.clipboard:self.clipboard.rich.expire()
            self.pump_native()
            if self.pipeline:
                sample=self.sink.emit("try-pull-sample",0)
                if sample:
                    buffer=sample.get_buffer();caps=sample.get_caps().get_structure(0);width=caps.get_value("width");height=caps.get_value("height");pts=buffer.pts
                    if not integer(width,1,1920) or not integer(height,1,2400) or width*height>8000000 or buffer.get_size()>2097152 or pts==self.Gst.CLOCK_TIME_NONE:raise NativeFailure("backend_failure")
                    if self.last_pts is not None and pts<=self.last_pts:raise NativeFailure("source_changed")
                    self.last_pts=pts;self.last_sample=time.monotonic();self.transfer_size=(width,height)
                    native=self.source.get_static_pad("src").get_current_caps().get_structure(0);native_size=(native.get_value("width"),native.get_value("height"))
                    if self.ready and native_size!=self.native_size:raise NativeFailure("source_changed")
                    running=sample.get_segment().to_running_time(self.Gst.Format.TIME,pts)
                    if running==self.Gst.CLOCK_TIME_NONE or running<=self.barrier:return True
                    data=buffer.extract_dup(0,buffer.get_size())
                    self.queued=(data,width,height,self.guard.revision,time.monotonic(),self.regions.take(pts,width,height))
                    if not self.ready:
                        self.native_size=native_size;self.ready=True
                        self.output({"type":"ready","title":"Linux / Portal","width":self.native_size[0],"height":self.native_size[1],"backend":"linux-portal","allowInput":bool(self.guard.devices),"allowClipboard":bool(self.clipboard and self.clipboard.os_enabled),"inputCapabilities":self.guard.capabilities(),"extendedInput":True,**({"richClipboard":True} if self.clipboard and self.clipboard.os_enabled and self.config["rich"] else {}),**({"agentRegions":True} if self.video else {}),**({"nativeVideo":True,"nativeVideoWindow":3,"nativeMaxFps":60} if self.native_available else {})})
                if self.queued and not self.pending and time.monotonic()>=self.next_emit:
                    data,width,height,revision,received,proofs=self.queued;self.queued=None
                    if revision==self.guard.revision and time.monotonic()-received<1:
                        encoded=base64.b64encode(data).decode();info={"seq":self.seq+1,"width":width,"height":height,"format":"image/jpeg","captureMs":0,"encodeMs":0,"timing":"unavailable","sourceInputSeq":self.guard.seq}
                        if proofs:info["regions"]=proofs
                        if not self.dead and revision==self.guard.revision:
                            self.seq+=1;self.pending=self.seq;self.next_emit=time.monotonic()+1/getattr(self,"image_fps",self.config["fps"]);self.output({"type":"frame","info":info,"data":encoded},revision)
                # Quiet is session/pipeline liveness only, never new pixels.
                if self.ready:
                    if self.last_sample is not None and time.monotonic()-self.last_sample>=0.5:
                        result,state,_pending=self.pipeline.get_state(0)
                        if result==self.Gst.StateChangeReturn.FAILURE or state!=self.Gst.State.PLAYING:raise NativeFailure("source_changed")
                    self.publish_idle()
            return not self.dead
        except NativeFailure as error:self.failure(error.code)
        except Exception:self.failure("backend_failure")
        return False
    def read(self):
        try:
            while True:
                line=sys.stdin.buffer.readline(65538)
                if not line:self.commands.put_nowait(None);return
                if len(line)>65536 or not line.endswith(b"\n"):raise ValueError()
                message=json.loads(line)
                if not isinstance(message,dict):raise ValueError()
                self.commands.put_nowait(message)
        except Exception:
            self.GLib.idle_add(self.failure,"backend_failure")
    def run(self):
        threading.Thread(target=self.writer,daemon=True).start();threading.Thread(target=self.read,daemon=True).start();self.GLib.timeout_add(5,self.pump)
        for name in [signal.SIGTERM,signal.SIGINT]:self.GLib.unix_signal_add(self.GLib.PRIORITY_DEFAULT,name,lambda:self.close() or False)
        self.loop.run()

def main():
    try:
        arguments=sys.argv[1:]
        if len(arguments)!=len(set(arguments)) or any(arg not in ("--probe","--allow-clipboard") for arg in arguments):raise NativeFailure("unsupported")
        import gi
        gi.require_version("Gio","2.0");gi.require_version("Gst","1.0");gi.require_version("GstVideo","1.0")
        from gi.repository import Gio,GLib,Gst,GstVideo
        if "--probe" in sys.argv[1:]:
            print(json.dumps({"backend":"linux-portal","dependencies":True}));return
        PortalHelper(Gio,GLib,Gst,video=GstVideo).run()
    except Exception as error:
        code=error.code if isinstance(error,NativeFailure) else "dependencies"
        print(json.dumps({"type":"platform_failure","backend":"linux-portal","code":code}),flush=True)
        sys.exit(1)
if __name__=="__main__":main()
