<#
.SYNOPSIS
    Post-update script run by Task Scheduler AS SYSTEM after an OpenCue update.

    1. Restarts the OpenCueRQD Windows service.
    2. Kills any lingering CueNimby (pythonw.exe) processes.
    3. Relaunches CueNimby in every active interactive user session by creating
       a per-user scheduled task with LogonType=Interactive, then triggering it.
       Task Scheduler handles session-to-user mapping natively — no P/Invoke needed.

    Called ~30 s after UPDATE.bat completes (via the 'OpenCueRQDRestart' schtask).
#>

$LOG    = "C:\OpenCue\logs\update.log"
$PYTHON = "C:\Program Files\Python39\pythonw.exe"
$CONFIG = "C:\OpenCue\config\cuenimby.json"
$VBS    = "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\StartCueNimby.vbs"

function Write-Log([string]$Msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Msg"
    Write-Host $line
    Add-Content -Path $LOG -Value $line -ErrorAction SilentlyContinue
}

Write-Log "--- post-update START ---"

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
#
#    Strategy: Register-ScheduledTask with LogonType=Interactive lets Task
#    Scheduler resolve and inject into the user's desktop session automatically.
#    This is the official Windows approach — no P/Invoke or token duplication.
#    SYSTEM has the privilege to register tasks for other users this way.
# ---------------------------------------------------------------------------

