#!/usr/bin/python3
"""One explicit portal session. Probe/import/tests never open a display or inject input."""
import base64
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

class PortalHelper:
    NAME="org.freedesktop.portal.Desktop";PATH="/org/freedesktop/portal/desktop"
    SC="org.freedesktop.portal.ScreenCast";RD="org.freedesktop.portal.RemoteDesktop"
    def __init__(self, Gio, GLib, Gst, scope_factory=None):
        self.output_gate=threading.RLock();self.Gio=Gio;self.GLib=GLib;self.Gst=Gst;self.loop=GLib.MainLoop();self.scope_factory=scope_factory or (lambda:LoginScope(Gio,GLib,gate=self.output_gate));self.scope=None;self.last_scope_check=0;self.connection=None;self.session=None;self.requests={};self.subscriptions=[]
        self.dead=False;self.closed=False;self.ready=False;self.barrier=-1;self.next_emit=0;self.config=None;self.pipeline=None;self.fd=None;self.guard=None;self.pending=0;self.seq=0;self.last_pts=None;self.last_sample=None;self.last_heartbeat=time.monotonic();self.configured_at=None;self.commands=queue.Queue(maxsize=64);self.queued=None;self.output_queue=queue.Queue(maxsize=64)
    def output(self,value,revision=None):
        if self.dead:return
        line=(json.dumps(value,separators=(",",":"),ensure_ascii=True)+"\n").encode()
        try:self.output_queue.put_nowait((line,revision,value.get("info",{}).get("seq"),None,False))
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
            try:line,revision,seq,done,failure=self.output_queue.get(timeout=0.1)
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
                        if not self.commit(revision,lambda:None,failure):
                            if offset:os._exit(1)
                            break
                        offset+=os.write(fd,line[offset:offset+16384])
                    except BlockingIOError:continue
                    except OSError:os._exit(1)
            if not self.commit(revision,record,failure) and seq:self.GLib.idle_add(self.discard_pending,seq)
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
            self.output_queue.put_nowait((line,None,None,done,True));done.wait(0.1)
        except queue.Full:pass
        finally:self.close()
    def close(self):
        if self.closed:return
        with self.output_gate:self.dead=True;self.closed=True;self.queued=None
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
        self.config={"width":width,"fps":fps,"quality":quality,"cursor":image["showCursor"],"input":message.get("allowInput") is True};self.configured_at=time.monotonic()
        self.scope=self.scope_factory()
        self.Gst.init(None)
        for name in ["pipewiresrc","videoconvert","videoscale","jpegenc","appsink"]:
            if self.Gst.ElementFactory.find(name) is None:raise NativeFailure("dependencies")
        self.connection=self.Gio.bus_get_sync(self.Gio.BusType.SESSION,None)
        props=self.connection.call_sync(self.NAME,self.PATH,"org.freedesktop.DBus.Properties","GetAll",self.GLib.Variant("(s)",(self.SC,)),None,self.Gio.DBusCallFlags.NONE,3000,None).unpack()[0]
        if props.get("version",0)<6:raise NativeFailure("unsupported")
        self.interface=self.RD if self.config["input"] else self.SC
        token="soda"+uuid.uuid4().hex;sender=self.connection.get_unique_name()[1:].replace(".","_");self.expected_session=f"{self.PATH}/session/{sender}/{token}"
        self.request(self.interface,"CreateSession","",(),{"session_handle_token":self.GLib.Variant("s",token)},self.created)
    def created(self,results):
        session=results.get("session_handle")
        if session!=self.expected_session:raise NativeFailure("permission_denied")
        self.session=session
        self.subscriptions.append(self.connection.signal_subscribe(self.NAME,"org.freedesktop.portal.Session","Closed",session,None,self.Gio.DBusSignalFlags.NONE,lambda *_:self.failure("source_changed")))
        if self.config["input"]:self.request(self.RD,"SelectDevices","o",(session,),{"types":self.GLib.Variant("u",3),"persist_mode":self.GLib.Variant("u",0)},lambda _:self.select_sources())
        else:self.select_sources()
    def select_sources(self):
        self.request(self.SC,"SelectSources","o",(self.session,),{"types":self.GLib.Variant("u",1),"multiple":self.GLib.Variant("b",False),"cursor_mode":self.GLib.Variant("u",2 if self.config["cursor"] else 1),"persist_mode":self.GLib.Variant("u",0)},lambda _:self.request(self.interface,"Start","os",(self.session,""),{},self.started))
    def started(self,results):
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
        self.pipeline=self.Gst.parse_launch(f"pipewiresrc name=source ! videoconvert ! videoscale ! video/x-raw,width=(int)[1,{self.config['width']}],height=(int)[1,2400],pixel-aspect-ratio=(fraction)1/1 ! jpegenc quality={self.config['quality']} ! appsink name=sink max-buffers=1 drop=true sync=false")
        self.source=self.pipeline.get_by_name("source");self.sink=self.pipeline.get_by_name("sink")
        for name in ["target-object","dont-reconnect","on-disconnect","resend-last","keepalive-time"]:
            if self.source.find_property(name) is None:raise NativeFailure("unsupported")
        self.source.set_property("fd",self.fd);self.source.set_property("target-object",str(serial));self.source.set_property("dont-reconnect",True);self.source.set_property("resend-last",False);self.source.set_property("keepalive-time",0);self.Gst.util_set_object_arg(self.source,"on-disconnect","error")
        if self.source.get_property("on-disconnect").value_nick!="error":raise NativeFailure("unsupported")
        self.pipeline.get_bus().add_signal_watch();self.pipeline.get_bus().connect("message",self.bus_message)
        if self.pipeline.set_state(self.Gst.State.PLAYING)==self.Gst.StateChangeReturn.FAILURE:raise NativeFailure("backend_failure")
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
        elif kind=="heartbeat":self.last_heartbeat=time.monotonic()
        elif kind=="stop":self.close()
        elif kind=="ack":
            if message.get("seq")!=self.pending:raise NativeFailure("backend_failure")
            self.pending=0
        elif kind=="keyframe":pass
        elif kind in ["control","release"]:
            if self.guard:
                if kind=="control" and message.get("enabled") is True:self.guard.control=bool(self.config["input"] and self.guard.devices)
                else:self.mutate_input(self.guard.release)
        elif kind=="input":
            if self.guard:
                accepted=self.mutate_input(lambda:self.guard.input(message))
                if accepted:self.output({"type":"input_ack","seq":message["seq"]})
        else:raise NativeFailure("unsupported")
    def pump(self):
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
            if self.pipeline:
                # Damage-only producers cannot prove a fresh post-input snapshot.
                # End explicitly before the common input freshness deadline; never
                # renew capture time/sequence by relabelling a retained buffer.
                if self.last_sample is not None and time.monotonic()-self.last_sample>1.5:raise NativeFailure("source_stalled")
                sample=self.sink.emit("try-pull-sample",0)
                if sample:
                    buffer=sample.get_buffer();caps=sample.get_caps().get_structure(0);width=caps.get_value("width");height=caps.get_value("height");pts=buffer.pts
                    if not integer(width,1,1920) or not integer(height,1,2400) or width*height>8000000 or buffer.get_size()>2097152 or pts==self.Gst.CLOCK_TIME_NONE:raise NativeFailure("backend_failure")
                    if self.last_pts is not None and pts<=self.last_pts:raise NativeFailure("source_changed")
                    self.last_pts=pts;self.last_sample=time.monotonic()
                    native=self.source.get_static_pad("src").get_current_caps().get_structure(0);native_size=(native.get_value("width"),native.get_value("height"))
                    if self.ready and native_size!=self.native_size:raise NativeFailure("source_changed")
                    running=sample.get_segment().to_running_time(self.Gst.Format.TIME,pts)
                    if running==self.Gst.CLOCK_TIME_NONE or running<=self.barrier:return True
                    data=buffer.extract_dup(0,buffer.get_size())
                    self.queued=(data,width,height,self.guard.revision,time.monotonic())
                    if not self.ready:
                        self.native_size=native_size;self.ready=True
                        self.output({"type":"ready","title":"Linux / Portal","width":self.native_size[0],"height":self.native_size[1],"backend":"linux-portal","allowInput":bool(self.guard.devices),"inputCapabilities":self.guard.capabilities(),"extendedInput":True})
                if self.queued and not self.pending and time.monotonic()>=self.next_emit:
                    data,width,height,revision,received=self.queued;self.queued=None
                    if revision==self.guard.revision and time.monotonic()-received<1:
                        encoded=base64.b64encode(data).decode();info={"seq":self.seq+1,"width":width,"height":height,"format":"image/jpeg","captureMs":0,"encodeMs":0,"timing":"unavailable","sourceInputSeq":self.guard.seq}
                        if not self.dead and revision==self.guard.revision:
                            self.seq+=1;self.pending=self.seq;self.next_emit=time.monotonic()+1/self.config["fps"];self.output({"type":"frame","info":info,"data":encoded},revision)
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
        import gi
        gi.require_version("Gio","2.0");gi.require_version("Gst","1.0")
        from gi.repository import Gio,GLib,Gst
        if sys.argv[1:]==["--probe"]:
            print(json.dumps({"backend":"linux-portal","dependencies":True}));return
        if sys.argv[1:]:raise NativeFailure("unsupported")
        PortalHelper(Gio,GLib,Gst).run()
    except Exception as error:
        code=error.code if isinstance(error,NativeFailure) else "dependencies"
        print(json.dumps({"type":"platform_failure","backend":"linux-portal","code":code}),flush=True)
        sys.exit(1)
if __name__=="__main__":main()
