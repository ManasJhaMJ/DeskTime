# DPI-aware capture of the Wellbeing dashboard. Optional -ClickX/-ClickY in logical window pixels before capture.
# Picks the largest visible top-level window with the given title (skips balloons/helpers) and restores it if minimized.
param([string]$Out = "shot.png", [string]$Title = "DeskTime", [int]$ClickX = -1, [int]$ClickY = -1, [int]$LogicalW = 1180, [int]$Wait = 900)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr i);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  public static List<IntPtr> Find(string title) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); if (sb.ToString() == title && IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }
}
"@
[W]::SetProcessDPIAware() | Out-Null
$best = [IntPtr]::Zero; $bestArea = 0
foreach ($h in [W]::Find($Title)) {
  if ([W]::IsIconic($h)) { [W]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 400 }
  $rr = New-Object RECT; [W]::GetWindowRect($h, [ref]$rr) | Out-Null
  $area = ($rr.Right - $rr.Left) * ($rr.Bottom - $rr.Top)
  if ($area -gt $bestArea) { $best = $h; $bestArea = $area }
}
if ($best -eq [IntPtr]::Zero) { Write-Output "window not found"; exit 1 }
[W]::SetForegroundWindow($best) | Out-Null
Start-Sleep -Milliseconds 300
$r = New-Object RECT
[W]::GetWindowRect($best, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
$scale = $w / $LogicalW
if ($ClickX -ge 0) {
  $px = [int]($r.Left + $ClickX * $scale); $py = [int]($r.Top + $ClickY * $scale)
  [W]::SetCursorPos($px, $py) | Out-Null
  Start-Sleep -Milliseconds 80
  [W]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); [W]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds $Wait
}
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "captured ${w}x${h} (scale $scale) -> $Out"
