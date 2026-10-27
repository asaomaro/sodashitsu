"""Generated input and pipeline checks. Never connects to a portal/display/input device."""
import importlib.util
import pathlib
import unittest
import threading
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location("portal_helper",pathlib.Path(__file__).with_name("linux-portal-helper.py"));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Guards(unittest.TestCase):
 def setup_guard(self,devices=3):
  calls=[];alive=[True];guard=module.InputGuard(lambda method,signature,args:calls.append((method,args)),lambda:alive[0],(1000,600),55,devices,lambda:1000);guard.control=True
  return guard,calls,alive
 def command(self,seq,value):return {"seq":seq,"expiresAt":1400,"input":value}
 def test_raw_ctrl_space_and_release(self):
  g,c,a=self.setup_guard()
  for seq,code,down in [(1,"ControlLeft",True),(2,"Space",True),(3,"Space",False),(4,"ControlLeft",False)]:self.assertTrue(g.input(self.command(seq,{"kind":"key","code":code,"down":down})))
  self.assertEqual(c,[("NotifyKeyboardKeycode",(29,1)),("NotifyKeyboardKeycode",(57,1)),("NotifyKeyboardKeycode",(57,0)),("NotifyKeyboardKeycode",(29,0))]);self.assertEqual(g.held_keys,set())
 def test_buttons_are_evdev_middle_right_back_forward(self):
  g,c,a=self.setup_guard()
  for button,evdev in enumerate([272,274,273,275,276]):
   self.assertTrue(g.input(self.command(button+1,{"kind":"pointer","x":1,"y":1,"event":"down","button":button})));self.assertEqual(c[-1],("NotifyPointerButton",(evdev,1)));self.assertEqual(c[-2],("NotifyPointerMotionAbsolute",(55,999,599)))
  g.release();self.assertFalse(g.control);self.assertEqual(g.held_buttons,set())
 def test_never_sends_to_a_closed_scope_or_replays_sequence(self):
  g,c,a=self.setup_guard();value={"kind":"key","code":"KeyA","down":True}
  self.assertTrue(g.input(self.command(1,value)));self.assertFalse(g.input(self.command(1,value)));a[0]=False;self.assertFalse(g.input(self.command(2,value)));g.release();self.assertEqual(len(c),1);self.assertEqual(g.held_keys,set())
 def test_invalid_suffix_and_expiry_have_no_partial_injection(self):
  g,c,a=self.setup_guard()
  for text in ["valid\x00","valid\ud800"]:self.assertFalse(g.input(self.command(1,{"kind":"text","text":text})))
  command=self.command(1,{"kind":"key","code":"KeyA","down":True});command["expiresAt"]=999;self.assertFalse(g.input(command));self.assertFalse(c)
 def test_actual_os_device_grants_limit_capabilities(self):
  g,c,a=self.setup_guard(2);self.assertFalse(g.capabilities()["keys"]);self.assertFalse(g.capabilities()["text"]);self.assertFalse(g.input(self.command(1,{"kind":"key","code":"ControlLeft","down":True})));self.assertFalse(c)
 def test_unicode_is_forwarded_as_keysyms_not_shell_text(self):
  g,c,a=self.setup_guard();self.assertTrue(g.input(self.command(1,{"kind":"text","text":"日本語"})));self.assertEqual(c[0],("NotifyKeyboardKeysym",(0x1000000+ord("日"),1)));self.assertEqual(len(c),6)
 def test_wheel_wire_positive_up_is_portal_negative_dy(self):
  g,c,a=self.setup_guard()
  self.assertTrue(g.input(self.command(1,{"kind":"wheel","delta":120})));self.assertEqual(c[-1],("NotifyPointerAxis",(0.0,-15.0)))
  self.assertTrue(g.input(self.command(2,{"kind":"wheel","delta":-120})));self.assertEqual(c[-1],("NotifyPointerAxis",(0.0,15.0)))
 def test_release_invalidates_queued_frame_and_records_post_release_time(self):
  helper=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None),None);guard,c,a=self.setup_guard();helper.guard=guard;guard.held_keys.add(29);helper.queued=(b"old",);old=guard.revision
  self.assertIsNone(helper.mutate_input(guard.release));self.assertGreater(guard.revision,old);self.assertIsNone(helper.queued);self.assertFalse(helper.commit(old,lambda:self.fail("Old release frame was published")))
 def test_publication_and_input_have_one_linearization_gate(self):
  helper=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None),None);g,c,a=self.setup_guard();helper.guard=g;old=g.revision
  # A prepared writer waits until an input has acquired the same gate. It must
  # recheck after that wait, including the final newline commit.
  started=threading.Event();done=threading.Event();writes=[]
  def writer():started.set();writes.append(helper.commit(old,lambda:writes.append("stale")));done.set()
  with helper.output_gate:
   thread=threading.Thread(target=writer);thread.start();self.assertTrue(started.wait(1));g.revision+=1
  self.assertTrue(done.wait(1));thread.join();self.assertEqual(writes,[False])
  helper.dead=True;self.assertFalse(helper.commit(g.revision,lambda:self.fail("Ended scope was published")))
 def test_chunked_record_keeps_ordinary_input_outside_the_complete_json(self):
  from unittest.mock import patch
  helper=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None,idle_add=lambda *args:None),None);guard,c,a=self.setup_guard();helper.guard=guard;line=b"x"*40000+b"\n";helper.output_queue.put((line,guard.revision,1,None,False));chunks=[];input_done=threading.Event();threads=[]
  def input():
   helper.mutate_input(lambda:guard.input(self.command(1,{"kind":"key","code":"KeyA","down":True})));input_done.set()
  def write(fd,data):
   chunks.append(data)
   if len(chunks)==1:
    thread=threading.Thread(target=input);threads.append(thread);thread.start()
    # Writer owns the record gate; input must stay pending until its newline.
    self.assertFalse(input_done.wait(0.02))
   if data.endswith(b"\n"):helper.closed=True
   return len(data)
  fakeos=SimpleNamespace(set_blocking=lambda *args:None,write=write,_exit=lambda _:self.fail("Normal input terminated a partially written record"))
  with patch.object(module,"os",fakeos),patch.object(module.select,"select",lambda *args:([],[1],[])),patch.object(module.sys,"stdout",SimpleNamespace(fileno=lambda:1)):helper.writer()
  for thread in threads:thread.join(1)
  self.assertTrue(input_done.is_set());self.assertEqual(b"".join(chunks),line);self.assertEqual(guard.seq,1)
 def test_damage_only_producer_stops_explicitly_without_refreshing_old_pixels(self):
  helper=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None),None);helper.guard,c,a=self.setup_guard();helper.ready=True;helper.pipeline=object();helper.last_sample=module.time.monotonic()-2.5;errors=[];helper.failure=lambda code:errors.append(code)
  self.assertFalse(helper.pump());self.assertEqual(errors,["source_stalled"]);self.assertEqual(helper.seq,0);self.assertTrue(helper.output_queue.empty())
 def test_pts_barrier_drops_pre_input_buffers(self):
  helper=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None),SimpleNamespace(CLOCK_TIME_NONE=999999,Format=SimpleNamespace(TIME=1)));guard,c,a=self.setup_guard();helper.guard=guard;helper.ready=True;helper.native_size=(1920,1080);helper.barrier=15;helper.config={"fps":10};helper.pipeline=object()
  caps=lambda width,height:SimpleNamespace(get_structure=lambda _:SimpleNamespace(get_value=lambda key:{"width":width,"height":height}[key]))
  helper.source=SimpleNamespace(get_static_pad=lambda _:SimpleNamespace(get_current_caps=lambda:caps(1920,1080)))
  def sample(pts):
   buffer=SimpleNamespace(pts=pts,get_size=lambda:4,extract_dup=lambda *args:b"jpeg")
   return SimpleNamespace(get_buffer=lambda:buffer,get_caps=lambda:caps(640,360),get_segment=lambda:SimpleNamespace(to_running_time=lambda _,value:value))
  samples=iter([sample(10),sample(20)]);helper.sink=SimpleNamespace(emit=lambda *args:next(samples))
  self.assertTrue(helper.pump());self.assertTrue(helper.output_queue.empty());self.assertTrue(helper.pump());line=helper.output_queue.get_nowait()[0];self.assertEqual(module.json.loads(line)["info"]["sourceInputSeq"],0);self.assertEqual(helper.seq,1)
 def test_generated_gstreamer_pipeline_preserves_bounded_jpeg_caps(self):
  try:
   import gi;gi.require_version("Gst","1.0");from gi.repository import Gst
  except (ImportError,ValueError):self.skipTest("GStreamer GI not installed")
  Gst.init(None)
  if any(Gst.ElementFactory.find(name) is None for name in ["videotestsrc","videoconvert","videoscale","jpegenc","appsink"]):self.skipTest("Generated pipeline plugins not installed")
  pipeline=Gst.parse_launch("videotestsrc pattern=red num-buffers=1 ! video/x-raw,width=1920,height=1080 ! videoconvert ! videoscale ! video/x-raw,width=(int)[1,1280],height=(int)[1,2400],pixel-aspect-ratio=(fraction)1/1 ! jpegenc quality=65 ! appsink name=sink sync=false")
  try:
   pipeline.set_state(Gst.State.PLAYING);sample=pipeline.get_by_name("sink").emit("try-pull-sample",3*Gst.SECOND);self.assertIsNotNone(sample);caps=sample.get_caps().get_structure(0);self.assertEqual((caps.get_value("width"),caps.get_value("height")),(1280,720));data=sample.get_buffer().extract_dup(0,sample.get_buffer().get_size());self.assertTrue(data.startswith(b"\xff\xd8"));self.assertLessEqual(len(data),2097152)
  finally:pipeline.set_state(Gst.State.NULL)
