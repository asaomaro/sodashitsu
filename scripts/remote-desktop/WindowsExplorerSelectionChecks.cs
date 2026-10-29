using System;
using Sodashitsu.NativeDrag;
internal static class ExplorerSelectionChecks
{
    private static void Assert(bool value,string reason){if(!value)throw new Exception("generated assertion: "+reason);}
    private sealed class Driver:ExplorerSelection.IDriver
    {
        internal int Calls;internal Action<int> Before;internal ExplorerSelection.Snapshot First,Second;
        public ExplorerSelection.Snapshot Read(int x,int y){Calls++;if(Before!=null)Before(Calls);return Calls==1?First:Second;}
    }
    private static ExplorerSelection.Snapshot Sample(){return new ExplorerSelection.Snapshot{Window=42,Process=123,Hit="1.2.3",Paths=new string[]{@"C:\approved\first.txt"}};}
    private static void Reject(Action action,string reason){try{action();}catch(InvalidOperationException){return;}throw new Exception("generated assertion: "+reason);}
    internal static int Main()
    {
        try
        {
            Driver valid=new Driver{First=Sample(),Second=Sample()};ExplorerSelection.Snapshot result=ExplorerSelection.Capture(valid,10,20,delegate{return true;},delegate{return 0;});
            Assert(valid.Calls==2&&result.Paths[0]==@"C:\approved\first.txt","stable selection not captured");valid.Second.Paths[0]="changed";Assert(result.Paths[0]==@"C:\approved\first.txt","selection retained adapter array");
            foreach(string mode in new string[]{"window","process","hit","paths","empty","relative","network","duplicate","overflow","revoked","expired","backward"})
            {
                Driver driver=new Driver{First=Sample(),Second=Sample()};long now=10;bool allowed=true;
                driver.Before=delegate(int call){if(call!=2)return;if(mode=="window")driver.Second.Window++;if(mode=="process")driver.Second.Process++;if(mode=="hit")driver.Second.Hit="other";if(mode=="paths")driver.Second.Paths[0]=@"C:\approved\other.txt";if(mode=="empty")driver.Second.Paths=new string[0];if(mode=="relative")driver.Second.Paths[0]="relative";if(mode=="network")driver.Second.Paths[0]=@"\\server\share\file";if(mode=="duplicate")driver.Second.Paths=new string[]{@"C:\same",@"c:\SAME"};if(mode=="overflow")driver.Second.Paths=new string[1001];if(mode=="revoked")allowed=false;if(mode=="expired")now=760;if(mode=="backward")now=9;};
                Reject(delegate{ExplorerSelection.Capture(driver,10,20,delegate{return allowed;},delegate{return now;});},"accepted "+mode+" selection");
            }
            Driver denied=new Driver{First=Sample(),Second=Sample()};Reject(delegate{ExplorerSelection.Capture(denied,10,20,delegate{return false;},delegate{return 0;});},"missing file authority accepted");Assert(denied.Calls==0,"inspected Explorer before file authority");
            Console.WriteLine("explorer_selection_generated_identity_paths_authority_freshness_passed_no_real_desktop");return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
