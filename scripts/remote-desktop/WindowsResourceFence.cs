// Current-source cleanup proof only. Never a grant or process-exit substitute.
using System;
using System.Collections.Generic;
public sealed class SodaDesktopResourceFence {
 readonly Func<bool> current;readonly Action releaseInput,stopClipboard,stopMicrophone;bool failed,ended,busy;
 public SodaDesktopResourceFence(Func<bool> current,Action releaseInput,Action stopClipboard,Action stopMicrophone){if(current==null||releaseInput==null||stopClipboard==null||stopMicrophone==null)throw new ArgumentNullException();this.current=current;this.releaseInput=releaseInput;this.stopClipboard=stopClipboard;this.stopMicrophone=stopMicrophone;}
 public bool Failed{get{return failed||ended;}}
 bool Current(){try{return !ended&&current()&&!ended;}catch{return false;}}
 public bool ReleaseInput(){if(busy||Failed){failed=true;return false;}busy=true;try{if(!Current())throw new InvalidOperationException();releaseInput();if(!Current())throw new InvalidOperationException();return true;}catch{failed=true;return false;}finally{busy=false;}}
 public bool Fence(string id,Action<string> acknowledge){Guid parsed;if(!Guid.TryParseExact(id,"D",out parsed)||parsed==Guid.Empty||parsed.ToString("D")!=id||acknowledge==null||busy||Failed){failed=true;return false;}busy=true;
  try{
   // Always attempt resource shutdown even if input cleanup failed. A partial
   // shutdown can never generate an ACK or become healthy in a later call.
   bool valid=Current();try{if(valid)releaseInput();else failed=true;}catch{failed=true;}
   try{stopClipboard();}catch{failed=true;}try{stopMicrophone();}catch{failed=true;}
   if(failed||!Current()){failed=true;return false;}acknowledge(id);return !Failed;
  }catch{failed=true;return false;}finally{busy=false;}
 }
 public void Close(){ended=true;}
 public static void ReleaseHeld(HashSet<ushort> keys,HashSet<int> buttons,Action<ushort> keyUp,Action<int> buttonUp,Func<bool> current){
  var keyList=new List<ushort>(keys);var buttonList=new List<int>(buttons);bool failed=false;
  foreach(ushort key in keyList){try{if(!current())throw new InvalidOperationException();keyUp(key);keys.Remove(key);}catch{failed=true;}}
  foreach(int button in buttonList){try{if(!current())throw new InvalidOperationException();buttonUp(button);buttons.Remove(button);}catch{failed=true;}}
  if(failed||!current()||keys.Count!=0||buttons.Count!=0)throw new InvalidOperationException("Input cleanup incomplete");
 }
}