class PortalProtocol(unittest.TestCase):
 def setUp(self):
  try:
   import gi;gi.require_version("Gio","2.0");from gi.repository import Gio,GLib
  except (ImportError,ValueError):self.skipTest("GI unavailable")
  self.GLib=GLib;self.Gio=Gio;self.calls=[];self.signals={};self.next_sub=0;self.fake_fd=None
  outer=self
  class Connection:
   def get_unique_name(self):return ":1.4242"
   def signal_subscribe(self,sender,interface,member,path,arg,flags,callback):
    outer.next_sub+=1;outer.signals[outer.next_sub]=(member,path,callback);return outer.next_sub
   def signal_unsubscribe(self,sub):outer.signals.pop(sub,None)
   def call_sync(self,name,path,interface,method,params,reply,flags,timeout,cancel):
    outer.calls.append((method,path,params.unpack()))
    if method=="GetAll":return GLib.Variant("(a{sv})",({"version":GLib.Variant("u",6)},))
   def call(self,name,path,interface,method,params,reply,flags,timeout,cancel,callback,user):
    args=params.unpack() if params else ();outer.calls.append((method,path,args))
    if callback:
     token=args[-1]["handle_token"];callback(self,GLib.Variant("(o)",(module.PortalHelper.PATH+"/request/1_4242/"+token,)),user)
   def call_finish(self,result):return result
   def call_with_unix_fd_list_sync(self,*args):
    import os
    read,write=os.pipe();os.close(write);outer.fake_fd=read
    return GLib.Variant("(h)",(0,)),SimpleNamespace(get_length=lambda:1,get=lambda index:read)
  self.connection=Connection();self.properties={};self.states=[]
  source=SimpleNamespace(find_property=lambda name:True,set_property=lambda name,value:self.properties.update({name:value}),get_property=lambda name:SimpleNamespace(value_nick=self.properties.get(name)))
  pipeline=SimpleNamespace(get_by_name=lambda name:source if name=="source" else object(),get_bus=lambda:SimpleNamespace(add_signal_watch=lambda:None,connect=lambda *args:None),set_state=lambda state:self.states.append(state) or 1)
  gst=SimpleNamespace(init=lambda _:None,ElementFactory=SimpleNamespace(find=lambda _:True),parse_launch=lambda value:pipeline,State=SimpleNamespace(PLAYING=1,NULL=0),StateChangeReturn=SimpleNamespace(FAILURE=-1),util_set_object_arg=lambda obj,name,value:self.properties.update({name:value}))
  gio=SimpleNamespace(bus_get_sync=lambda *args:self.connection,BusType=Gio.BusType,DBusCallFlags=Gio.DBusCallFlags,DBusSignalFlags=Gio.DBusSignalFlags)
  self.helper=module.PortalHelper(gio,GLib,gst,scope_factory=lambda:SimpleNamespace(alive=lambda:True))
 def tearDown(self):
  if hasattr(self,"helper"):self.helper.close()
 def respond(self,results,code=0):
  member,path,callback=[value for value in self.signals.values() if value[0]=="Response"][-1]
  callback(self.connection,module.PortalHelper.NAME,path,"org.freedesktop.portal.Request","Response",self.GLib.Variant("(ua{sv})",(code,results)))
 def create(self,input=True):
  self.helper.configure({"options":{"width":1280,"fps":10,"quality":65},"allowInput":input});self.respond({"session_handle":self.GLib.Variant("o",self.helper.expected_session)})
  if input:self.respond({})
  self.respond({})
 def test_os_choice_is_explicit_nonpersistent_and_cancellation_is_terminal(self):
  self.create();methods=[call[0] for call in self.calls];self.assertEqual(methods,["GetAll","CreateSession","SelectDevices","SelectSources","Start"])
  selection=next(call for call in self.calls if call[0]=="SelectSources")[2][-1];self.assertEqual(selection["types"],1);self.assertFalse(selection["multiple"]);self.assertEqual(selection["persist_mode"],0);self.assertNotIn("restore_token",selection)
  self.respond({},1);self.assertTrue(self.helper.closed);self.assertTrue(any(call[0]=="Close" and call[1]==self.helper.session for call in self.calls))
 def test_stream_serial_is_required_before_opening_a_remote_or_pipeline(self):
  self.create(False)
  with self.assertRaises(module.NativeFailure) as error:self.helper.started({"streams":[(55,{"size":(1000,600),"source_type":1})]})
  self.assertEqual(error.exception.code,"unsupported");self.assertIsNone(self.fake_fd)
 def test_session_bound_serial_and_fd_are_kept_until_close(self):
  import os
  self.create();self.respond({"devices":self.GLib.Variant("u",3),"streams":self.GLib.Variant("a(ua{sv})",[(55,{"pipewire-serial":self.GLib.Variant("t",987654321),"size":self.GLib.Variant("(ii)",(1000,600)),"source_type":self.GLib.Variant("u",1)})])})
  self.assertEqual(self.properties["target-object"],"987654321");self.assertTrue(self.properties["dont-reconnect"]);self.assertFalse(self.properties["resend-last"]);self.assertEqual(self.properties["keepalive-time"],0);self.assertEqual(self.properties["on-disconnect"],"error");fd=self.fake_fd;os.fstat(fd)
  self.helper.close()
  with self.assertRaises(OSError):os.fstat(fd)
 def test_notify_payload_contains_only_the_owned_session_and_typed_values(self):
  self.create();self.helper.notify("NotifyPointerMotionAbsolute","udd",(55,10.0,20.0));self.assertEqual(self.calls[-1],("NotifyPointerMotionAbsolute",module.PortalHelper.PATH,(self.helper.session,{},55,10.0,20.0)))
