using System;
using System.Collections.Generic;
internal static class SodaAgentRegionChecks {
 static Dictionary<string,object> Spec(string id,int x,int y,int w,int h){return new Dictionary<string,object>{{"id",id},{"x",x},{"y",y},{"width",w},{"height",h}};}
 static string Digest(SodaDesktopAgentRegions r,byte[] p){return (string)((Dictionary<string,object>)r.Proofs(p)[0])["digest"];}
 static void Check(bool ok,string message){if(!ok)throw new Exception(message);}
 internal static int Main(){try{
  var r=new SodaDesktopAgentRegions(4,4);string id=Guid.NewGuid().ToString("D");var p=new byte[48];
  r.Configure(new object[]{Spec(id,1,1,2,2)});string a=Digest(r,p);Check(a.Length==64,"SHA256 proof");
  p[0]=99;Check(a==Digest(r,p),"Background change must preserve ROI");
  p[(1*4+1)*3]=99;Check(a!=Digest(r,p),"ROI change must change proof");
  r.Configure(new object[]{Spec(Guid.NewGuid().ToString("D"),1,1,2,2)});Check(a!=Digest(r,new byte[48]),"Nonce must bind proof");
  bool failed=false;try{r.Configure(new object[]{Spec(id,3,3,2,2)});}catch(InvalidOperationException){failed=true;}Check(failed&&r.Active,"Invalid config must not replace active ROI");
  failed=false;try{r.Configure(new object[]{Spec(id,0,0,1,1),Spec(id,0,0,1,1)});}catch(InvalidOperationException){failed=true;}Check(failed,"Duplicate ids");
  r.Clear();Check(!r.Active&&r.Proofs(p).Length==0,"Clear regions");
  Console.WriteLine("Generated ROI pixel/nonce/bounds/cleanup checks passed");return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
