#!/usr/bin/env python3
"""Compile the actual mode callbacks against fake IDD types; no Windows API calls."""
from pathlib import Path
import re
import subprocess
import tempfile

source = Path(__file__).with_name('Driver.cpp').read_text()
def function(name):
    start = source.index('NTSTATUS ' + name + '(')
    body = source.index('{', start)
    depth = 1
    end = body + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]
array = re.search(r'static const struct IndirectSampleMonitor::SampleMonitorMode s_SampleDefaultModes\[\]\s*=\s*\{.*?\n\};', source, re.S).group()
prefix = r'''
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <iostream>
#include <vector>
using namespace std;
using DWORD=uint32_t;using UINT=uint32_t;using NTSTATUS=int;using IDDCX_MONITOR=void*;
constexpr int STATUS_SUCCESS=0,STATUS_BUFFER_TOO_SMALL=-1,IDDCX_MONITOR_MODE_ORIGIN_DRIVER=1;
#define UNREFERENCED_PARAMETER(x) (void)(x)
#define ARRAYSIZE(x) (sizeof(x)/sizeof((x)[0]))
struct IndirectSampleMonitor {struct SampleMonitorMode {DWORD Width,Height,VSync;};};
struct Mode {uint32_t width=0,height=0,rate=0;bool operator==(const Mode& b)const{return width==b.width&&height==b.height&&rate==b.rate;}};
using IDDCX_TARGET_MODE=Mode;
struct IDARG_IN_GETDEFAULTDESCRIPTIONMODES {UINT DefaultMonitorModeBufferInputCount;Mode* pDefaultMonitorModes;};
struct IDARG_OUT_GETDEFAULTDESCRIPTIONMODES {UINT DefaultMonitorModeBufferOutputCount=0,PreferredMonitorModeIdx=0;};
struct IDARG_IN_QUERYTARGETMODES {UINT TargetModeBufferInputCount;Mode* pTargetModes;};
struct IDARG_OUT_QUERYTARGETMODES {UINT TargetModeBufferOutputCount=0;};
Mode CreateIddCxMonitorMode(DWORD w,DWORD h,DWORD r,int){return {w,h,r};}
Mode CreateIddCxTargetMode(DWORD w,DWORD h,DWORD r){return {w,h,r};}
'''
main = r'''
int main(){
 const Mode guard{999,888,777};
 for(UINT count=0;count<=4;count++){
  vector<Mode> buffer(16,guard);IDARG_IN_GETDEFAULTDESCRIPTIONMODES input{count,buffer.data()+1};IDARG_OUT_GETDEFAULTDESCRIPTIONMODES output;
  auto status=IddSampleMonitorGetDefaultModes(nullptr,&input,&output);
  assert(output.DefaultMonitorModeBufferOutputCount==3);assert(buffer.front()==guard&&buffer[count+1]==guard);
  if(count>0&&count<3){assert(status==STATUS_BUFFER_TOO_SMALL);for(const auto& m:buffer)assert(m==guard);}else assert(status==STATUS_SUCCESS);
 }
 for(UINT count=0;count<=11;count++){
  vector<Mode> buffer(16,guard);IDARG_IN_QUERYTARGETMODES input{count,buffer.data()+1};IDARG_OUT_QUERYTARGETMODES output;
  auto status=IddSampleMonitorQueryModes(nullptr,&input,&output);assert(output.TargetModeBufferOutputCount==10);assert(buffer.front()==guard&&buffer[count+1]==guard);
  if(count>0&&count<10){assert(status==STATUS_BUFFER_TOO_SMALL);for(const auto& m:buffer)assert(m==guard);}else assert(status==STATUS_SUCCESS);
 }
 cout<<"virtual_display_actual_mode_callbacks_passed: zero/small/exact/large buffers and guard regions; fake IDD types only\n";
}
'''
with tempfile.TemporaryDirectory(prefix='soda-idd-modes-') as folder:
    cpp=Path(folder)/'checks.cpp';binary=Path(folder)/'checks'
    cpp.write_text(prefix+array+function('IddSampleMonitorGetDefaultModes')+function('IddSampleMonitorQueryModes')+main)
    subprocess.run(['g++','-std=c++17','-Wall','-Wextra','-Werror','-O1',str(cpp),'-o',str(binary)],check=True)
    subprocess.run([str(binary)],check=True)
