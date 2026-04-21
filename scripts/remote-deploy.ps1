<#
.SYNOPSIS
    DEPRECATED — PowerShell Remoting (WinRM) is not available on lab machines.

    Use these instead:

    1. Publish updated source files to the UNC share (run once after git pull):
           .\scripts\publish-to-share.ps1

    2. Test on one machine (run UPDATE.bat as admin on that machine):
           \\10.40.14.25\RenderSourceRepository\Utility\OpenCue_Deploy\UPDATE.bat

    3. Roll out to all farm hosts via OpenCue:
           docker exec cuesubmit-web node /app/scripts/opencue-deploy.js
#>
Write-Host "This script is deprecated. See comments above for the correct workflow." -ForegroundColor Yellow


.DESCRIPTION
    Uses PowerShell Remoting (WinRM) to push updated Python source files
    directly to target machines via PSSession (Copy-Item). This avoids the
    double-hop UNC problem — files are pushed FROM this admin machine rather
    than pulled by the render host.

    After file copy, the script restarts the OpenCueRQD service on each host.

    Prerequisites:
    - WinRM is already enabled on all lab machines (DEPLOY.bat handles this).
    - The service account csadmin<LabNum> has admin rights on each machine.
    - Run this script from an admin machine with network access to the lab.

.PARAMETER ComputerName
    Fully-qualified hostname of a single machine to update (for testing).
    Example: AD404-01.ad.uiwtx.edu

.PARAMETER LabNum
    Lab room number. Updates all machines with hostnames matching AD<LabNum>-*.
    Example: 404

.PARAMETER AllLabs
    Update all known lab rooms (400, 404, 405, 406, 407).

.PARAMETER SourceBase
    Local path to the OpenCue_Deploy folder containing source files.
    Defaults to the directory containing this script's parent (opencue/uiw3d_installers/OpenCue_Deploy).

.PARAMETER Credential
    PS credential to use for WinRM. If omitted, prompts per-lab using csadmin<LabNum>.

.PARAMETER MaxJobs
    Maximum number of machines to update in parallel. Default: 10.

.EXAMPLE
    # Test on one machine before rolling out:
    .\remote-deploy.ps1 -ComputerName "AD404-01.ad.uiwtx.edu"

    # Deploy to all machines in lab 404:
    .\remote-deploy.ps1 -LabNum 404

    # Deploy to all labs:
    .\remote-deploy.ps1 -AllLabs

    # Deploy with explicit credential:
    .\remote-deploy.ps1 -AllLabs -Credential (Get-Credential ".\csadmin404")
#>