class LoginScopeTests(unittest.TestCase):
 def test_pins_logind_owner_user_and_graphical_session_and_never_resumes(self):
  try:
   import gi;gi.require_version("Gio","2.0");from gi.repository import Gio,GLib
  except (ImportError,ValueError):self.skipTest("GI unavailable")
  state={"locked":False,"uid":42};calls=[];filters=[]
  class Connection:
   def add_filter(self,callback,user):filters.append(callback);return 1
   def remove_filter(self,_):filters.clear()
   def signal_subscribe(self,*args):return 1
   def signal_unsubscribe(self,*args):pass
   def call_sync(self,name,path,interface,method,parameters,*args):
    calls.append((name,path,method));values=parameters.unpack()
    if method=="GetNameOwner":return GLib.Variant("(s)",(":1.77",))
    if method=="GetUser":return GLib.Variant("(o)",("/org/freedesktop/login1/user/_42",))
    if values[0]=="org.freedesktop.login1.User":props={"Display":GLib.Variant("(so)",("c42","/org/freedesktop/login1/session/c42"))}
    else:props={"Id":GLib.Variant("s","c42"),"User":GLib.Variant("(uo)",(state["uid"],"/org/freedesktop/login1/user/_42")),"Active":GLib.Variant("b",True),"LockedHint":GLib.Variant("b",state["locked"]),"Type":GLib.Variant("s","wayland"),"Class":GLib.Variant("s","user")}
    return GLib.Variant("(a{sv})",(props,))
  scope=module.LoginScope(Gio,GLib,Connection(),42);self.assertTrue(scope.alive());self.assertTrue(all(name==":1.77" for name,path,method in calls if method!="GetNameOwner"));
  # The lock signal is received, but the main-context subscription has not run.
  # A following GetAll already reports unlocked. The I/O filter must latch it.
  message=SimpleNamespace(get_message_type=lambda:Gio.DBusMessageType.SIGNAL,get_sender=lambda:":1.77",get_path=lambda:scope.path,get_interface=lambda:"org.freedesktop.DBus.Properties",get_member=lambda:"PropertiesChanged",get_body=lambda:GLib.Variant("(sa{sv}as)",("org.freedesktop.login1.Session",{"LockedHint":GLib.Variant("b",True)},[])))
  self.assertIs(filters[0](scope.connection,message,True,None),message);self.assertFalse(scope.alive());self.assertFalse(state["locked"]);scope.close();self.assertFalse(filters)
  scope=module.LoginScope(Gio,GLib,Connection(),42);self.assertTrue(scope.alive());state["uid"]=43;self.assertFalse(scope.alive());state["uid"]=42;self.assertFalse(scope.alive())
if __name__=="__main__":unittest.main()
