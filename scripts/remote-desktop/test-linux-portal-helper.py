"""Generated input and pipeline checks. Never connects to a portal/display/input device."""
import importlib.util
import pathlib
import unittest
import threading
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location("portal_helper",pathlib.Path(__file__).with_name("linux-portal-helper.py"));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class MonitorRoster(unittest.TestCase):
 def stream(self,node=55,serial=987,identifier="DP-1",position=(-1280,-200),size=(1280,800)):
  return (node,{"pipewire-serial":serial,"id":identifier,"position":position,"size":size,"source_type":1})
 def test_selection_uses_stable_id_and_preserves_logical_geometry(self):
  streams=[self.stream(),self.stream(56,988,"DP-2",(0,0),(1920,1080))]
  selected,stream,records,stable=module.portal_monitor_streams(streams,"portal:DP-2")
  self.assertEqual(selected,"portal:DP-2");self.assertIs(stream,streams[1]);self.assertTrue(stable);self.assertEqual(records[0]["x"],-1280);self.assertEqual(records[0]["width"],1280)
  with self.assertRaises(module.NativeFailure) as error:module.portal_monitor_streams(streams,"portal:missing")
  self.assertEqual(error.exception.code,"source_changed")
 def test_ambiguous_or_reused_sources_are_rejected(self):
  for streams in ([self.stream(),self.stream(55,988,"DP-2")],[self.stream(),self.stream(56,987,"DP-2")],[self.stream(),self.stream(56,988,"DP-1")],[],[self.stream(serial=0)]):
   with self.assertRaises(module.NativeFailure):module.portal_monitor_streams(streams)
 def test_missing_position_or_id_never_invents_switchable_geometry(self):
  chosen,stream,records,stable=module.portal_monitor_streams([self.stream(position=None)])
  self.assertIsNone(records);self.assertTrue(stable)
  chosen,stream,records,stable=module.portal_monitor_streams([self.stream(identifier=None)])
  self.assertFalse(stable);self.assertEqual(chosen,"portal:serial-987")
 def test_retina_capture_size_is_separate_and_restore_requires_permission(self):
  h=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None),None)
  h.config={"monitors":True,"restore":"generated-private"};h.monitor_selected="portal:DP-1";h.monitor_stable=True;h.restore_token="replacement-private"
  h.monitor_records=module.portal_monitor_streams([self.stream()])[2]
  layout=h.monitor_layout((2560,1600));self.assertEqual(layout["pixelSize"],{"width":2560,"height":1600});self.assertEqual(layout["bounds"]["width"],1280);self.assertTrue(layout["switchingSupported"])
  h.restore_token=None;self.assertFalse(h.monitor_layout((2560,1600))["switchingSupported"])

class NativeAudioRouting(unittest.TestCase):
 def helper(self):
  from unittest.mock import Mock
  h=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None),None)
  h.audio_available=True;h.native.current={"id":"22222222-2222-4222-8222-222222222222"};h.native_live=Mock(return_value=True)
  return h
 def command(self,h):
  return {"type":"native_audio","enabled":True,"id":h.native.current["id"],"pipeName":"SodaDesktopAudio-"+"a"*32,"pipePath":"/generated-only.sock","clientPid":123}
 def test_only_explicit_current_video_with_audio_ceiling_creates_an_actor(self):
  from unittest.mock import Mock,patch
  h=self.helper();factory=Mock();command=self.command(h)
  with patch.object(module._native_audio,"SystemAudioActor",factory):
   h.audio_available=False;h.native_command(command);factory.assert_not_called()
   h.audio_available=True;h.native_command({**command,"id":"33333333-3333-4333-8333-333333333333"});factory.assert_not_called()
   h.native_command(command);factory.assert_called_once();active=factory.call_args.args[2]
   self.assertTrue(active());h.native.current=None;self.assertFalse(active())
 def test_replacement_waits_for_physical_retirement_and_old_disable_is_ignored(self):
  from unittest.mock import Mock,patch
  h=self.helper();old=SimpleNamespace(id="33333333-3333-4333-8333-333333333333",closed=threading.Event(),stop=Mock());h.audio_actor=old;factory=Mock();command=self.command(h)
  with patch.object(module._native_audio,"SystemAudioActor",factory):
   h.native_command(command);factory.assert_not_called();self.assertIs(h.audio_actor,old)
   old.closed.set();new=SimpleNamespace(id=command["id"],closed=threading.Event(),stop=Mock());factory.return_value=new;h.native_command(command);self.assertIs(h.audio_actor,new)
   h.native_command({"type":"native_audio","enabled":False,"id":old.id});new.stop.assert_not_called()
   h.native_command({"type":"native_audio","enabled":False,"id":new.id});new.stop.assert_called_once()
 def test_source_or_video_retirement_stops_audio_without_waiting_under_gate(self):
  from unittest.mock import Mock
  h=self.helper();actor=SimpleNamespace(id=h.native.current["id"],stop=Mock());h.audio_actor=actor;h.native=SimpleNamespace(current=None,tick=lambda:None)
  h.pump_native();actor.stop.assert_called_once()

