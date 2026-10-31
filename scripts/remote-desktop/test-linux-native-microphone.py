#!/usr/bin/env python3
"""Generated Pulse API only; no audio server, device or daemon is opened."""
import ctypes as C
import importlib.util
from pathlib import Path
import struct
import unittest

spec=importlib.util.spec_from_file_location("mic",Path(__file__).with_name("linux-native-microphone.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Fake:
    def __init__(self): self.calls=[];self.virtual=True;self.moved=False;self.space=1920;self.writes=0;self.callback=None
    def __getattr__(self,name):
        def call(*args):
            self.calls.append((name,args))
            if name in ("pa_mainloop_new","pa_mainloop_get_api","pa_context_new","pa_stream_new"):return 1
            if name=="pa_context_get_state":return 4
            if name=="pa_context_get_server_protocol_version":return 35
            if name=="pa_stream_get_state":return 2
            if name=="pa_stream_get_device_index":return 8 if self.moved else 7
            if name=="pa_stream_get_device_name":return b"virtual"
            if name=="pa_stream_writable_size":return self.space
            if name=="pa_proplist_gets":return None
            if name=="pa_context_get_sink_info_by_name":
                self.callback=args[2]
                value=m.SinkInfo();value.name=b"virtual";value.index=7;value.description=b"Generated";value.monitor_source=9;value.monitor_source_name=b"virtual.monitor";value.driver=b"module-null-sink.c";value.flags=0 if self.virtual else 4
                args[2](None,C.pointer(value),0,None);args[2](None,None,1,None);return 3
            if name=="pa_stream_connect_playback":
                attr=C.cast(args[2],C.POINTER(m.BufferAttr)).contents;self.attributes=(attr.maxlength,attr.tlength)
            if name=="pa_stream_write":self.writes+=1
            return 0
        return call

class Tests(unittest.TestCase):
    def start(self,api=None):
        api=api or Fake();sink=m.PulseOutput("virtual",api,"unix:/generated",clock=lambda:1)
        self.addCleanup(sink.close);sink.start(lambda:True,2);return sink,api
    def test_explicit_flags_and_buffers(self):
        sink,api=self.start();connect=next(args for name,args in api.calls if name=="pa_stream_connect_playback")
        self.assertEqual(connect[1],b"virtual");self.assertEqual(connect[3],0x2200)
        self.assertEqual(api.attributes,(3840,1920))
        self.assertEqual(next(args[2] for name,args in api.calls if name=="pa_context_connect"),1)
        sink.write(bytes(1920),lambda:True);self.assertEqual(api.writes,1)
    def test_physical_target_never_started(self):
        api=Fake();api.virtual=False
        with self.assertRaisesRegex(m.MicrophoneFailure,"virtual_endpoint_required"):self.start(api)
        self.assertFalse(any(name=="pa_stream_connect_playback" for name,_ in api.calls))
    def test_moved_target_rejected(self):
        sink,api=self.start();api.moved=True
        with self.assertRaisesRegex(m.MicrophoneFailure,"audio_target_changed"):sink.write(bytes(1920),lambda:True)
        self.assertEqual(api.writes,0)
    def test_revocation_and_backpressure_drop(self):
        sink,api=self.start();sink.write(bytes(1920),lambda:False);api.space=0;sink.write(bytes(1920),lambda:True)
        self.assertEqual(api.writes,0)
    def test_cleanup_once(self):
        sink,api=self.start();sink.close();sink.close()
        for name in ("pa_stream_unref","pa_context_unref","pa_mainloop_free"):self.assertEqual(sum(n==name for n,_ in api.calls),1)
    def test_revoke_during_query_never_creates_stream(self):
        api=Fake();sink=m.PulseOutput("virtual",api,"unix:/generated",clock=lambda:1);self.addCleanup(sink.close)
        def active():return not any(name=="pa_context_get_sink_info_by_name" for name,_ in api.calls)
        with self.assertRaisesRegex(m.MicrophoneFailure,"audio_expired"):sink.start(active,2)
        self.assertFalse(any(name=="pa_stream_new" for name,_ in api.calls))
    def test_endpoint(self):
        for value in ("", "@DEFAULT_SINK@", "virtual;bad", "a"*257):
            with self.assertRaises(m.MicrophoneFailure):m.endpoint_name(value)
    def test_packet(self):
        valid=struct.pack("<Id",1,1010)+bytes(1920)
        self.assertEqual(m.microphone_packet(valid,0,1000)[:2],(1,1010))
        # Expired frames are framed but discarded by the renderer; replay/future fail.
        self.assertEqual(m.microphone_packet(valid,0,1100)[1],1010)
        for bad in (valid[:-1],struct.pack("<Id",0,1010)+bytes(1920),struct.pack("<Id",1,float("nan"))+bytes(1920),struct.pack("<Id",1,1151)+bytes(1920)):
            with self.assertRaises(m.MicrophoneFailure):m.microphone_packet(bad,0,1000)
    def test_abi_prefix(self):
        self.assertEqual(C.sizeof(m.SampleSpec),12);self.assertEqual(m.SinkInfo.proplist.offset,344);self.assertEqual(C.sizeof(m.BufferAttr),20)

if __name__=="__main__":unittest.main()
