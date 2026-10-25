// Pure input encoding and held-key tests. Never calls SendInput or captures a desktop.
using System;
using System.Collections.Generic;
using System.Reflection;
namespace SodaDesktopTests {
    public static class DesktopInputChecks {
        static object Call(string name,params object[] args) {
            try{return typeof(SodaDesktopHost).GetMethod(name,BindingFlags.NonPublic|BindingFlags.Static).Invoke(null,args);}
            catch(TargetInvocationException e){throw e.InnerException;}
        }
        static object Field(object value,string name){return value.GetType().GetField(name).GetValue(value);}
        static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
        public static void Run() {
            uint[] downs={2,32,8,128,128},ups={4,64,16,256,256},data={0,0,0,1,2};
            for(int button=0;button<5;button++)foreach(bool down in new[]{false,true}) {
                object value=Call("ButtonInput",button,down),mouse=Field(Field(value,"data"),"mouse");
                Check((uint)Field(value,"type")==0 && (uint)Field(mouse,"dwFlags")== (down?downs[button]:ups[button]) && (uint)Field(mouse,"mouseData")==data[button],"Mouse button/transition mapped incorrectly: "+button);
            }
            foreach(int button in new[]{-1,5}){bool rejected=false;try{Call("ButtonInput",button,true);}catch(InvalidOperationException){rejected=true;}Check(rejected,"Unknown mouse button accepted");}
            string[] codes={"Escape","Tab","F24","NumpadEnter","NumpadDivide","NumLock","PrintScreen","ContextMenu","Convert","NonConvert","IntlRo","IntlYen"};
            ushort[] expected={27,9,135,13,111,144,44,93,28,29,226,220};
            for(int n=0;n<codes.Length;n++)Check((ushort)Call("VirtualKey",codes[n])==expected[n],"Virtual key mismatch: "+codes[n]);
            foreach(bool down in new[]{false,true}) {
                object enter=Field(Field(Call("KeyInput",(ushort)(13|0x100),down),"data"),"key");
                Check((ushort)Field(enter,"vk")==13 && (uint)Field(enter,"flags")== (down?1u:3u),"NumpadEnter lost its extended flag");
            }
            var held=new HashSet<ushort>();var emitted=new List<string>();Action<ushort,bool> emit=(key,down)=>emitted.Add(key+":"+down);
            Call("ApplyKey",held,(ushort)27,true,emit);Call("ApplyKey",held,(ushort)27,true,emit);Call("ApplyKey",held,(ushort)27,false,emit);Call("ApplyKey",held,(ushort)27,false,emit);
            Check(String.Join(",",emitted.ToArray())=="27:True,27:True,27:False"&&held.Count==0,"Repeat/release handling lost a key or left it held");
            // Hold the real video output lock; ACK must complete on its own pipe.
            var field=typeof(SodaDesktopHost).GetField("InputAckPipe",BindingFlags.NonPublic|BindingFlags.Static);
            var gate=typeof(SodaDesktopHost).GetField("OutputGate",BindingFlags.NonPublic|BindingFlags.Static).GetValue(null);
            var previousOut=Console.Out;var previousError=Console.Error;var output=new System.IO.StringWriter();var error=new System.IO.StringWriter();
            var worker=new System.Threading.Thread(()=>Call("InputAck",(long)42));
            try {
                Console.SetOut(output);Console.SetError(error);field.SetValue(null,true);
                System.Threading.Monitor.Enter(gate);
                try { worker.Start();Check(worker.Join(1000),"Input ACK waited behind video OutputGate"); }
                finally {System.Threading.Monitor.Exit(gate);worker.Join(2000);}
                Check(output.ToString()==""&&error.ToString().Trim()=="SODA_DESKTOP_INPUT_ACK 42","Dedicated ACK pipe framing mismatch");
                field.SetValue(null,false);Call("InputAck",(long)43);
                Check(output.ToString().Contains("input_ack")&&output.ToString().Contains("43"),"Legacy helper ACK disappeared");
            }finally{field.SetValue(null,false);Console.SetOut(previousOut);Console.SetError(previousError);}
            Console.WriteLine("desktop_input_checks_passed");
        }
    }
}
