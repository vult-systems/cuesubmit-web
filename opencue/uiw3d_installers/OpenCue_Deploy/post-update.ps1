<#
.SYNOPSIS
    Post-update script run by Task Scheduler AS SYSTEM after an OpenCue update.

    1. Restarts the OpenCueRQD Windows service.
    2. Kills any lingering CueNimby (pythonw.exe) processes.
    3. Relaunches CueNimby inside every active interactive user session using
       WTSQueryUserToken + CreateProcessAsUser (requires SeTcbPrivilege = SYSTEM).

    Called ~30 s after UPDATE.bat completes (via the 'OpenCueRQDRestart' schtask).
#>

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