[CmdletBinding(DefaultParameterSetName = 'Single')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Single')]
    [string]$ComputerName,

    [Parameter(Mandatory, ParameterSetName = 'Lab')]
    [string]$LabNum,

    [Parameter(Mandatory, ParameterSetName = 'All')]
    [switch]$AllLabs,

    [string]$SourceBase = "",

    [System.Management.Automation.PSCredential]$Credential,

    [int]$MaxJobs = 10,

    # How long to wait for each machine's update before giving up (seconds)
    [int]$TimeoutSeconds = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
if (-not $SourceBase) {
    # Default: scripts/ is at repo root, deploy folder is opencue/uiw3d_installers/OpenCue_Deploy
    $SourceBase = Join-Path (Split-Path $PSScriptRoot -Parent) "opencue\uiw3d_installers\OpenCue_Deploy"
}

$SitePackagesOnHost = "C:\Program Files\Python39\Lib\site-packages"
$OpenCueConfigOnHost = "C:\OpenCue\config"
$StartupFolderOnHost = "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup"

# Source files to push
$FilesToPush = @(
    @{ Src = "$SourceBase\..\..\rqd\rqd\rqnimby.py";       Dst = "$SitePackagesOnHost\rqd\rqnimby.py" }
    @{ Src = "$SourceBase\..\..\rqd\rqd\rqconstants.py";    Dst = "$SitePackagesOnHost\rqd\rqconstants.py" }
    @{ Src = "$SourceBase\..\..\cuenimby\cuenimby\activity.py"; Dst = "$SitePackagesOnHost\cuenimby\activity.py" }
    @{ Src = "$SourceBase\..\..\cuenimby\cuenimby\config.py";   Dst = "$SitePackagesOnHost\cuenimby\config.py" }
    @{ Src = "$SourceBase\..\..\cuenimby\cuenimby\tray.py";     Dst = "$SitePackagesOnHost\cuenimby\tray.py" }
    @{ Src = "$SourceBase\utils\config\cuenimby.json";           Dst = "$OpenCueConfigOnHost\cuenimby.json" }
    @{ Src = "$SourceBase\utils\config\StartCueNimby.vbs";       Dst = "$StartupFolderOnHost\StartCueNimby.vbs" }
)

# Resolve relative paths
$FilesToPush = $FilesToPush | ForEach-Object {
    $_.Src = [System.IO.Path]::GetFullPath($_.Src)
    $_
}

# ---------------------------------------------------------------------------
# Known labs and their host ranges
# ---------------------------------------------------------------------------
$KnownLabs = @{
    "400" = @{ Domain = "ad.uiwtx.edu"; MaxHost = 20; AdminUser = "csadmin400" }
    "404" = @{ Domain = "ad.uiwtx.edu"; MaxHost = 30; AdminUser = "csadmin404" }
    "405" = @{ Domain = "ad.uiwtx.edu"; MaxHost = 30; AdminUser = "csadmin405" }
    "406" = @{ Domain = "ad.uiwtx.edu"; MaxHost = 30; AdminUser = "csadmin406" }
    "407" = @{ Domain = "ad.uiwtx.edu"; MaxHost = 30; AdminUser = "csadmin407" }
}

# ---------------------------------------------------------------------------
# Helper: get credential for a lab
# ---------------------------------------------------------------------------
function Get-LabCredential([string]$Lab, [System.Management.Automation.PSCredential]$Override) {
    if ($Override) { return $Override }
    $labInfo = $KnownLabs[$Lab]
    $username = if ($labInfo) { ".\$($labInfo.AdminUser)" } else { ".\csadmin$Lab" }
    return Get-Credential -UserName $username -Message "Enter password for $Lab (csadmin$Lab)"
}

# ---------------------------------------------------------------------------
# Helper: enumerate target hosts for a lab
# ---------------------------------------------------------------------------
function Get-LabHosts([string]$Lab) {
    $labInfo = $KnownLabs[$Lab]
    if (-not $labInfo) {
        Write-Warning "Unknown lab: $Lab — attempting anyway with default MaxHost=20"
        $labInfo = @{ Domain = "ad.uiwtx.edu"; MaxHost = 20 }
    }
    $domain = $labInfo.Domain
    $max = $labInfo.MaxHost

    $hosts = @()
    for ($i = 1; $i -le $max; $i++) {
        $hosts += "AD$Lab-{0:D2}.$domain" -f $i
    }
    return $hosts
}

# ---------------------------------------------------------------------------
# Core: update a single machine
# ---------------------------------------------------------------------------
function Update-Host {
    param(
        [string]$Target,
        [System.Management.Automation.PSCredential]$Cred,
        [hashtable[]]$FilePairs
    )

    $result = [PSCustomObject]@{
        Host    = $Target
        Status  = "Unknown"
        Message = ""
        Time    = $null
    }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        # Test WinRM availability first (quick ping)
        $reachable = Test-WSMan -ComputerName $Target -ErrorAction SilentlyContinue
        if (-not $reachable) {
            $result.Status = "Skipped"
            $result.Message = "WinRM not reachable"
            return $result
        }

        $sessionOpts = New-PSSessionOption -OpenTimeout 15000 -OperationTimeout ($TimeoutSeconds * 1000)
        $session = New-PSSession -ComputerName $Target -Credential $Cred `
            -SessionOption $sessionOpts -ErrorAction Stop

        try {
            # Push each file directly via PSSession (no double-hop UNC needed)
            foreach ($pair in $FilePairs) {
                if (-not (Test-Path $pair.Src)) {
                    Write-Warning "[$Target] Source not found: $($pair.Src) — skipping"
                    continue
                }
                Copy-Item -Path $pair.Src -Destination $pair.Dst -ToSession $session -Force -ErrorAction Stop
            }

            # Restart RQD service
            Invoke-Command -Session $session -ScriptBlock {
                Restart-Service -Name "OpenCueRQD" -Force -ErrorAction Stop
            } -ErrorAction Stop

            $result.Status = "OK"
            $result.Message = "Files pushed, service restarted"
        }
        finally {
            Remove-PSSession $session -ErrorAction SilentlyContinue
        }
    }
    catch {
        $result.Status = "Failed"
        $result.Message = $_.Exception.Message
    }
    finally {
        $sw.Stop()
        $result.Time = "$($sw.Elapsed.TotalSeconds.ToString('F1'))s"
    }

    return $result
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "OpenCue Remote Deploy" -ForegroundColor Cyan
Write-Host "Source: $SourceBase" -ForegroundColor DarkGray
Write-Host ""

# Validate source files exist
$missing = $FilesToPush | Where-Object { -not (Test-Path $_.Src) }
if ($missing) {
    Write-Warning "Some source files not found:"
    $missing | ForEach-Object { Write-Warning "  $($_.Src)" }
    $response = Read-Host "Continue anyway? [y/N]"
    if ($response -notmatch '^[Yy]') { exit 1 }
}

# Build target list
switch ($PSCmdlet.ParameterSetName) {
    'Single' {
        $targets = @(@{ Host = $ComputerName; Lab = "???" })
        if ($Credential) {
            $labCreds = @{ "???" = $Credential }
        } else {
            $cred = Get-Credential -Message "Credential for $ComputerName"
            $labCreds = @{ "???" = $cred }
        }
    }
    'Lab' {
        $targets = (Get-LabHosts $LabNum) | ForEach-Object { @{ Host = $_; Lab = $LabNum } }
        $labCreds = @{ $LabNum = (Get-LabCredential $LabNum $Credential) }
        Write-Host "Lab $LabNum — $($targets.Count) potential hosts" -ForegroundColor Yellow
    }
    'All' {
        $targets = @()
        $labCreds = @{}
        foreach ($lab in $KnownLabs.Keys | Sort-Object) {
            $targets += (Get-LabHosts $lab) | ForEach-Object { @{ Host = $_; Lab = $lab } }
            $labCreds[$lab] = Get-LabCredential $lab $Credential
        }
        Write-Host "All labs — $($targets.Count) potential hosts" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Starting update (parallel=$MaxJobs)..." -ForegroundColor Cyan
Write-Host ""

# Run in parallel using PS jobs, MaxJobs at a time
$results = [System.Collections.Generic.List[PSCustomObject]]::new()
$jobs = [System.Collections.Generic.List[hashtable]]::new()

foreach ($t in $targets) {
    # Wait if at MaxJobs
    while ($jobs.Count -ge $MaxJobs) {
        $done = $jobs | Where-Object { $_.Job.State -ne 'Running' }
        foreach ($d in $done) {
            $r = Receive-Job -Job $d.Job
            $results.Add($r)
            Remove-Job -Job $d.Job
            $jobs.Remove($d) | Out-Null
            $icon = if ($r.Status -eq 'OK') { "[OK]" } elseif ($r.Status -eq 'Skipped') { "[--]" } else { "[!!]" }
            $color = if ($r.Status -eq 'OK') { 'Green' } elseif ($r.Status -eq 'Skipped') { 'DarkGray' } else { 'Red' }
            Write-Host ("  {0,-6} {1,-40} {2} ({3})" -f $icon, $r.Host, $r.Message, $r.Time) -ForegroundColor $color
        }
        if ($jobs.Count -ge $MaxJobs) { Start-Sleep -Milliseconds 500 }
    }

    $cred = $labCreds[$t.Lab]
    $src = $FilesToPush  # capture for closure

    $job = Start-Job -ScriptBlock {
        param($Target, $Cred, $FilePairs, $Timeout)
        # Re-define the helper inside the job
        $result = [PSCustomObject]@{ Host = $Target; Status = "Unknown"; Message = ""; Time = $null }
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $reachable = Test-WSMan -ComputerName $Target -ErrorAction SilentlyContinue
            if (-not $reachable) {
                $result.Status  = "Skipped"
                $result.Message = "WinRM not reachable"
                return $result
            }
            $opts    = New-PSSessionOption -OpenTimeout 15000 -OperationTimeout ($Timeout * 1000)
            $session = New-PSSession -ComputerName $Target -Credential $Cred -SessionOption $opts -ErrorAction Stop
            try {
                foreach ($pair in $FilePairs) {
                    if (-not (Test-Path $pair.Src)) { continue }
                    Copy-Item -Path $pair.Src -Destination $pair.Dst -ToSession $session -Force -ErrorAction Stop
                }
                Invoke-Command -Session $session -ScriptBlock { Restart-Service -Name "OpenCueRQD" -Force } -ErrorAction Stop
                $result.Status  = "OK"
                $result.Message = "Files pushed, service restarted"
            } finally {
                Remove-PSSession $session -ErrorAction SilentlyContinue
            }
        } catch {
            $result.Status  = "Failed"
            $result.Message = $_.Exception.Message
        } finally {
            $sw.Stop()
            $result.Time = "$($sw.Elapsed.TotalSeconds.ToString('F1'))s"
        }
        return $result
    } -ArgumentList $t.Host, $cred, $src, $TimeoutSeconds

    $jobs.Add(@{ Job = $job; Host = $t.Host })
}

# Drain remaining jobs
while ($jobs.Count -gt 0) {
    $done = $jobs | Where-Object { $_.Job.State -ne 'Running' }
    if (-not $done) { Start-Sleep -Milliseconds 500; continue }
    foreach ($d in $done) {
        $r = Receive-Job -Job $d.Job
        $results.Add($r)
        Remove-Job -Job $d.Job
        $jobs.Remove($d) | Out-Null
        $icon  = if ($r.Status -eq 'OK') { "[OK]" } elseif ($r.Status -eq 'Skipped') { "[--]" } else { "[!!]" }
        $color = if ($r.Status -eq 'OK') { 'Green' } elseif ($r.Status -eq 'Skipped') { 'DarkGray' } else { 'Red' }
        Write-Host ("  {0,-6} {1,-40} {2} ({3})" -f $icon, $r.Host, $r.Message, $r.Time) -ForegroundColor $color
    }
}

# Summary
$ok      = ($results | Where-Object { $_.Status -eq 'OK' }).Count
$skipped = ($results | Where-Object { $_.Status -eq 'Skipped' }).Count
$failed  = ($results | Where-Object { $_.Status -eq 'Failed' }).Count

Write-Host ""
Write-Host "=" * 60 -ForegroundColor DarkGray
Write-Host "  Updated : $ok" -ForegroundColor Green
Write-Host "  Skipped : $skipped (offline/unreachable)" -ForegroundColor DarkGray
Write-Host "  Failed  : $failed" -ForegroundColor $(if ($failed -gt 0) { 'Red' } else { 'DarkGray' })
Write-Host "=" * 60 -ForegroundColor DarkGray

if ($failed -gt 0) {
    Write-Host ""
    Write-Host "Failed machines:" -ForegroundColor Red
    $results | Where-Object { $_.Status -eq 'Failed' } | ForEach-Object {
        Write-Host "  $($_.Host): $($_.Message)" -ForegroundColor Red
    }
}
