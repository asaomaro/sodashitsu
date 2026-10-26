param([switch]$Benchmark)
$ErrorActionPreference='Stop'
# Read topology metadata only. Does not capture pixels, send input, access the
# clipboard, change display modes/scaling, or start a desktop sharing session.
Add-Type -Path @((Join-Path $PSScriptRoot 'WindowsDesktopUnlock.cs'),(Join-Path $PSScriptRoot 'WindowsDesktopHost.cs')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll
$driver=New-Object SodaDesktopMonitorLayout+NativeDriver
$items=$driver.Read()
if($items.Count -lt 1){throw 'No active monitor'}
$layout=New-Object SodaDesktopMonitorLayout -ArgumentList $driver,$items[0].Id
if(-not $layout.Matches($driver)){throw 'Topology changed during the metadata probe'}
if($Benchmark){
    $times=New-Object 'System.Collections.Generic.List[double]'
    for($i=0;$i -lt 30;$i++){$clock=[Diagnostics.Stopwatch]::StartNew();if(-not $layout.Matches($driver)){throw 'Topology changed during benchmark'};$clock.Stop();$times.Add($clock.Elapsed.TotalMilliseconds)}
    $sorted=@($times|Sort-Object)
    @{topology=$layout.Message();source='read-only topology guard; not input-to-display latency';samples=30;medianMs=$sorted[14];p95Ms=$sorted[28]}|ConvertTo-Json -Depth 7 -Compress
}else{$layout.Message() | ConvertTo-Json -Depth 6 -Compress}
