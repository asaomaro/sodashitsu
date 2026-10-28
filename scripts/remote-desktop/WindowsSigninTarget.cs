// Immutable physical-primary/topology binding. Native reads are supplied locally.
using System;
public sealed class SodaDesktopSigninTarget {
    public sealed class Snapshot {
        readonly int[] dimensions;readonly string identity;
        public Snapshot(int[] dimensions,string identity){
            if(dimensions==null||dimensions.Length!=7||dimensions[0]<1||dimensions[1]<1||dimensions[0]>8192||dimensions[1]>8192||(long)dimensions[0]*dimensions[1]>16000000||dimensions[6]<1||dimensions[6]>8||String.IsNullOrEmpty(identity)||identity.Length>8192)throw new ArgumentException("Signin target is unavailable");
            this.dimensions=(int[])dimensions.Clone();this.identity=identity;
        }
        public int Width{get{return dimensions[0];}}public int Height{get{return dimensions[1];}}
        internal bool Same(Snapshot other){if(other==null||identity!=other.identity)return false;for(int i=0;i<dimensions.Length;i++)if(dimensions[i]!=other.dimensions[i])return false;return true;}
    }
    readonly Snapshot initial;readonly Func<Snapshot> read;bool closed;
    public SodaDesktopSigninTarget(Snapshot initial,Func<Snapshot> read){if(initial==null||read==null)throw new ArgumentException();this.initial=initial;this.read=read;}
    public bool Current(){if(closed)return false;try{bool same=initial.Same(read());if(closed||!same){closed=true;return false;}return true;}catch{closed=true;return false;}}
    public void Close(){closed=true;}
}
