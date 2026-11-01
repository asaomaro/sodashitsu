param([string]$HandleValue,[string]$OutputPath)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PaintCapture {
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct POINT {public int X,Y;}
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref POINT p);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
[void][PaintCapture]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$handle=[IntPtr]::new([long]::Parse($HandleValue))
$r=New-Object PaintCapture+RECT
$p=New-Object PaintCapture+POINT
[void][PaintCapture]::GetClientRect($handle,[ref]$r)
[void][PaintCapture]::ClientToScreen($handle,[ref]$p)
$bitmap=New-Object Drawing.Bitmap ($r.Right-$r.Left),($r.Bottom-$r.Top)
$graphics=[Drawing.Graphics]::FromImage($bitmap)
try {$graphics.CopyFromScreen($p.X,$p.Y,0,0,$bitmap.Size);$bitmap.Save($OutputPath,[Drawing.Imaging.ImageFormat]::Png)} finally {$graphics.Dispose();$bitmap.Dispose()}
if([PaintCapture]::GetForegroundWindow() -ne $handle){throw 'Test window lost foreground before screen capture'}