class NativeVideoReplacement(unittest.TestCase):
 def setup_video(self):
  from unittest.mock import Mock
  h=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None),None)
  clock=[100];granted=[True]
  h.native=module._native_video.NativeVideoFlow(lambda:granted[0],lambda:clock[0],Mock())
  old=SimpleNamespace(closed=threading.Event(),stop=Mock(),submit=Mock())
  h.native_worker=old
  return h,old,clock,granted
 def start(self,h):
  identifier=str(module.uuid.uuid4())
  h.native_command({"type":"native_video","enabled":True,"id":identifier,"fps":30,"bitrateKbps":2500})
  return identifier
 def test_replacement_waits_without_submitting_pixels_to_retiring_worker(self):
  from unittest.mock import Mock,patch
  h,old,clock,granted=self.setup_video();factory=Mock()
  with patch.object(module._native_video,"H264Worker",factory):
   identifier=self.start(h);self.assertIsNotNone(h.native.current,"replacement must remain pending until old encoder retires");stream=h.native.current;raw=bytearray([1,2,3]);h.native_raw=(stream,raw,1,1,100)
   h.pump_native();factory.assert_not_called();old.submit.assert_not_called();self.assertIsNone(h.native.inflight)
   h.native_command({"type":"native_video","enabled":False,"id":str(module.uuid.uuid4())})
   self.assertEqual(h.native.current["id"],identifier)
   old.closed.set();h.pump_native();factory.assert_called_once();self.assertIsNone(h.native_pending)
   factory.return_value.submit.assert_called_once();self.assertIs(h.native.current,stream)
 def test_scope_query_cannot_cross_pending_deadline_or_resurrect_cancelled_start(self):
  from unittest.mock import Mock,patch
  for reason in ("expiry","cancel"):
   h,old,clock,granted=self.setup_video();factory=Mock()
   with patch.object(module._native_video,"H264Worker",factory):
    identifier=self.start(h);self.assertIsNotNone(h.native.current,"replacement must remain pending until old encoder retires");queries=[0]
    def active():
     queries[0]+=1
     if queries[0]==2:
      if reason=="expiry":clock[0]=2101
      else:h.native_command({"type":"native_video","enabled":False,"id":identifier})
     return True
    h.native.active=active;old.closed.set();h.pump_native();factory.assert_not_called();self.assertIsNone(h.native.current)
 def test_cancel_expiry_and_source_revocation_never_resurrect_pending_encoder(self):
  from unittest.mock import Mock,patch
  for reason in ("cancel","expiry","source"):
   h,old,clock,granted=self.setup_video();factory=Mock()
   with patch.object(module._native_video,"H264Worker",factory):
    identifier=self.start(h);self.assertIsNotNone(h.native.current,"replacement must remain pending until old encoder retires");raw=bytearray([9]);h.native_raw=(h.native.current,raw,1,1,100)
    if reason=="cancel":h.native_command({"type":"native_video","enabled":False,"id":identifier})
    elif reason=="expiry":clock[0]=2101
    else:granted[0]=False
    old.closed.set();h.pump_native();factory.assert_not_called();self.assertIsNone(h.native.current);self.assertIsNone(h.native_pending);self.assertEqual(raw,bytes(1))

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
  helper=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None,idle_add=lambda *args:None),None);guard,c,a=self.setup_guard();helper.guard=guard;line=b"x"*40000+b"\n";helper.output_queue.put((line,guard.revision,1,None,False,None));chunks=[];input_done=threading.Event();threads=[]
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
 def idle_helper(self):
  gst=SimpleNamespace(StateChangeReturn=SimpleNamespace(FAILURE=-1),State=SimpleNamespace(PLAYING=4))
  helper=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None,idle_add=lambda *args:None),gst);helper.guard,c,a=self.setup_guard();helper.ready=True;helper.session="generated";helper.scope=SimpleNamespace(alive=lambda:a[0]);helper.pipeline=SimpleNamespace(get_state=lambda timeout:(0,4,0));helper.sink=SimpleNamespace(emit=lambda *args:None);helper.last_sample=module.time.monotonic()-2.5;helper.seq=7
  helper.failure_codes=[];helper.failure=lambda code:helper.failure_codes.append(code)
  return helper,a
 def test_damage_only_producer_preserves_image_time_sequence_and_input_floor(self):
  helper,a=self.idle_helper();sample=helper.last_sample;self.assertTrue(helper.pump());self.assertEqual(helper.failure_codes,[]);self.assertEqual(helper.seq,7);self.assertEqual(helper.last_sample,sample);self.assertEqual(helper.guard.seq,0)
  notice=module.json.loads(helper.output_queue.get_nowait()[0]);self.assertEqual(notice,{"type":"platform_idle","backend":"linux-portal","seq":7,"counter":1});self.assertTrue(helper.pump());self.assertTrue(helper.output_queue.empty())
 def test_quiet_but_paused_pipeline_ends_instead_of_holding_a_live_input_session(self):
  helper,a=self.idle_helper();helper.pipeline=SimpleNamespace(get_state=lambda timeout:(0,3,0));self.assertFalse(helper.pump());self.assertEqual(helper.failure_codes,["source_changed"]);self.assertTrue(helper.output_queue.empty())
 def test_idle_admission_rechecks_ack_new_frame_revision_scope_and_pipeline(self):
  for mode in ["ack","frame","revision","scope","paused","heartbeat"]:
   helper,a=self.idle_helper();helper.publish_idle();record=helper.output_queue.get_nowait();publish=record[-1];self.assertTrue(publish())
   if mode=="ack":helper.pending=7
   elif mode=="frame":helper.seq=8
   elif mode=="revision":helper.guard.revision+=1
   elif mode=="scope":a[0]=False
   elif mode=="paused":helper.pipeline=SimpleNamespace(get_state=lambda timeout:(0,3,0))
   elif mode=="heartbeat":helper.last_heartbeat=module.time.monotonic()-8
   self.assertFalse(publish(),mode)
 def test_writer_drops_a_queued_idle_notice_invalidated_before_publication(self):
  from unittest.mock import patch
  for mode in ["ack","frame","revision","scope","paused","heartbeat"]:
   helper,a=self.idle_helper();helper.publish_idle();record=helper.output_queue.get_nowait()
   if mode=="ack":helper.pending=7
   elif mode=="frame":helper.seq=8
   elif mode=="revision":helper.guard.revision+=1
   elif mode=="scope":a[0]=False
   elif mode=="paused":helper.pipeline=SimpleNamespace(get_state=lambda timeout:(0,3,0))
   elif mode=="heartbeat":helper.last_heartbeat=module.time.monotonic()-8
   records=iter([record]);helper.output_queue=SimpleNamespace(get=lambda **kwargs:next(records));chunks=[]
   fakeos=SimpleNamespace(set_blocking=lambda *args:None,write=lambda fd,data:chunks.append(data) or len(data),_exit=lambda _:self.fail("invalid queued notice was partially published"))
   with patch.object(module,"os",fakeos),patch.object(module.select,"select",lambda *args:([],[1],[])),patch.object(module.sys,"stdout",SimpleNamespace(fileno=lambda:1)):
    with self.assertRaises(StopIteration):helper.writer()
   self.assertEqual(chunks,[],mode)
 def test_writer_refuses_owner_expiry_during_the_native_pipeline_query(self):
  from unittest.mock import patch
  helper,a=self.idle_helper();helper.publish_idle();record=helper.output_queue.get_nowait();records=iter([record]);helper.output_queue=SimpleNamespace(get=lambda **kwargs:next(records));chunks=[];clock=[module.time.monotonic()]
  def query(_timeout):clock[0]+=8;return (0,4,0)
  helper.pipeline=SimpleNamespace(get_state=query)
  fakeos=SimpleNamespace(set_blocking=lambda *args:None,write=lambda fd,data:chunks.append(data) or len(data),_exit=lambda _:self.fail("expired record was partially published"))
  with patch.object(module.time,"monotonic",lambda:clock[0]),patch.object(module,"os",fakeos),patch.object(module.select,"select",lambda *args:([],[1],[])),patch.object(module.sys,"stdout",SimpleNamespace(fileno=lambda:1)):
   start=clock[0];self.assertFalse(helper.idle_valid(helper.seq,helper.guard.revision));clock[0]=start
   with self.assertRaises(StopIteration):helper.writer()
  self.assertEqual(chunks,[])
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
 def test_monitor_selection_requests_os_persistence_only_after_local_permission(self):
  self.helper.configure({"options":{"width":1280,"fps":10,"quality":65,"monitors":True},"allowInput":True,"allowMonitors":True})
  self.respond({"session_handle":self.GLib.Variant("o",self.helper.expected_session)});self.respond({})
  devices=next(call for call in self.calls if call[0]=="SelectDevices")[2][-1]
  sources=next(call for call in self.calls if call[0]=="SelectSources")[2][-1]
  self.assertEqual(devices["persist_mode"],2);self.assertTrue(sources["multiple"]);self.assertNotIn("restore_token",devices)
 def test_explicit_monitor_requires_private_restore_and_local_permission(self):
  for value in ({"allowMonitors":False},{"allowMonitors":True}):
   with self.assertRaises(module.NativeFailure):self.helper.configure({"options":{"width":1280,"fps":10,"quality":65,"monitors":True,"monitorDevice":"portal:DP-1"},**value})
  self.assertFalse(any(call[0]=="CreateSession" for call in self.calls))
 def test_restore_is_sent_to_portal_not_taken_from_viewer_options(self):
  self.helper.configure({"options":{"width":1280,"fps":10,"quality":65,"monitors":True,"monitorDevice":"portal:DP-1","restore_token":"viewer-untrusted"},"allowInput":False,"allowMonitors":True,"nativeMonitorRestoreToken":"server-private"})
  self.respond({"session_handle":self.GLib.Variant("o",self.helper.expected_session)})
  sources=next(call for call in self.calls if call[0]=="SelectSources")[2][-1];self.assertEqual(sources["restore_token"],"server-private");self.assertEqual(sources["persist_mode"],2)
 def test_clipboard_only_session_requests_no_input_and_requires_os_start_grant(self):
  from unittest.mock import patch
  with patch.object(module.sys,"argv",["generated","--allow-clipboard"]):
   self.helper.configure({"options":{"width":1280,"fps":10,"quality":65},"allowInput":False,"allowClipboard":True})
  self.respond({"session_handle":self.GLib.Variant("o",self.helper.expected_session)});self.respond({});self.respond({})
  methods=[call[0] for call in self.calls];self.assertLess(methods.index("RequestClipboard"),methods.index("Start"));self.assertEqual(next(call for call in self.calls if call[0]=="SelectDevices")[2][-1]["types"],0)
  self.assertNotIn("persist_mode",next(call for call in self.calls if call[0]=="SelectSources")[2][-1]);self.assertIsNotNone(self.helper.clipboard)
  self.helper.started({"clipboard_enabled":False,"devices":3,"streams":[(55,{"size":(1000,600),"source_type":1,"pipewire-serial":987654321})]})
  self.assertFalse(self.helper.clipboard.os_enabled);self.assertEqual(self.helper.guard.devices,0)
 def test_clipboard_api_unavailable_does_not_invent_an_os_grant(self):
  from unittest.mock import patch
  original=self.connection.call_sync
  def reject(name,path,interface,method,params,*args):
   if method=="GetAll" and params.unpack()[0]==module.PortalTextClipboard.INTERFACE:raise RuntimeError("generated missing portal interface")
   return original(name,path,interface,method,params,*args)
  self.connection.call_sync=reject
  with patch.object(module.sys,"argv",["generated","--allow-clipboard"]):self.helper.configure({"options":{"width":1280,"fps":10,"quality":65},"allowInput":False,"allowClipboard":True})
  self.respond({"session_handle":self.GLib.Variant("o",self.helper.expected_session)});self.respond({});self.respond({});self.assertIsNone(self.helper.clipboard)
  self.assertFalse(any(call[0]=="RequestClipboard" for call in self.calls));self.assertEqual(self.helper.interface,self.helper.RD)
 def test_screencast_only_session_keeps_nonpersistent_permission(self):
  self.create(False);selection=next(call for call in self.calls if call[0]=="SelectSources")[2][-1];self.assertEqual(selection["persist_mode"],0);self.assertNotIn("restore_token",selection)
 def test_clipboard_needs_explicit_local_helper_flag(self):
  from unittest.mock import patch
  with patch.object(module.sys,"argv",["generated"]):self.helper.configure({"options":{"width":1280,"fps":10,"quality":65},"allowInput":False,"allowClipboard":True})
  self.respond({"session_handle":self.GLib.Variant("o",self.helper.expected_session)});self.respond({});self.assertIsNone(self.helper.clipboard);self.assertEqual(self.helper.interface,self.helper.SC);self.assertFalse(any(call[0]=="RequestClipboard" for call in self.calls))
 def test_os_choice_is_explicit_nonpersistent_and_cancellation_is_terminal(self):
  self.create();methods=[call[0] for call in self.calls];self.assertEqual(methods,["GetAll","CreateSession","SelectDevices","SelectSources","Start"])
  selection=next(call for call in self.calls if call[0]=="SelectSources")[2][-1];self.assertEqual(selection["types"],1);self.assertFalse(selection["multiple"]);self.assertNotIn("persist_mode",selection);self.assertNotIn("restore_token",selection);self.assertEqual(next(call for call in self.calls if call[0]=="SelectDevices")[2][-1]["persist_mode"],0)
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
class Regions(unittest.TestCase):
 def spec(self,**change):return {"id":"12345678-1234-4234-8234-123456789012","x":1,"y":0,"width":2,"height":1,**change}
 def test_raw_stride_and_offset_bind_only_requested_pixels(self):
  r=module.RegionProofs();r.configure([self.spec()],4,3);pixels=bytearray(4+16*3)
  r.capture(1,pixels,4,3,16,4);a=r.take(1,4,3)[0]["digest"];self.assertEqual(len(a),64)
  pixels[4+16]=99;r.capture(2,pixels,4,3,16,4);self.assertEqual(a,r.take(2,4,3)[0]["digest"])
  pixels[4+3]=99;r.capture(3,pixels,4,3,16,4);self.assertNotEqual(a,r.take(3,4,3)[0]["digest"])
 def test_source_pts_size_nonce_clear_and_bounded_cache(self):
  r=module.RegionProofs();r.configure([self.spec()],4,3);p=bytes(48);r.capture(1,p,4,3,16);first=r.take(1,4,3)[0]["digest"]
  self.assertIsNone(r.take(1,4,3));r.capture(2,p,4,3,16);self.assertIsNone(r.take(2,3,3))
  r.configure([self.spec(id="22345678-1234-4234-8234-123456789012")],4,3);r.capture(3,p,4,3,16);self.assertNotEqual(first,r.take(3,4,3)[0]["digest"])
  for pts in range(20):r.capture(pts,p,4,3,16)
  self.assertEqual(len(r.frames),8);self.assertIsNone(r.take(11,4,3));self.assertIsNotNone(r.take(19,4,3));r.clear();self.assertEqual(r.frames,{});self.assertEqual(r.specs,[])
 def test_invalid_configuration_is_atomic_and_pixel_bounds_fail_closed(self):
  r=module.RegionProofs();r.configure([self.spec()],4,3);p=bytes(48);r.capture(1,p,4,3,16)
  for bad in [[self.spec(x=3)],[self.spec(id="bad")],[self.spec(),self.spec()],[self.spec(x=True)],[self.spec(width=2048,height=1024)],None]:
   with self.assertRaises(module.NativeFailure):r.configure(bad,4,3)
   self.assertEqual(r.specs,[self.spec()])
  self.assertIsNotNone(r.take(1,4,3))
  for stride,offset,data in [(11,0,p),(16,5,p),(16,0,p[:8])]:
   with self.assertRaises(module.NativeFailure):r.capture(2,data,4,3,stride,offset)
 def test_reconfiguration_discards_old_pts_and_invalidates_queued_publication(self):
  helper=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None),None,video=object())
  helper.transfer_size=(4,3);helper.guard=module.InputGuard(lambda *args:None,lambda:True,(4,3),1,3)
  helper.regions.configure([self.spec()],4,3);helper.regions.capture(1,bytes(48),4,3,16);helper.queued=(b"old",);revision=helper.guard.revision
  helper.command({"type":"keyframe","regions":[self.spec(id="22345678-1234-4234-8234-123456789012")]})
  self.assertGreater(helper.guard.revision,revision);self.assertIsNone(helper.queued);self.assertIsNone(helper.regions.take(1,4,3));self.assertEqual(helper.guard.seq,0)
  helper.command({"type":"keyframe","regions":[]});self.assertFalse(helper.regions.specs)
 def test_real_video_meta_stride_offset_and_mismatch_through_probe(self):
  try:
   import gi;gi.require_version("Gst","1.0");gi.require_version("GstVideo","1.0");from gi.repository import Gst,GstVideo
  except (ImportError,ValueError):self.skipTest("GStreamer video GI not installed")
  Gst.init(None);failures=[]
  helper=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None,idle_add=lambda *args:failures.append(args)),Gst,video=GstVideo)
  helper.regions.configure([self.spec()],4,3);caps=Gst.Caps.from_string("video/x-raw,format=BGR,width=4,height=3,framerate=1/1")
  pad=SimpleNamespace(get_current_caps=lambda:caps);pixels=bytes(range(52))
  def buffer(meta_width):
   raw=Gst.Buffer.new_allocate(None,len(pixels),None);raw.fill(0,pixels);raw.pts=100
   GstVideo.buffer_add_video_meta_full(raw,GstVideo.VideoFrameFlags.NONE,GstVideo.VideoFormat.BGR,meta_width,3,1,[4,0,0,0],[16,0,0,0]);return raw
  raw=buffer(4);self.assertEqual(helper.region_probe(pad,SimpleNamespace(get_buffer=lambda:raw)),Gst.PadProbeReturn.OK)
  expected=module.RegionProofs();expected.configure([self.spec()],4,3);expected.capture(100,pixels,4,3,16,4)
  self.assertEqual(helper.regions.take(100,4,3),expected.take(100,4,3));self.assertFalse(failures)
  wrong=buffer(5);self.assertEqual(helper.region_probe(pad,SimpleNamespace(get_buffer=lambda:wrong)),Gst.PadProbeReturn.DROP);self.assertEqual(len(failures),1)
 def test_generated_encoder_pad_pairs_raw_proofs_with_matching_jpeg_pts(self):
  try:
   import gi;gi.require_version("Gst","1.0");gi.require_version("GstVideo","1.0");from gi.repository import Gst,GstVideo
  except (ImportError,ValueError):self.skipTest("GStreamer video GI not installed")
  Gst.init(None)
  helper=module.PortalHelper(None,SimpleNamespace(MainLoop=lambda:None,idle_add=lambda *args:self.fail("probe failed")),Gst,video=GstVideo)
  helper.regions.configure([self.spec()],4,3)
  pipeline=Gst.parse_launch("videotestsrc pattern=red num-buffers=1 ! video/x-raw,format=BGR,width=4,height=3 ! jpegenc name=encoder ! appsink name=sink sync=false")
  pipeline.get_by_name("encoder").get_static_pad("sink").add_probe(Gst.PadProbeType.BUFFER,helper.region_probe)
  try:
   pipeline.set_state(Gst.State.PLAYING);sample=pipeline.get_by_name("sink").emit("try-pull-sample",3*Gst.SECOND);self.assertIsNotNone(sample)
   pts=sample.get_buffer().pts;proof=helper.regions.take(pts,4,3);self.assertEqual(proof[0]["id"],self.spec()["id"])
   expected=module.RegionProofs();expected.configure([self.spec()],4,3);expected.capture(pts,bytes([0,0,255]*4*3),4,3,12)
   self.assertEqual(proof,expected.take(pts,4,3));self.assertIsNone(helper.regions.take(pts+1,4,3))
  finally:pipeline.set_state(Gst.State.NULL)
