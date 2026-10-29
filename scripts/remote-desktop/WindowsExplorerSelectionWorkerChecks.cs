using System;
using System.Web.Script.Serialization;
using Sodashitsu.NativeDrag;
internal static class ExplorerSelectionWorkerChecks
{
    private static void Assert(bool value,string reason){if(!value)throw new Exception("generated assertion: "+reason);}
    private static void Reject(Action action,string reason){try{action();}catch(InvalidOperationException){return;}throw new Exception("generated assertion: "+reason);}
    private sealed class Driver:ExplorerSelection.IDriver
    {
        internal int Calls;internal Action<int> Before;
        public ExplorerSelection.Snapshot Read(int x,int y){Calls++;if(Before!=null)Before(Calls);Assert(x==-400&&y==50,"physical coordinates changed");return new ExplorerSelection.Snapshot{Window=42,Process=123,Hit="1.2",Paths=new string[]{@"C:\approved\a.txt"}};}
    }
    private static ExplorerSelectionRequest Request(){return new ExplorerSelectionRequest{Nonce=new string('a',64),Epoch="11111111-1111-4111-8111-111111111111",X=-400,Y=50,Window=42,Process=123};}
    internal static int Main()
    {
        try
        {
            Driver valid=new Driver();string json=ExplorerSelectionWorker.Execute(Request(),valid,delegate{return true;},delegate{return 0;});
            var result=new JavaScriptSerializer().DeserializeObject(json) as System.Collections.Generic.Dictionary<string,object>;
            Assert(valid.Calls==2&&result!=null&&(string)result["nonce"]==new string('a',64)&&(string)result["epoch"]==Request().Epoch&&(int)result["window"]==42&&(int)result["pid"]==123,"bound result lost identity");
            foreach(string mode in new string[]{"window","process","nonce","epoch","revoked","late"})
            {
                ExplorerSelectionRequest request=Request();Driver driver=new Driver();bool allowed=true;
                if(mode=="window")request.Window++;if(mode=="process")request.Process++;if(mode=="nonce")request.Nonce="invalid";if(mode=="epoch")request.Epoch=Guid.Empty.ToString();
                driver.Before=delegate(int call){if(mode=="revoked"&&call==1)allowed=false;if(mode=="late"&&call==2)allowed=false;};
                Reject(delegate{ExplorerSelectionWorker.Execute(request,driver,delegate{return allowed;},delegate{return 0;});},"accepted "+mode);
                if(mode=="nonce"||mode=="epoch")Assert(driver.Calls==0,"invalid request inspected selection");
            }
            Driver denied=new Driver();Reject(delegate{ExplorerSelectionWorker.Execute(Request(),denied,delegate{return false;},delegate{return 0;});},"unheld gesture accepted");Assert(denied.Calls==0,"denied pointer inspected selection");
            Console.WriteLine("explorer_selection_worker_generated_pointer_identity_nonce_revocation_passed_no_real_desktop");return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
