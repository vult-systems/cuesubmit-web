param(
    [string]$RepoRoot  = "",
    [string]$SharePath = ""
)

if (-not $SharePath) { $SharePath = '\\10.40.14.25\RenderSourceRepository\Utility\OpenCue_Deploy' }
if (-not $RepoRoot)  { $RepoRoot  = Split-Path $PSScriptRoot -Parent }

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "OpenCue Publish to Share" -ForegroundColor Cyan
Write-Host "  Repo  : $RepoRoot"
Write-Host "  Share : $SharePath"
Write-Host ""

if (-not (Test-Path $SharePath)) {
    Write-Host "Connecting to share..." -ForegroundColor Yellow
    & net use $SharePath /user:perforce uiw3d 2>&1 | Out-Null
    if (-not (Test-Path $SharePath)) {
        Write-Error "Cannot reach $SharePath"
        exit 1
    }
}

$Files = @(
    @{ Src = "opencue\rqd\rqd\rqnimby.py";                                          Dst = "source\rqd\rqnimby.py" }
    @{ Src = "opencue\rqd\rqd\rqconstants.py";                                      Dst = "source\rqd\rqconstants.py" }
    @{ Src = "opencue\cuenimby\cuenimby\activity.py";                               Dst = "source\cuenimby\activity.py" }
    @{ Src = "opencue\cuenimby\cuenimby\config.py";                                 Dst = "source\cuenimby\config.py" }
    @{ Src = "opencue\cuenimby\cuenimby\monitor.py";                               Dst = "source\cuenimby\monitor.py" }
    @{ Src = "opencue\cuenimby\cuenimby\notifier.py";                               Dst = "source\cuenimby\notifier.py" }
    @{ Src = "opencue\cuenimby\cuenimby\tray.py";                                   Dst = "source\cuenimby\tray.py" }
    @{ Src = "opencue\cuenimby\cuenimby\__main__.py";                               Dst = "source\cuenimby\__main__.py" }
    @{ Src = "opencue\uiw3d_installers\OpenCue_Deploy\utils\config\cuenimby.json";  Dst = "source\config\cuenimby.json" }
    @{ Src = "opencue\uiw3d_installers\OpenCue_Deploy\utils\config\opencue.yaml";  Dst = "source\config\opencue.yaml" }
    @{ Src = "opencue\uiw3d_installers\OpenCue_Deploy\utils\config\StartCueNimby.vbs"; Dst = "source\config\StartCueNimby.vbs" }
    @{ Src = "opencue\uiw3d_installers\OpenCue_Deploy\utils\config\rqd.conf";       Dst = "source\config\rqd.conf" }
    @{ Src = "opencue\uiw3d_installers\OpenCue_Deploy\UPDATE.bat";                  Dst = "UPDATE.bat" }
    @{ Src = "opencue\uiw3d_installers\OpenCue_Deploy\DEPLOY-AS-ADMIN.bat";         Dst = "DEPLOY-AS-ADMIN.bat" }
    @{ Src = "opencue\uiw3d_installers\OpenCue_Deploy\DIAGNOSE.bat";               Dst = "DIAGNOSE.bat" }
    @{ Src = "opencue\uiw3d_installers\OpenCue_Deploy\LaunchCueNimby.bat";         Dst = "LaunchCueNimby.bat" }
    @{ Src = "opencue\uiw3d_installers\OpenCue_Deploy\post-update.ps1";             Dst = "post-update.ps1" }
    @{ Src = "opencue\uiw3d_installers\OpenCue_Deploy\TEST-CUEBOT.py";             Dst = "TEST-CUEBOT.py" }
)

$ok = 0; $failed = 0

foreach ($f in $Files) {
    $srcFull = Join-Path $RepoRoot $f.Src
    $dstFull = Join-Path $SharePath $f.Dst

    if (-not (Test-Path $srcFull)) {
        Write-Warning "  [SKIP] Not in repo: $($f.Src)"
        continue
    }

    $dstDir = Split-Path $dstFull -Parent
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }

    try {
        Copy-Item -Path $srcFull -Destination $dstFull -Force
        $sz = (Get-Item $srcFull).Length
        Write-Host ("  [OK] {0,-55} {1,6} bytes" -f $f.Dst, $sz) -ForegroundColor Green
        $ok++
    } catch {
        Write-Host "  [!!] $($f.Dst): $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "Published : $ok files" -ForegroundColor Green
if ($failed -gt 0) { Write-Host "Failed    : $failed files" -ForegroundColor Red; exit 1 }

$share = '\\10.40.14.25\RenderSourceRepository\Utility\OpenCue_Deploy'
Write-Host ""
Write-Host "Done. Test on AD415-INST by running as admin on that machine:"
Write-Host "  $share\UPDATE.bat"
Write-Host ""
