// Opt-in real GPU checks with generated pixels only. No desktop capture or input.
using System;
using System.Drawing;
using System.Reflection;
using System.Runtime.InteropServices;
namespace SodaDesktopTests {
    public static class DxgiChecks {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        [DllImport("d3d11.dll")] static extern int D3D11CreateDevice(IntPtr adapter,uint driver,IntPtr software,uint flags,IntPtr levels,uint count,uint sdk,out IntPtr device,out uint level,out IntPtr context);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void Upload(IntPtr self,IntPtr resource,uint subresource,IntPtr box,IntPtr data,uint pitch,uint depth);
        const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
        static IntPtr Field(SodaDesktopDxgi capture,string name){return (IntPtr)typeof(SodaDesktopDxgi).GetField(name,Private).GetValue(capture);}
        static void Set(SodaDesktopDxgi capture,string name,object value){typeof(SodaDesktopDxgi).GetField(name,Private).SetValue(capture,value);}
        static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
        public static void Run() {
            SetProcessDPIAware();
            if(IntPtr.Size!=8)throw new NotSupportedException("GPU checks require x64");
            // Odd output widths verify padded readback/bitmap rows; separate X/Y
            // patterns detect UV flips, channel swaps, scaling and incomplete draws.
            foreach(int width in new[]{63,128,257}) {
                int height=97;
                var capture=(SodaDesktopDxgi)Activator.CreateInstance(typeof(SodaDesktopDxgi),Private,null,new object[]{width,height},null);
                try {
                    IntPtr device,context;uint level;Marshal.ThrowExceptionForHR(D3D11CreateDevice(IntPtr.Zero,1,IntPtr.Zero,0x20,IntPtr.Zero,0,7,out device,out level,out context));
                    Set(capture,"device",device);Set(capture,"context",context);
                    typeof(SodaDesktopDxgi).GetMethod("InitializeResources",Private).Invoke(capture,new object[]{512,256});
                    byte[] pixels=new byte[512*256*4];
                    for(int y=0;y<256;y++)for(int x=0;x<512;x++) {int i=(y*512+x)*4;pixels[i]=(byte)(x/2);pixels[i+1]=(byte)y;pixels[i+2]=37;pixels[i+3]=255;}
                    var pin=GCHandle.Alloc(pixels,GCHandleType.Pinned);
                    try {
                        var upload=(Upload)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(context),48*IntPtr.Size),typeof(Upload));
                        upload(context,Field(capture,"source"),0,IntPtr.Zero,pin.AddrOfPinnedObject(),512*4,0);
                    } finally {pin.Free();}
                    using(var bitmap=new Bitmap(width,height))using(var g=Graphics.FromImage(bitmap)) {
                        typeof(SodaDesktopDxgi).GetMethod("Render",Private).Invoke(capture,new object[]{g});
                        foreach(int y in new[]{0,height/2,height-1})foreach(int x in new[]{0,width/2,width-1}) {
                            var c=bitmap.GetPixel(x,y);int blue=(int)((x+0.5)*256/width),green=(int)((y+0.5)*256/height);
                            Check(Math.Abs(c.B-blue)<=2 && Math.Abs(c.G-green)<=2 && c.R==37,"GPU scaling/color/orientation mismatch at "+x+","+y+": "+c);
                        }
                        // Re-render retained source: idle captures must not retain
                        // the caller's cursor/overlay from a previous bitmap.
                        g.Clear(Color.Magenta);
                        typeof(SodaDesktopDxgi).GetMethod("Render",Private).Invoke(capture,new object[]{g});
                        Check(bitmap.GetPixel(width/2,height/2).R==37,"Retained source contaminated");
                    }
                } finally {capture.Dispose();capture.Dispose();}
            }
            Check(SodaDesktopDxgi.TryCreate("nonexistent-output",new Rectangle(0,0,1,1),0,10)==null,"Invalid dimensions accepted");
            Check(SodaDesktopDxgi.TryCreate("nonexistent-output",new Rectangle(0,0,1,1),100,100)==null,"Missing output did not fall back");
            Console.WriteLine("desktop_dxgi_gpu_checks_passed: generated pixels only; odd widths, GPU scaling, orientation, BGR, retained source, disposal, fallback");
        }
    }
}