class Clipboard(unittest.TestCase):
 def setup_clipboard(self):
  import os
  from gi.repository import Gio,GLib
  state={"alive":True,"utc":1000.,"mono":0.,"query_delay":0.,"pending":None,"owner":False};calls=[];results=[];published=[];done=[];fds=[]
  helper=SimpleNamespace(NAME=module.PortalHelper.NAME,PATH=module.PortalHelper.PATH,Gio=Gio,GLib=GLib,output_gate=threading.RLock(),session="/generated/session",dead=False,ready=True,scope=SimpleNamespace(alive=lambda:state["alive"]),last_heartbeat=module.time.monotonic(),config={"input":True},guard=SimpleNamespace(devices=3))
  def output(value,revision=None,publish=None):results.append(dict(value));published.append(publish)
  helper.output=output
  class Connection:
   def call_sync(self,name,path,interface,method,args,*_):
    calls.append((method,args.unpack()))
    if state["pending"]:state["pending"]()
   def call_with_unix_fd_list_sync(self,name,path,interface,method,args,*_):
    calls.append((method,args.unpack()))
    if method=="SelectionRead":
     read,write=os.pipe();os.write(write,state.get("data",b"generated UTF8"));os.close(write);fd=read
    else:
     read,write=os.pipe();state["transfer_read"]=read;fds.append((read,os.fstat(read).st_dev,os.fstat(read).st_ino));fd=write
    fds.append((fd,os.fstat(fd).st_dev,os.fstat(fd).st_ino))
    return GLib.Variant("(h)",(0,)),SimpleNamespace(get_length=lambda:1,get=lambda index:fd)
   def call(self,name,path,interface,method,args,*_):done.append((method,args.unpack()))
  helper.connection=Connection();clip=module.PortalTextClipboard(helper,clock=lambda:state["utc"],mono=lambda:state["mono"]);clip.os_enabled=True
  self.addCleanup(lambda:[os.close(fd) for fd,dev,ino in set(fds) if self.fd_open(fd,dev,ino)])
  return clip,helper,state,calls,results,published,done
 def fd_open(self,fd,dev,ino):
  import os
  try:info=os.fstat(fd);return (info.st_dev,info.st_ino)==(dev,ino)
  except OSError:return False
 def request(self,id=1,operation="read",generation=1,text="copy"):
  return {"type":"clipboard","id":id,"operation":operation,"generation":generation,"expiresAt":1400,"text":text}
 def await_result(self,results):
  for _ in range(100):
   if results:return results[-1]
   module.time.sleep(.005)
  self.fail("Owned clipboard worker did not settle")
 def test_requires_os_and_human_grant_reads_real_owned_utf8_pipe(self):
  clip,h,state,calls,results,publication,done=self.setup_clipboard()
  clip.submit(self.request());self.assertFalse(results.pop()["ok"]);self.assertFalse(calls)
  clip.os_enabled=False;clip.control({"generation":1,"enabled":True});clip.submit(self.request());self.assertFalse(results.pop()["ok"])
  clip.os_enabled=True;clip.control({"generation":2,"enabled":True});state["data"]="日本語😀".encode();clip.submit(self.request(generation=2))
  self.assertEqual(self.await_result(results)["text"],"日本語😀");self.assertEqual(calls[-1],("SelectionRead",("/generated/session","text/plain;charset=utf-8")));self.assertTrue(publication[-1]())
  clip.control({"generation":3,"enabled":False});self.assertFalse(publication[-1]())
 def test_write_mime_offer_scope_and_separate_input_ceiling(self):
  clip,h,state,calls,results,publication,done=self.setup_clipboard();clip.control({"generation":1,"enabled":True})
  h.guard.devices=0;clip.submit(self.request(operation="write"));self.assertFalse(self.await_result(results)["ok"]);self.assertFalse(calls);results.clear()
  h.guard.devices=3;clip.submit(self.request(id=2,operation="write",text="コピー😀"));self.assertTrue(self.await_result(results)["ok"])
  self.assertEqual(calls[-1][0],"SetSelection");self.assertEqual(tuple(calls[-1][1][1]["mime_types"]),clip.MIMES);self.assertEqual(clip.owned,"コピー😀".encode())
  clip.control({"generation":2,"enabled":False});clip.control({"generation":1,"enabled":True});self.assertFalse(clip.enabled)
  # A locally pasted copy may remain in this live portal session, but remote reads are revoked.
  self.assertEqual(clip.owned,"コピー😀".encode());clip.close();self.assertIsNone(clip.owned)
 def test_read_scope_change_size_and_malformed_utf8_never_return_text(self):
  for data in [b"\xff",("😀"*4097).encode(),b"x"*32769]:
   clip,h,state,calls,results,publication,done=self.setup_clipboard();clip.control({"generation":1,"enabled":True});state["data"]=data
   # Keep test pipe writes below kernel capacity; large response uses a writer thread.
   import os
   def fd_call(name,path,interface,method,args,*_):
    read,write=os.pipe()
    def feed():
     try:
      remaining=data
      while remaining:remaining=remaining[os.write(write,remaining):]
     except BrokenPipeError:pass
     finally:os.close(write)
    threading.Thread(target=feed,daemon=True).start()
    return h.GLib.Variant("(h)",(0,)),SimpleNamespace(get_length=lambda:1,get=lambda index:read)
   h.connection.call_with_unix_fd_list_sync=fd_call;clip.submit(self.request());result=self.await_result(results);self.assertFalse(result["ok"]);self.assertNotIn("text",result)
 def test_query_time_consumes_original_budget_before_io(self):
  clip,h,state,calls,results,publication,done=self.setup_clipboard();clip.control({"generation":1,"enabled":True})
  def alive():state["mono"]=500;return True
  h.scope.alive=alive;clip.submit(self.request(operation="write"));self.assertFalse(self.await_result(results)["ok"]);self.assertFalse(calls)
 def test_revoke_pending_read_retains_busy_until_physical_completion(self):
  clip,h,state,calls,results,publication,done=self.setup_clipboard();clip.control({"generation":1,"enabled":True});entered=threading.Event();release=threading.Event()
  def read(ticket):entered.set();release.wait(1);return "private old text"
  clip.read=read;clip.submit(self.request());self.assertTrue(entered.wait(1));clip.control({"generation":2,"enabled":False});clip.control({"generation":3,"enabled":True})
  try:
   clip.submit(self.request(id=2,generation=3));self.assertEqual(len(results),1);self.assertFalse(results[-1]["ok"]);self.assertTrue(clip.busy)
  finally:release.set()
  for _ in range(100):
   if not clip.busy:break
   module.time.sleep(.005)
  self.assertFalse(clip.busy);self.assertTrue(all("text" not in r for r in results))
 def test_os_transfer_writes_owned_text_then_completes_and_closes_fd(self):
  import os
  clip,h,state,calls,results,publication,done=self.setup_clipboard();clip.owned=bytearray("paste😀".encode());clip.owner=True
  clip.transfer(None,None,None,None,None,h.GLib.Variant("(osu)",(h.session,"text/plain;charset=utf-8",42)))
  for _ in range(100):
   if done:break
   module.time.sleep(.005)
  self.assertEqual(done,[("SelectionWriteDone",(h.session,42,True))]);self.assertEqual(os.read(state["transfer_read"],100),"paste😀".encode())
 def test_revocation_after_pipe_readiness_performs_no_new_read(self):
  from unittest.mock import patch
  import os
  clip,h,state,calls,results,publication,done=self.setup_clipboard();clip.control({"generation":1,"enabled":True});reads=[]
  def ready(read,write,error,timeout):state["alive"]=False;return read,write,error
  original=os.read
  def read(fd,size):reads.append(fd);return original(fd,size)
  with patch.object(module.select,"select",ready),patch.object(module.os,"read",read):
   clip.submit(self.request());self.assertFalse(self.await_result(results)["ok"])
  self.assertFalse(reads)
 def test_revocation_after_pipe_write_readiness_performs_no_new_write(self):
  from unittest.mock import patch
  import os
  clip,h,state,calls,results,publication,done=self.setup_clipboard();clip.owned=bytearray(b"private copy");clip.owner=True;writes=[]
  def ready(read,write,error,timeout):state["alive"]=False;return read,write,error
  original=os.write
  def write(fd,data):writes.append(fd);return original(fd,data)
  with patch.object(module.select,"select",ready),patch.object(module.os,"write",write):
   clip.transfer(None,None,None,None,None,h.GLib.Variant("(osu)",(h.session,"text/plain;charset=utf-8",42)))
   for _ in range(100):
    if done:break
    module.time.sleep(.005)
  self.assertEqual(done,[("SelectionWriteDone",(h.session,42,False))]);self.assertFalse(writes)
 def test_owner_notifications_confined_to_own_session_and_text_types(self):
  clip,h,state,calls,results,publication,done=self.setup_clipboard();clip.owned=bytearray(b"old");clip.owner=True
  params=lambda session:h.GLib.Variant("(oa{sv})",(session,{"mime_types":h.GLib.Variant("as",["image/png"]),"session_is_owner":h.GLib.Variant("b",False)}))
  clip.owner_changed(None,None,None,None,None,params("/wrong"));self.assertEqual(clip.owned,b"old")
  clip.owner_changed(None,None,None,None,None,params(h.session));self.assertIsNone(clip.owned);self.assertEqual(clip.types,("image/png",))
  clip.control({"generation":1,"enabled":True});clip.submit(self.request());self.assertEqual(self.await_result(results)["text"],"");self.assertFalse(calls)
