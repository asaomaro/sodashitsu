using System;
using System.Collections.Generic;
using System.Text;
public static class SodaDesktopSigninRunRecordChecks {
    const string Owner="S-1-5-21-1-2-3-1001",RunId="11111111-1111-4111-8111-111111111111";
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static void Denied(Action run,string message){bool failed=false;try{run();}catch(InvalidOperationException){failed=true;}Check(failed,message);}
    static Dictionary<string,object> Fields(string kind){
        var result=new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind",kind},{"ownerSid",Owner},{"runId",RunId},{"packageSha256",new string('a',64)},{"barrierSha256",new string('b',64)}};
        if(kind=="intent"){result.Add("issuedAt",10000);result.Add("expiresAt",11000);result.Add("mode","normal");}
        else if(kind=="initial")result.Add("createdAt",10000);
        else{
            result.Add("pid",1234);result.Add("createdFiletime","134000000000000000");
            if(kind=="started"){result.Add("startedAt",10000);result.Add("intentSha256",new string('c',64));}
            else if(kind=="observation")result.Add("startedSha256",new string('d',64));
            else if(kind=="stopped"){result.Add("stoppedAt",11000);result.Add("startedSha256",new string('d',64));result.Add("nodeExitCode",0);result.Add("jobEmpty",true);}
            else{result.Add("observedAt",12000);result.Add("stoppedSha256",new string('e',64));result.Add("processExitCode",0);result.Add("scmExitCode",0);result.Add("scmSpecificCode",0);result.Add("scmState","stopped");result.Add("barrierExclusive",true);}
        }
        return result;
    }
    public static void Run(){
        foreach(string kind in new[]{"intent","started","observation","stopped","observed-stop","initial"}){
            var record=SodaDesktopSigninRunRecord.Build(Fields(kind),Owner);byte[] plain=record.Encode(),cipher=null,reopened=null;
            try{Check(SodaDesktopSigninRunRecord.Decode(plain,Owner).Digest()==record.Digest(),"Canonical run data changed");cipher=record.Protect();var decoded=SodaDesktopSigninRunRecord.Unprotect(cipher,Owner,kind,RunId);reopened=decoded.Encode();Check(Convert.ToBase64String(plain)==Convert.ToBase64String(reopened),"Protected run data changed");Denied(()=>SodaDesktopSigninRunRecord.Unprotect(cipher,Owner,kind,"22222222-2222-4222-8222-222222222222"),"Envelope accepted different expected run");Denied(()=>SodaDesktopSigninRunRecord.Unprotect(cipher,Owner,kind=="stopped"?"observation":"stopped",RunId),"Envelope accepted different expected kind");}
            finally{Array.Clear(plain,0,plain.Length);if(cipher!=null)Array.Clear(cipher,0,cipher.Length);if(reopened!=null)Array.Clear(reopened,0,reopened.Length);}
        }
        var fields=Fields("intent");fields["mode"]="admin";fields.Add("adminNonce","22222222-2222-4222-8222-222222222222");fields.Add("adminSha256",new string('f',64));Check(SodaDesktopSigninRunRecord.Build(fields,Owner).Kind=="intent","Admin start data rejected");
        fields=Fields("observation");fields["adminNonce"]=RunId;Denied(()=>SodaDesktopSigninRunRecord.Build(fields,Owner),"Observation ACK accepted administration fields");
        fields=Fields("observed-stop");fields["kind"]="unknown";Denied(()=>SodaDesktopSigninRunRecord.Build(fields,Owner),"Unknown run kind accepted");
        fields=Fields("intent");fields["ownerSid"]="S-1-5-21-1-2-3-1002";Denied(()=>SodaDesktopSigninRunRecord.Build(fields,Owner),"Run owner mismatch accepted");
        fields=Fields("intent");fields["expiresAt"]=310001;Denied(()=>SodaDesktopSigninRunRecord.Build(fields,Owner),"Overlong run admission accepted");
        fields=Fields("stopped");fields["nodeExitCode"]=7;Denied(()=>SodaDesktopSigninRunRecord.Build(fields,Owner),"Nonzero Node exit data accepted");fields=Fields("stopped");fields["jobEmpty"]=false;Denied(()=>SodaDesktopSigninRunRecord.Build(fields,Owner),"Nonempty native Job data accepted");
        foreach(string field in new[]{"processExitCode","scmExitCode","scmSpecificCode","barrierExclusive","scmState"}){fields=Fields("observed-stop");fields[field]=field=="barrierExclusive"?(object)false:field=="scmState"?(object)"running":(object)7;Denied(()=>SodaDesktopSigninRunRecord.Build(fields,Owner),"Unclean observed stop data accepted: "+field);}
        foreach(string filetime in new[]{"0","0134000000000000000","1.5","18446744073709551616"}){fields=Fields("started");fields["createdFiletime"]=filetime;Denied(()=>SodaDesktopSigninRunRecord.Build(fields,Owner),"Invalid creation FILETIME accepted");}
        var valid=SodaDesktopSigninRunRecord.Build(Fields("intent"),Owner);byte[] canonical=valid.Encode();try{byte[] extra=Encoding.UTF8.GetBytes(" "+Encoding.UTF8.GetString(canonical));Denied(()=>SodaDesktopSigninRunRecord.Decode(extra,Owner),"Noncanonical run JSON accepted");Array.Clear(extra,0,extra.Length);}finally{Array.Clear(canonical,0,canonical.Length);}
        byte[] generated=Encoding.UTF8.GetBytes("generated run data only"),protectedBytes=null;
        try{
            protectedBytes=SodaDesktopSigninRunRecord.Crypt(generated,Owner,RunId,"intent",true);
            Denied(()=>{byte[] wrong=SodaDesktopSigninRunRecord.Crypt(protectedBytes,Owner,RunId,"observation",false);Array.Clear(wrong,0,wrong.Length);},"Run DPAPI kind domain was ignored");
            Denied(()=>{byte[] wrong=SodaDesktopSigninRunRecord.Crypt(protectedBytes,"S-1-5-21-1-2-3-1002",RunId,"intent",false);Array.Clear(wrong,0,wrong.Length);},"Run DPAPI owner domain was ignored");
            Denied(()=>{byte[] wrong=SodaDesktopSigninRunRecord.Crypt(protectedBytes,Owner,"22222222-2222-4222-8222-222222222222","intent",false);Array.Clear(wrong,0,wrong.Length);},"Run DPAPI nonce domain was ignored");
        }finally{Array.Clear(generated,0,generated.Length);if(protectedBytes!=null)Array.Clear(protectedBytes,0,protectedBytes.Length);}
        Console.WriteLine("signin_run_record_generated_canonical_roles_and_private_crypto_passed");
    }
}