# Collect all unique interactive usernames from active explorer.exe processes.
# Each logged-in interactive user owns at least one explorer.exe.
function Get-InteractiveUsers {
    $users = @()

    # Primary: Win32_ComputerSystem.UserName (console/active RDP session)
    $primary = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName
    if ($primary -and $primary.Trim() -ne '') {
        $users += $primary.Trim()
    }

    # Secondary: query all interactive logon sessions (type 2=console, 10=RDP)
    try {
        $logonSessions = Get-CimInstance Win32_LogonSession -ErrorAction SilentlyContinue |
            Where-Object { $_.LogonType -in @(2, 10) }
        foreach ($session in $logonSessions) {
            $assoc = Get-CimAssociatedInstance -InputObject $session `
                -ResultClassName Win32_UserAccount -ErrorAction SilentlyContinue
            if ($assoc) {
                $uname = "$($assoc.Domain)\$($assoc.Name)"
                if ($uname -notin $users) { $users += $uname }
            }
        }
    } catch { }

    return $users | Select-Object -Unique
}

$interactiveUsers = Get-InteractiveUsers

if ($interactiveUsers.Count -eq 0) {
    Write-Log "INFO: No interactive users found — CueNimby will start at next logon via Startup folder."
    Write-Log "--- post-update END ---"
    exit 0
}

Write-Log "Interactive users found: $($interactiveUsers -join ', ')"

# Choose launch method: VBS (if present) or direct pythonw.exe
if (Test-Path $VBS) {
    $exePath  = "wscript.exe"
    $exeArgs  = "`"$VBS`""
    Write-Log "Using launcher: wscript.exe `"$VBS`""
} elseif (Test-Path $PYTHON) {
    $exePath  = $PYTHON
    $exeArgs  = "-m cuenimby --config `"$CONFIG`" --verbose"
    Write-Log "VBS not found — launching pythonw.exe directly"
} else {
    Write-Log "ERROR: Neither StartCueNimby.vbs nor pythonw.exe found. CueNimby will not relaunch."
    Write-Log "--- post-update END ---"
    exit 1
}

foreach ($user in $interactiveUsers) {
    Write-Log "Registering CueNimby relaunch task for: $user"
    $taskName = "CueNimbyRelaunch_$(($user -replace '[\\/@]','_'))"

    # Delete any leftover from a previous deploy
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

    $action    = New-ScheduledTaskAction -Execute $exePath -Argument $exeArgs
    # Interactive: task runs in the user's active logon session, no password stored/needed
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    # Trigger 5 seconds from now (give Task Scheduler time to register)
    $trigger   = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(5)
    $settings  = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit    (New-TimeSpan -Minutes 2) `
        -DeleteExpiredTaskAfter (New-TimeSpan -Minutes 30) `
        -StartWhenAvailable

    try {
        Register-ScheduledTask -TaskName $taskName `
            -Action $action -Trigger $trigger `
            -Principal $principal -Settings $settings `
            -Force -ErrorAction Stop | Out-Null

        # Fire immediately rather than waiting for the trigger time
        Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
        Write-Log "  [OK] Task triggered for $user"
    } catch {
        Write-Log "  [WARN] Task registration failed for $user`: $($_.Exception.Message)"
        Write-Log "  CueNimby will start at next logon via Startup folder."
    }
}

Write-Log "--- post-update END ---"

$LOG = "C:\OpenCue\logs\update.log"

function Write-Log([string]$Msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Msg"
    Write-Host $line
    Add-Content -Path $LOG -Value $line -ErrorAction SilentlyContinue
}

Write-Log "--- post-update START ---"

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
# 2. Kill lingering CueNimby (belt-and-suspenders — UPDATE.bat already killed
#    it, but new instances may have appeared during the 30-second wait)
# ---------------------------------------------------------------------------
Write-Log "Stopping CueNimby (pythonw.exe)..."
Get-Process -Name pythonw -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# ---------------------------------------------------------------------------
# 3. Relaunch CueNimby in every active interactive user session
# ---------------------------------------------------------------------------
$vbsPath = "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\StartCueNimby.vbs"

if (-not (Test-Path $vbsPath)) {
    Write-Log "WARN: StartCueNimby.vbs not found at expected path — skipping relaunch"
    Write-Log "--- post-update END ---"
    exit 0
}

# Get all unique session IDs that have an explorer.exe (= interactive user sessions).
$sessionIds = @(
    Get-Process -Name explorer -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty SessionId -Unique
)

if ($sessionIds.Count -eq 0) {
    Write-Log "INFO: No interactive user sessions found — CueNimby will start at next logon"
    Write-Log "--- post-update END ---"
    exit 0
}

# P/Invoke: WTSQueryUserToken + CreateProcessAsUser
# WTSQueryUserToken requires SeTcbPrivilege which only SYSTEM has.
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class WtsLauncher {
    [DllImport("Wtsapi32.dll", SetLastError = true)]
    public static extern bool WTSQueryUserToken(uint sessionId, out IntPtr phToken);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO {
        public int cb;
        public string lpReserved, lpDesktop, lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars;
        public int dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2;
        public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION {
        public IntPtr hProcess, hThread;
        public int dwProcessId, dwThreadId;
    }

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcessAsUser(
        IntPtr hToken, string lpApplicationName, string lpCommandLine,
        IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles,
        uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

    // Returns 0 on success, Win32 error code on failure.
    public static int LaunchInSession(uint sessionId, string cmdLine) {
        IntPtr token = IntPtr.Zero;
        if (!WTSQueryUserToken(sessionId, out token))
            return Marshal.GetLastWin32Error();
        try {
            STARTUPINFO si = new STARTUPINFO {
                cb        = Marshal.SizeOf(typeof(STARTUPINFO)),
                lpDesktop = "winsta0\\default"
            };
            PROCESS_INFORMATION pi;
            const uint CREATE_NEW_CONSOLE = 0x00000010;
            bool ok = CreateProcessAsUser(
                token, null, cmdLine,
                IntPtr.Zero, IntPtr.Zero, false,
                CREATE_NEW_CONSOLE, IntPtr.Zero, null,
                ref si, out pi);
            if (ok) { CloseHandle(pi.hProcess); CloseHandle(pi.hThread); return 0; }
            return Marshal.GetLastWin32Error();
        } finally {
            CloseHandle(token);
        }
    }
}
'@

$cmd = "wscript.exe `"$vbsPath`""

foreach ($sid in $sessionIds) {
    $rc = [WtsLauncher]::LaunchInSession([uint32]$sid, $cmd)
    if ($rc -eq 0) {
        Write-Log "CueNimby relaunched in session $sid (OK)"
    } else {
        Write-Log "WARN: Session $sid — LaunchInSession failed (Win32 error $rc). CueNimby will start at next logon."
    }
}

Write-Log "--- post-update END ---"
