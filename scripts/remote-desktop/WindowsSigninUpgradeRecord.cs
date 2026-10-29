// Closed public maintenance metadata. Not a clean-process proof by itself.
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
internal sealed class SodaDesktopSigninUpgradeRecord {
 internal readonly string Owner,Id,OldHash,NewHash,Barrier,OldState,OldRun,OldDigest,NewRun,OldCode,OldRuns,StageId,StageName,CodeArchive,RunArchive,Hash;
 static readonly string[] Keys={"version","purpose","ownerSid","upgradeId","newRunId","stageName","oldPackage","newPackage","barrier","oldState","oldRunId","oldBoundarySha256","oldCode","oldRuns","stage","codeArchive","runArchive"};
 static Exception Failure(){return new InvalidOperationException("Signin upgrade marker does not match the reviewed closed transition");}
 internal static string Digest(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 static void Require(bool value){if(!value)throw Failure();}
 static bool Hex(string value,int size){return value!=null&&System.Text.RegularExpressions.Regex.IsMatch(value,"\\A[a-f0-9]{"+size+"}\\z");}
 static string Field(IDictionary<string,object> value,string key){object item;Require(value.TryGetValue(key,out item)&&item is string);return (string)item;}
 static bool Uuid(string value,string format){Guid id;return Guid.TryParseExact(value,format,out id)&&id!=Guid.Empty&&id.ToString(format)==value;}
 SodaDesktopSigninUpgradeRecord(byte[] bytes,string owner,string oldHash,string newHash,string expected){
  Require(bytes!=null&&bytes.Length>0&&bytes.Length<=8192&&Hex(expected,64));Hash=Digest(bytes);Require(Hash==expected);var json=new UTF8Encoding(false,true).GetString(bytes);var raw=new JavaScriptSerializer().DeserializeObject(json) as Dictionary<string,object>;Require(raw!=null&&raw.Count==Keys.Length);foreach(string key in Keys)Require(raw.ContainsKey(key));Require(raw["version"] is int&&(int)raw["version"]==1&&Field(raw,"purpose")=="desktop-signin-upgrade");
  Owner=Field(raw,"ownerSid");Id=Field(raw,"upgradeId");OldHash=Field(raw,"oldPackage");NewHash=Field(raw,"newPackage");Barrier=Field(raw,"barrier");OldState=Field(raw,"oldState");OldRun=Field(raw,"oldRunId");OldDigest=Field(raw,"oldBoundarySha256");NewRun=Field(raw,"newRunId");OldCode=Field(raw,"oldCode");OldRuns=Field(raw,"oldRuns");StageId=Field(raw,"stage");StageName=Field(raw,"stageName");CodeArchive=Field(raw,"codeArchive");RunArchive=Field(raw,"runArchive");
  Require(Owner==SodaDesktopSigninPackage.OwnerSid(owner)&&Uuid(Id,"N")&&Uuid(OldRun,"D")&&Uuid(NewRun,"D")&&NewRun!=OldRun&&Hex(OldHash,64)&&Hex(NewHash,64)&&OldHash!=NewHash&&OldHash==oldHash&&NewHash==newHash&&Hex(Barrier,64)&&Hex(OldDigest,64)&&(OldState=="initial"||OldState=="complete")&&Hex(OldCode,40)&&Hex(OldRuns,40)&&Hex(StageId,40));
  string prefix=".signin-"+SodaDesktopSigninPackage.Slot(owner)+"-";Require(StageName.StartsWith(prefix,StringComparison.Ordinal)&&Uuid(StageName.Substring(prefix.Length),"N")&&CodeArchive==".signin-old-"+Id&&RunArchive=="runs-old-"+Id);
  var sorted=new SortedDictionary<string,object>(raw,StringComparer.Ordinal);Require(new JavaScriptSerializer().Serialize(sorted)==json);
 }
 internal static SodaDesktopSigninUpgradeRecord Decode(byte[] bytes,string owner,string oldHash,string newHash,string expected){try{return new SodaDesktopSigninUpgradeRecord(bytes,owner,oldHash,newHash,expected);}catch{throw Failure();}}
 internal IDictionary<string,object> Public(){return new Dictionary<string,object>{{"ownerSid",Owner},{"upgradeId",Id},{"oldPackageSha256",OldHash},{"newPackageSha256",NewHash},{"markerSha256",Hash},{"oldState",OldState},{"oldRunId",OldRun},{"newRunId",NewRun}};}
}
