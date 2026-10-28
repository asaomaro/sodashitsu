using System;
using System.IO;
public static class SodaDesktopSigninQuiescenceChecks {
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static void Refused(Action run,string message){bool failed=false;try{run();}catch(IOException){failed=true;}catch(InvalidOperationException){failed=true;}Check(failed,message);}
    public static void Run(){
        string root=Path.Combine(Path.GetTempPath(),"soda-quiescence-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);string path=Path.Combine(root,"quiescence.lock");File.WriteAllBytes(path,new byte[]{83});
        try{
            using(var pin=SodaDesktopSigninQuiescence.OpenCore(path,new[]{root},(name,bytes)=>true)){
                using(var active=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read))Refused(()=>{using(var unexpected=pin.Exclusive()){}},"Exclusive barrier accepted active reader");
                Refused(()=>{using(var unexpected=pin.Exclusive()){}},"Failed barrier pin was reusable");
            }
            using(var pin=SodaDesktopSigninQuiescence.OpenCore(path,new[]{root},(name,bytes)=>true))using(var lease=pin.Exclusive()){
                Check(lease.Current(),"Exclusive barrier was not current");Refused(()=>{using(var reader=File.OpenRead(path)){}},"Exclusive barrier allowed a new reader");Refused(()=>{File.WriteAllBytes(path,new byte[]{83});},"Exclusive barrier allowed replacement/write");Refused(()=>{using(var unexpected=pin.Exclusive()){}},"Consumed barrier pin was reusable");lease.Dispose();Check(!lease.Current(),"Disposed exclusive barrier stayed current");
            }
            using(var reader=File.OpenRead(path))Check(reader.ReadByte()==83,"Barrier marker changed");
            using(var pin=SodaDesktopSigninQuiescence.OpenCore(path,new[]{root},(name,bytes)=>true))Refused(()=>{using(var unexpected=pin.ExclusiveCore(()=>{File.Move(path,path+".original");File.WriteAllBytes(path,new byte[]{83});})){}},"Barrier accepted a replaced file identity");
            File.Delete(path);File.Move(path+".original",path);
            bool valid=true;using(var pin=SodaDesktopSigninQuiescence.OpenCore(path,new[]{root},(name,bytes)=>valid)){valid=false;Refused(()=>{using(var unexpected=pin.Exclusive()){}},"Barrier ignored changed path policy");}
            valid=true;using(var pin=SodaDesktopSigninQuiescence.OpenCore(path,new[]{root},(name,bytes)=>valid))using(var lease=pin.Exclusive()){valid=false;Check(!lease.Current(),"Exclusive barrier ignored revoked policy");}
            File.WriteAllBytes(path,new byte[]{0});Refused(()=>{using(var pin=SodaDesktopSigninQuiescence.OpenCore(path,new[]{root},(name,bytes)=>true)){}},"Barrier accepted wrong marker");File.WriteAllBytes(path,new byte[]{83,83});Refused(()=>{using(var pin=SodaDesktopSigninQuiescence.OpenCore(path,new[]{root},(name,bytes)=>true)){}},"Barrier accepted wrong size");
            File.WriteAllBytes(path,new byte[]{83});using(var pin=SodaDesktopSigninQuiescence.OpenCore(path,new[]{root},(name,bytes)=>true))Refused(()=>{using(var unexpected=pin.ExclusiveCore(()=>pin.Dispose())){}},"Disposed pin acquired exclusive barrier");
            using(var writer=new FileStream(path,FileMode.Open,FileAccess.Write,FileShare.None))writer.WriteByte(83);
            Console.WriteLine("signin_quiescence_generated_actual_file_identity_and_exclusive_leases_passed");
        }finally{Directory.Delete(root,true);}
    }
}
