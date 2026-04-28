<#
.SYNOPSIS
    POST-UPDATE script run by Task Scheduler AS SYSTEM after an OpenCue update.
    1. Restarts the OpenCueRQD Windows service.
    2. Kills any lingering CueNimby (pythonw.exe) processes.
    3. Relaunches CueNimby in every active interactive user session via a
       per-user scheduled task with LogonType=Interactive.
    4. Writes a detailed diagnostic log to C:\OpenCue\logs\POST-UPDATE-debug.log
    Called ~40s after UPDATE.bat completes (via the OpenCueRQDRestart schtask).
#>

$LOG       = "C:\OpenCue\logs\update.log"
$DEBUG_LOG = "C:\OpenCue\logs\POST-UPDATE-debug.log"
$PYTHON    = "C:\Program Files\Python39\pythonw.exe"
$CONFIG    = "C:\OpenCue\config\cuenimby.json"
$VBS       = "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\StartCueNimby.vbs"

function Write-Log([string]$Msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Msg"
    Write-Host $line
    Add-Content -Path $LOG       -Value $line -ErrorAction SilentlyContinue
    Add-Content -Path $DEBUG_LOG -Value $line -ErrorAction SilentlyContinue
}

function Write-Dbg([string]$Msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [DBG] $Msg"
    Write-Host $line
    Add-Content -Path $DEBUG_LOG -Value $line -ErrorAction SilentlyContinue
}

Write-Log "--- POST-UPDATE START ---"

# ============================================================
# DIAGNOSTIC DUMP
# ============================================================
Write-Dbg "============================================================"
Write-Dbg "SYSTEM ENVIRONMENT"
Write-Dbg "  Hostname    : $env:COMPUTERNAME"
Write-Dbg "  Running as  : $([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)"
Write-Dbg "  OS          : $([System.Environment]::OSVersion.VersionString)"
Write-Dbg "  PowerShell  : $($PSVersionTable.PSVersion)"
Write-Dbg "  VBS exists  : $((Test-Path 'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\StartCueNimby.vbs'))"
Write-Dbg "  PY  exists  : $((Test-Path 'C:\Program Files\Python39\pythonw.exe'))"
Write-Dbg "  CFG exists  : $((Test-Path 'C:\OpenCue\config\cuenimby.json'))"
Write-Dbg ""

Write-Dbg "QUSER OUTPUT:"
try { $q = & quser 2>&1; foreach ($ql in $q) { Write-Dbg "  $ql" } }
catch { Write-Dbg "  quser failed: $($_.Exception.Message)" }
Write-Dbg ""

Write-Dbg "explorer.exe processes:"
try {
    $exps = Get-CimInstance Win32_Process -Filter "name='explorer.exe'" -ErrorAction SilentlyContinue
    foreach ($e in $exps) {
        $own = Invoke-CimMethod -InputObject $e -MethodName GetOwner -ErrorAction SilentlyContinue
        Write-Dbg "  PID=$($e.ProcessId) Session=$($e.SessionId) Owner=$($own.Domain)\$($own.User)"
    }
    if (-not $exps) { Write-Dbg "  (none found)" }
} catch { Write-Dbg "  query failed: $($_.Exception.Message)" }
Write-Dbg "============================================================"
Write-Dbg ""

# ---------------------------------------------------------------------------
# 1. Restart OpenCueRQD service
# ---------------------------------------------------------------------------
Write-Log "Stopping OpenCueRQD..."
Stop-Service -Name OpenCueRQD -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Log "Starting OpenCueRQD..."
Start-Service -Name OpenCueRQD -ErrorAction SilentlyContinue
$svc = Get-Service -Name OpenCueRQD -ErrorAction SilentlyContinue
Write-Log "OpenCueRQD state: $($svc.Status)"

# ---------------------------------------------------------------------------
# 2. Kill lingering CueNimby
# ---------------------------------------------------------------------------
Write-Log "Stopping CueNimby (pythonw.exe)..."
Get-Process -Name pythonw -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# ---------------------------------------------------------------------------
# 3. Relaunch CueNimby for every active interactive user session
# ---------------------------------------------------------------------------