namespace SodaDesktopTests {
    public static class DxgiLiveChecks {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
        public static void Run() {
            SetProcessDPIAware();
            // No lock/unlock or input. Only a normal desktop may run this opt-in test.
            if(SodaDesktopUnlock.SelectSource()!="normal")throw new InvalidOperationException("Normal desktop required");
            var screen=System.Windows.Forms.Screen.PrimaryScreen;var bounds=screen.Bounds;
            int width=Math.Min(1280,bounds.Width),height=(int)Math.Round(bounds.Height*(double)width/bounds.Width);
            using(var form=new System.Windows.Forms.Form()) {
                form.FormBorderStyle=System.Windows.Forms.FormBorderStyle.None;form.TopMost=true;form.ShowInTaskbar=false;
                form.StartPosition=System.Windows.Forms.FormStartPosition.Manual;
                form.Bounds=new Rectangle(bounds.Left+64,bounds.Top+64,Math.Min(512,bounds.Width-128),Math.Min(256,bounds.Height-128));
                form.Paint+=(sender,e)=>{
                    int w=form.ClientSize.Width/2,h=form.ClientSize.Height/2;
                    e.Graphics.FillRectangle(Brushes.Red,0,0,w,h);e.Graphics.FillRectangle(Brushes.Lime,w,0,w,h);
                    e.Graphics.FillRectangle(Brushes.Blue,0,h,w,h);e.Graphics.FillRectangle(Brushes.Yellow,w,h,w,h);
                };
                form.Show();form.Refresh();System.Windows.Forms.Application.DoEvents();System.Threading.Thread.Sleep(400);
                using(var capture=SodaDesktopDxgi.TryCreate(screen.DeviceName,bounds,width,height)) {
                    if(capture==null)throw new InvalidOperationException("DXGI unavailable");
                    using(var bitmap=new Bitmap(width,height))using(var g=Graphics.FromImage(bitmap)) {
                        g.Clear(Color.Magenta);
                        bool initial=capture.Capture(g);
                        if(!initial && bitmap.GetPixel(0,0).ToArgb()!=Color.Magenta.ToArgb())throw new InvalidOperationException("Initial pointer-only frame drew undefined pixels");
                        if(initial) {
                            int x=(form.Left+form.Width/4-bounds.Left)*width/bounds.Width,y=(form.Top+form.Height/4-bounds.Top)*height/bounds.Height;
                            var first=bitmap.GetPixel(x,y);
                            if(first.R<247 || first.G>8 || first.B>8)throw new InvalidOperationException("Initial pointer-only surface was published");
                        }
                        bool captured=false;
                        for(int attempt=0;attempt<10 && !captured;attempt++) {
                            form.Invalidate();form.Update();System.Windows.Forms.Application.DoEvents();System.Threading.Thread.Sleep(100);
                            captured=capture.Capture(g);
                        }
                        if(!captured)throw new InvalidOperationException("No desktop present after test window redraw");
                        Color[] colors={Color.Red,Color.Lime,Color.Blue,Color.Yellow};
                        for(int i=0;i<4;i++) {
                            int x=form.Left+form.Width*((i%2)*2+1)/4,y=form.Top+form.Height*((i/2)*2+1)/4;
                            var pixel=bitmap.GetPixel((x-bounds.Left)*width/bounds.Width,(y-bounds.Top)*height/bounds.Height);
                            if(Math.Abs(pixel.R-colors[i].R)>8 || Math.Abs(pixel.G-colors[i].G)>8 || Math.Abs(pixel.B-colors[i].B)>8)throw new InvalidOperationException("Live desktop duplication color/coordinate mismatch "+i+" actual="+pixel+" location="+form.Bounds+" source="+bounds);
                        }
                    }
                }
                form.Close();
            }
            Console.WriteLine("desktop_dxgi_live_capture_passed: generated window captured through DXGI and GPU downscale; no images saved or input sent");
        }
    }
}
