using System;
using System.IO;
using System.Collections.Generic;
public static class SodaDesktopSigninRunJournalChecks {
    const string Owner="S-1-5-21-1-2-3-1001",RunId="11111111-1111-4111-8111-111111111111",Next="22222222-2222-4222-8222-222222222222";
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static void Refused(Action action,string message){bool failed=false;try{action();}catch(InvalidOperationException){failed=true;}catch(IOException){failed=true;}Check(failed,message);}
    static SodaDesktopSigninRunRecord Make(string kind,string run,string digest){
        var f=new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind",kind},{"ownerSid",Owner},{"runId",run},{"packageSha256",new string('a',64)},{"barrierSha256",new string('b',64)}};
        if(kind=="initial")f.Add("createdAt",10000);
        else if(kind=="intent"){f.Add("issuedAt",10000);f.Add("expiresAt",310000);f.Add("mode","normal");}
        else {f.Add("pid",1234);f.Add("createdFiletime","134000000000000000");
            if(kind=="started"){f.Add("startedAt",10001);f.Add("intentSha256",digest);}
            else if(kind=="observation")f.Add("startedSha256",digest);
            else if(kind=="stopped"){f.Add("stoppedAt",11000);f.Add("startedSha256",digest);f.Add("nodeExitCode",0);f.Add("jobEmpty",true);}
            else {f.Add("observedAt",11001);f.Add("stoppedSha256",digest);f.Add("processExitCode",0);f.Add("scmExitCode",0);f.Add("scmSpecificCode",0);f.Add("scmState","stopped");f.Add("barrierExclusive",true);}
        }return SodaDesktopSigninRunRecord.Build(f,Owner);
    }
    static SodaDesktopSigninRunRecord Changed(SodaDesktopSigninRunRecord value,string key,object raw){var f=value.Fields();f[key]=raw;return SodaDesktopSigninRunRecord.Build(f,Owner);}
    static SodaDesktopSigninRunJournal Open(string path,SodaDesktopSigninRunJournal.Role role,Func<bool> scope=null,Func<byte[],bool> policy=null){return new SodaDesktopSigninRunJournal(path,Owner,new string('a',64),new string('b',64),role,scope??(()=>true),policy??(bytes=>true),new string[0]);}
    static void Write(string path,string name,SodaDesktopSigninRunRecord value){byte[] bytes=value.Protect();try{File.WriteAllBytes(Path.Combine(path,name),bytes);}finally{Array.Clear(bytes,0,bytes.Length);}}
    static string Temporary(string parent){string path=Path.Combine(parent,Guid.NewGuid().ToString("N"));Directory.CreateDirectory(path);return path;}
    public static void Run(){
        string root=Path.Combine(Path.GetTempPath(),"soda-run-journal-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        try{
            var initial=Make("initial",Next,null);var intent=Make("intent",RunId,null);var started=Make("started",RunId,intent.Digest());var ack=Make("observation",RunId,started.Digest());var stopped=Make("stopped",RunId,started.Digest());var observed=Make("observed-stop",RunId,stopped.Digest());
            string path=Temporary(root);
            using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller)){Check(controller.State()=="recovery","Empty run namespace became never-started");Refused(()=>controller.Prepare(intent),"Empty namespace admitted start");}
            using(var installer=Open(path,SodaDesktopSigninRunJournal.Role.Installer)){installer.Initialize(initial);Refused(()=>installer.Initialize(initial),"Initial state was overwritten");}
            using(var observer=Open(path,SodaDesktopSigninRunJournal.Role.Observer))Refused(()=>observer.Prepare(intent),"Observation-only owner prepared a start");
            using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller)){Check(controller.State()=="initial","Initial record unavailable");controller.Prepare(intent);Check(controller.State()=="pending","Start intent was not published");Refused(()=>controller.Prepare(intent),"Pending start was replayed");}
            using(var host=Open(path,SodaDesktopSigninRunJournal.Role.Host)){Refused(()=>host.Claim(value=>false),"Mismatched admin mode claimed start");Check(host.Claim(value=>value.Digest()==intent.Digest()).Digest()==intent.Digest(),"Claim data changed");Refused(()=>host.Claim(value=>true),"Start intent was claimed twice");host.Started(started);Refused(()=>host.Observation(),"Missing process observation accepted");}
            using(var observer=Open(path,SodaDesktopSigninRunJournal.Role.Observer)){
                Refused(()=>observer.Observation(Changed(ack,"pid",1235)),"Wrong observed process accepted");
                Refused(()=>observer.Observation(Changed(ack,"startedSha256",new string('f',64))),"Wrong started digest accepted");
                observer.Observation(ack);Refused(()=>observer.Observation(ack),"Process observation was replayed");
                Refused(()=>observer.ObservedStop(observed),"Observation-only owner published clean stop");
            }
            using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller))Refused(()=>controller.Prepare(Make("intent",Next,null)),"Observed live host admitted next generation");
            using(var host=Open(path,SodaDesktopSigninRunJournal.Role.Host)){Check(host.Observation().Digest()==ack.Digest(),"Host observation changed");Refused(()=>host.Stopped(Changed(stopped,"pid",1235)),"Wrong stopped process accepted");host.Stopped(stopped);Refused(()=>host.Stopped(stopped),"Stop receipt was replayed");}
            using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller)){
                Refused(()=>controller.Prepare(Make("intent",Next,null)),"Host receipt alone admitted next generation");
                Refused(()=>controller.ObservedStop(Changed(observed,"stoppedSha256",new string('f',64))),"Wrong stopped digest accepted");controller.ObservedStop(observed);Check(controller.State()=="complete","Independently observed stop unavailable");Refused(()=>controller.Prepare(intent),"Previous run id was reused");controller.Prepare(Make("intent",Next,null));Check(controller.State()=="pending","New run intent unavailable");
            }
            using(var host=Open(path,SodaDesktopSigninRunJournal.Role.Host))Check(host.Claim(value=>true).RunId==Next,"Next run claim changed");
            path=Temporary(root);Write(path,"intent.pending",intent);
            using(var host=Open(path,SodaDesktopSigninRunJournal.Role.Host))Refused(()=>host.Claim(value=>{Write(path,"intent.pending",Make("intent",Next,null));return true;}),"Replaced pending intent consumed with old claim data");
            Check(File.Exists(Path.Combine(path,"intent.pending"))&&!File.Exists(Path.Combine(path,"intent.claimed")),"Replaced pending intent was consumed");
            path=Temporary(root);Write(path,"intent.pending",intent);bool active=true,armed=false;int inspections=0;
            using(var host=Open(path,SodaDesktopSigninRunJournal.Role.Host,()=>active,bytes=>{if(armed&&++inspections==2)active=false;return true;}))Refused(()=>host.Claim(value=>{armed=true;return true;}),"Open-time revoked scope consumed intent");
            Check(inspections>=2&&File.Exists(Path.Combine(path,"intent.pending"))&&!File.Exists(Path.Combine(path,"intent.claimed")),"Open-time revocation changed pending state");
            path=Temporary(root);bool lease=true,revoke=false;
            using(var owner=Open(path,SodaDesktopSigninRunJournal.Role.Controller,()=>lease,bytes=>{if(revoke)lease=false;return true;})){revoke=true;Refused(()=>owner.VerifyCurrent(),"Inspection-time revoked scope retained authority");}
            path=Temporary(root);using(var installer=Open(path,SodaDesktopSigninRunJournal.Role.Installer)){
                string captured=path;installer.AfterStageClosed=()=>{File.Delete(Path.Combine(captured,"initial.writing"));Write(captured,"initial.writing",initial);};
                Refused(()=>installer.Initialize(initial),"Replaced staged file identity was published");Check(!File.Exists(Path.Combine(path,"initial")),"Replaced stage reached published namespace");
            }
            // Every partial/extra artifact stays recovery; neither empty state nor
            // a leftover transition is silently repaired or automatically retried.
            foreach(string extra in new[]{"transition","started.writing","unknown","intent.pending"}){
                path=Temporary(root);Write(path,"initial",initial);File.WriteAllBytes(Path.Combine(path,extra),new byte[]{83});using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller))Refused(()=>controller.Prepare(intent),"Partial namespace admitted start: "+extra);
            }
            path=Temporary(root);Write(path,"intent.claimed",intent);Write(path,"stopped",stopped);using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller)){Check(controller.State()=="recovery","Orphan stop became clean");Refused(()=>controller.Prepare(Make("intent",Next,null)),"Orphan stop admitted start");}
            path=Temporary(root);Write(path,"initial",initial);bool scope=true;using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller,()=>scope)){scope=false;Refused(()=>controller.Prepare(intent),"Revoked journal scope wrote intent");scope=true;Refused(()=>controller.Prepare(intent),"Revoked journal scope revived");}Check(File.Exists(Path.Combine(path,"initial"))&&!File.Exists(Path.Combine(path,"transition")),"Revoked journal modified files");
            path=Temporary(root);Write(path,"initial",initial);bool privateAcl=true;using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller,null,bytes=>privateAcl)){privateAcl=false;Refused(()=>controller.Prepare(intent),"Revoked private directory policy admitted write");}
            path=Temporary(root);Write(path,"initial",Changed(initial,"packageSha256",new string('f',64)));using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller))Refused(()=>controller.Prepare(intent),"Wrong package state admitted start");
            path=Temporary(root);Write(path,"initial",Changed(initial,"barrierSha256",new string('f',64)));using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller))Refused(()=>controller.Prepare(intent),"Wrong barrier state admitted start");
            // Revoke during transition after durable marker; all later readers
            // refuse this namespace rather than treating it as never-started.
            path=Temporary(root);Write(path,"initial",initial);bool cut=false;using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller,()=>!(cut&&File.Exists(Path.Combine(path,"transition"))))){cut=true;Refused(()=>controller.Prepare(intent),"Transition ignored revoked owner");}Check(File.Exists(Path.Combine(path,"transition")),"Interrupted transition marker disappeared");using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller))Refused(()=>controller.Prepare(intent),"Interrupted transition was replayed");
            path=Temporary(root);Write(path,"initial",initial);using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller)){
                controller.AfterStageClosed=()=>{throw new IOException("generated interrupted pending publication");};Refused(()=>controller.Prepare(intent),"Interrupted pending publication succeeded");
            }Check(!File.Exists(Path.Combine(path,"initial"))&&File.Exists(Path.Combine(path,"transition")),"Transition lost crash evidence after removing old generation");using(var controller=Open(path,SodaDesktopSigninRunJournal.Role.Controller))Refused(()=>controller.Prepare(intent),"Removed-old-generation crash became fresh installation");
            Console.WriteLine("signin_run_journal_generated_restart_roles_process_bindings_and_crash_boundaries_passed");
        }finally{Directory.Delete(root,true);}
    }
}