function Get-InteractiveUsers {
    $users = @()

    # Method 1: Win32_ComputerSystem.UserName (fast, gets the active console/RDP user)
    $primary = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName
    if ($primary -and $primary.Trim() -ne '') { $users += $primary.Trim() }

    # Method 2: explorer.exe GetOwner (catches additional sessions if any)
    try {
        $exps2 = Get-CimInstance Win32_Process -Filter "name='explorer.exe'" -ErrorAction SilentlyContinue
        foreach ($e2 in $exps2) {
            $o = Invoke-CimMethod -InputObject $e2 -MethodName GetOwner -ErrorAction SilentlyContinue
            if ($o -and $o.User) {
                $u = "$($o.Domain)\$($o.User)"
                if ($u -notin $users) { $users += $u }
            }
        }
    } catch { }

    return $users | Select-Object -Unique
}

$interactiveUsers = Get-InteractiveUsers
Write-Dbg "Get-InteractiveUsers: $(if($interactiveUsers.Count){'['+($interactiveUsers -join ', ')+']'}else{'(empty)'})"

if ($interactiveUsers.Count -eq 0) {
    Write-Log "INFO: No interactive users found -- CueNimby will start at next logon."
    Write-Log "--- POST-UPDATE END ---"
    exit 0
}

Write-Log "Interactive users found: $($interactiveUsers -join ', ')"

# Use literal single-quoted strings so no variable substitution can corrupt the path
$litVBS    = 'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\StartCueNimby.vbs'
$litPython = 'C:\Program Files\Python39\pythonw.exe'
$litConfig = 'C:\OpenCue\config\cuenimby.json'

Write-Dbg "Launcher check: VBS=$((Test-Path $litVBS))  PY=$((Test-Path $litPython))"

# The task runs in the user's own interactive session via cmd.exe so that
# taskkill /F kills any lingering pythonw BEFORE launching a new one.
# SYSTEM's Stop-Process cross-session can silently fail on Windows 11,
# causing duplicate tray icons if a stale pythonw was still alive.
if (Test-Path $litVBS) {
    $exePath = 'cmd.exe'
    $exeArgs = "/c taskkill /F /IM pythonw.exe /T >nul 2>&1 & timeout /t 2 /nobreak >nul & wscript.exe `"$litVBS`""
    Write-Log "Using launcher: cmd -> taskkill -> wscript $litVBS"
} elseif (Test-Path $litPython) {
    $exePath = 'cmd.exe'
    $exeArgs = "/c taskkill /F /IM pythonw.exe /T >nul 2>&1 & timeout /t 2 /nobreak >nul & `"$litPython`" -m cuenimby --config `"$litConfig`""
    Write-Log "VBS not found -- launching pythonw.exe directly via cmd"
} else {
    Write-Log "ERROR: Neither StartCueNimby.vbs nor pythonw.exe found. Cannot relaunch CueNimby."
    Write-Log "--- POST-UPDATE END ---"
    exit 1
}

foreach ($user in $interactiveUsers) {
    Write-Log "Registering CueNimby relaunch task for: $user"
    $taskName = "CueNimbyRelaunch_$(($user -replace '[\\/@]','_'))"

    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

    $action    = New-ScheduledTaskAction -Execute $exePath -Argument $exeArgs
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $trigger   = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(5)
    # Note: -DeleteExpiredTaskAfter is intentionally omitted -- on PS 5.1 it
    # causes Register-ScheduledTask to emit XML with an empty <EndBoundary/>
    # element which the task scheduler then rejects as invalid.
    $settings  = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
        -StartWhenAvailable

    try {
        Register-ScheduledTask -TaskName $taskName `
            -Action $action -Trigger $trigger `
            -Principal $principal -Settings $settings `
            -Force -ErrorAction Stop | Out-Null

        Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
        Write-Log "  [OK] Task triggered for $user"

        Start-Sleep -Seconds 4
        $ti = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Write-Dbg "  Task state after Start: $($ti.State)"
        $np = Get-Process -Name pythonw -ErrorAction SilentlyContinue
        Write-Dbg "  pythonw running: $(if($np){'YES PID='+($np.Id -join ',')}else{'NO'})"

    } catch {
        Write-Log "  [WARN] Task registration failed for ${user}: $($_.Exception.Message)"
        Write-Log "  CueNimby will start at next logon via Startup folder."
    }
}

Write-Log "--- POST-UPDATE END ---"