class RichClipboard(unittest.TestCase):
 setup_clipboard=Clipboard.setup_clipboard
 fd_open=Clipboard.fd_open
 await_result=Clipboard.await_result
 def setup_rich(self):
  value=self.setup_clipboard();clip,helper=value[:2];helper.config["rich"]=True;clip.control({"generation":1,"enabled":True});self.addCleanup(clip.close);return value
 def ticket(self,state):return (1,state["utc"]+400,state["mono"],state["mono"]+400)
 def command(self,identifier,operation,**fields):return {"type":"clipboard_rich","id":identifier,"operation":operation,"generation":1,"expiresAt":1400,**fields}
 def bundle(self):
  return {"text":"コピー😀","html":"<b>コピー</b>","rtf":module.base64.b64encode(b"{\\rtf1 generated}").decode(),"png":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII="}
 def begin_write(self,clip,state,bundle=None):
  identifier=str(module.uuid.uuid4());data=module.json.dumps(bundle or self.bundle(),ensure_ascii=False,separators=(",",":")).encode();ticket=self.ticket(state)
  reply,_=clip.rich.request(self.command(identifier,"begin",size=len(data)),ticket);self.assertEqual(reply["stage"],"begin")
  for offset in range(0,len(data),module.RichClipboardProtocol.CHUNK):
   reply,_=clip.rich.request(self.command(identifier,"push",offset=offset,data=module.base64.b64encode(data[offset:offset+module.RichClipboardProtocol.CHUNK]).decode()),ticket)
  return identifier,ticket
 def test_bundle_limits_and_png_dimensions_match_parent(self):
  cls=module.RichClipboardProtocol;self.assertEqual(cls.bundle(self.bundle()),self.bundle())
  png=bytearray(module.base64.b64decode(self.bundle()["png"]));png[16:20]=(4097).to_bytes(4,"big")
  for invalid in [{},{"unknown":"x"},{"text":"bad\0"},{"html":"x"*(cls.TEXT+1)},{"rtf":"YWJjZA=="},{"png":module.base64.b64encode(png).decode()}]:
   with self.assertRaises(Exception):cls.bundle(invalid)
 def test_read_chunking_version_publication_and_retirement(self):
  clip,h,state,calls,results,publish,done=self.setup_rich();bundle={**self.bundle(),"text":"x"*30000};reads=[]
  clip.read_rich=lambda ticket:(reads.append(1) or bundle);identifier=str(module.uuid.uuid4());ticket=self.ticket(state)
  start,witness=clip.rich.request(self.command(identifier,"read"),ticket);self.assertTrue(witness());data=bytearray()
  while len(data)<start["size"]:
   reply,witness=clip.rich.request(self.command(identifier,"pull",offset=len(data)),ticket);self.assertTrue(witness());piece=module.base64.b64decode(reply["data"]);self.assertEqual(reply["offset"],len(data)+len(piece));data.extend(piece)
  self.assertEqual(module.json.loads(data),bundle);self.assertIsNone(clip.rich.current)
  with self.assertRaises(module.NativeFailure):clip.rich.request(self.command(identifier,"read"),ticket)
  self.assertEqual(reads,[1]);clip.owner_version+=1;self.assertFalse(witness())
 def test_write_offers_all_mimes_and_local_png_paste_after_revoke(self):
  import os
  clip,h,state,calls,results,publish,done=self.setup_rich();identifier,ticket=self.begin_write(clip,state)
  reply,witness=clip.rich.request(self.command(identifier,"commit"),ticket);self.assertTrue(witness());self.assertEqual(reply["stage"],"done")
  self.assertEqual(bytes(clip.owned_formats["image/png"]),module.base64.b64decode(self.bundle()["png"]));self.assertEqual(calls[-1][0],"SetSelection")
  self.assertEqual(set(clip.owned_formats),{"text/plain;charset=utf-8","text/plain","text/html","application/rtf","text/rtf","image/png"})
  clip.control({"generation":2,"enabled":False})
  clip.transfer(None,None,None,None,None,h.GLib.Variant("(osu)",(h.session,"image/png",1)))
  self.await_result(done);self.assertEqual(done[-1][1],(h.session,1,True));self.assertEqual(os.read(state["transfer_read"],4096),module.base64.b64decode(self.bundle()["png"]))
 def test_input_ceiling_and_clipboard_version_are_checked_before_commit(self):
  for change in ("input","version"):
   clip,h,state,calls,results,publish,done=self.setup_rich();identifier,ticket=self.begin_write(clip,state)
   if change=="input":h.guard.devices=0
   else:clip.owner_version+=1
   with self.assertRaises(module.NativeFailure):clip.rich.request(self.command(identifier,"commit"),ticket)
   self.assertFalse(calls)
 def test_original_budget_and_cancel_after_native_query_prevent_write(self):
  clip,h,state,calls,results,publish,done=self.setup_rich();identifier,ticket=self.begin_write(clip,state)
  def alive():
   h.scope.alive=lambda:True
   clip.rich.cancel(self.command(identifier,"cancel"),ticket)
   return True
  h.scope.alive=alive
  with self.assertRaises(module.NativeFailure):clip.rich.request(self.command(identifier,"commit"),ticket)
  self.assertFalse(calls)
  identifier,ticket=self.begin_write(clip,state)
  h.scope.alive=lambda:(state.update(mono=500) or True)
  with self.assertRaises(module.NativeFailure):clip.rich.request(self.command(identifier,"commit"),ticket)
  self.assertFalse(calls)
 def test_final_chunk_cancel_never_revives_after_bounded_cache_eviction(self):
  clip,h,state,*_=self.setup_rich();clip.read_rich=lambda ticket:{"text":"generated"}
  identifier=str(module.uuid.uuid4());ticket=self.ticket(state)
  clip.rich.request(self.command(identifier,"read"),ticket)
  reply,witness=clip.rich.request(self.command(identifier,"pull",offset=0),ticket)
  self.assertTrue(witness());clip.rich.cancel(self.command(identifier,"cancel"),ticket);self.assertFalse(witness())
  for _ in range(32):clip.rich.cancel(self.command(str(module.uuid.uuid4()),"cancel"),ticket)
  self.assertFalse(witness())
  other=str(module.uuid.uuid4());reply,other_witness=clip.rich.request(self.command(other,"read"),ticket)
  clip.rich.cancel(self.command(identifier,"cancel"),ticket);self.assertTrue(other_witness())
 def test_cancelled_worker_retains_busy_and_never_publishes_old_content(self):
  clip,h,state,calls,results,publish,done=self.setup_rich();entered=threading.Event();release=threading.Event();identifier=str(module.uuid.uuid4())
  def read(ticket):entered.set();release.wait(1);return {"text":"private generated old content"}
  clip.read_rich=read;clip.submit_rich(self.command(identifier,"read"));self.assertTrue(entered.wait(1))
  try:
   clip.submit_rich(self.command(identifier,"cancel"));self.assertEqual(results[-1]["stage"],"cancelled")
   clip.submit_rich(self.command(str(module.uuid.uuid4()),"read"));self.assertFalse(results[-1]["ok"]);self.assertTrue(clip.busy)
  finally:release.set()
  for _ in range(100):
   if not clip.busy:break
   module.time.sleep(.005)
  self.assertFalse(clip.busy);self.assertTrue(all("data" not in value for value in results));self.assertIsNone(clip.rich.current)
 def test_disabled_rich_config_never_reads_and_grant_change_wipes_cached_bytes(self):
  clip,h,state,calls,results,publish,done=self.setup_rich();h.config["rich"]=False;clip.read_rich=lambda ticket:self.fail("Disabled rich clipboard read")
  clip.submit_rich(self.command(str(module.uuid.uuid4()),"read"));self.assertFalse(results[-1]["ok"]);self.assertFalse(calls)
  h.config["rich"]=True;identifier=str(module.uuid.uuid4());clip.rich.request(self.command(identifier,"begin",size=10),self.ticket(state));data=clip.rich.current["data"];data[0]=9
  clip.control({"generation":2,"enabled":False});self.assertEqual(data,bytes(10));self.assertIsNone(clip.rich.current)
 def test_idle_expiry_and_invalid_suffix_never_extend_transaction(self):
  clip,h,state,calls,results,publish,done=self.setup_rich();identifier=str(module.uuid.uuid4());ticket=self.ticket(state)
  clip.rich.request(self.command(identifier,"begin",size=10),ticket);data=clip.rich.current["data"];data[0]=9
  with self.assertRaises(module.NativeFailure):clip.rich.request(self.command(identifier,"push",offset=0,data="AQ==",path="unexpected"),ticket)
  state["mono"]=5001;clip.rich.expire();self.assertIsNone(clip.rich.current);self.assertEqual(data,bytes(10))

class Entry(unittest.TestCase):
 def test_real_main_accepts_clipboard_flag_before_dispatching_owned_stub(self):
  from unittest.mock import patch
  import io,contextlib
  invoked=[]
  fake=lambda *args,**kwargs:SimpleNamespace(run=lambda:invoked.append(tuple(module.sys.argv[1:])))
  with patch.object(module.sys,"argv",["generated","--allow-clipboard"]),patch.object(module,"PortalHelper",fake),contextlib.redirect_stdout(io.StringIO()):
   try:module.main();code=0
   except SystemExit as error:code=error.code
  self.assertEqual(code,0);self.assertEqual(invoked,[("--allow-clipboard",)])
 def test_unknown_or_duplicate_flags_are_rejected_before_any_backend(self):
  from unittest.mock import patch
  import io,contextlib
  for flags in [["--unknown"],["--unknown","--probe"],["--allow-clipboard","--allow-clipboard"]]:
   output=io.StringIO()
   with patch.object(module.sys,"argv",["generated",*flags]),patch.object(module,"PortalHelper",lambda *args,**kwargs:self.fail("Invalid argument started backend")),contextlib.redirect_stdout(output):
    with self.assertRaises(SystemExit) as error:module.main()
   self.assertEqual(error.exception.code,1);self.assertEqual(module.json.loads(output.getvalue())["code"],"unsupported")
 def test_probe_with_clipboard_flag_is_import_only(self):
  from unittest.mock import patch
  import io,contextlib
  output=io.StringIO()
  with patch.object(module.sys,"argv",["generated","--allow-clipboard","--probe"]),patch.object(module,"PortalHelper",lambda *args,**kwargs:self.fail("Probe started backend")),contextlib.redirect_stdout(output):module.main()
  self.assertEqual(module.json.loads(output.getvalue()),{"backend":"linux-portal","dependencies":True})
if __name__=="__main__":unittest.main()
