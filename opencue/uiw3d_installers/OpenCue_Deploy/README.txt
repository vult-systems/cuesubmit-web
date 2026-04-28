================================================================================
 OpenCue_Deploy  —  Quick Reference
================================================================================

FILES ON THIS SHARE
-------------------

  INSTALL.bat         Full fresh install  (new machine or complete wipe)
                      - Installs Python + RQD + CueNimby wheel packages
                      - Copies all config files to C:\OpenCue\config\
                      - Registers Windows services via NSSM
                      - Run time: ~10 minutes
                      - HOW TO RUN: right-click > "Run as administrator"
                        (must be done while physically or RDP'd into the host)

  UPDATE.bat          Incremental update  (Python source files + config only)
                      - Copies source\rqd\*.py  and  source\cuenimby\*.py
                      - Copies source\config\cuenimby.json + StartCueNimby.vbs
                      - Schedules RQD service restart ~2 min later
                      - Run time: ~2 minutes
                      - HOW TO RUN: normally triggered automatically by the
                        web admin page ("Update" button); can also be run
                        manually as Administrator when needed

  REMOTE-UPDATE.bat   Elevation bridge — called by the web admin "Update" button
                      - Runs as the RQD/SYSTEM account (non-admin)
                      - Creates a scheduled task to run UPDATE.bat elevated
                        as the local csadmin### account, then fires it
                      - Do NOT run directly; this is invoked by the web app

  DIAGNOSE.bat        Health diagnostic  (11-point check)
                      - Verifies Python, services, config, and connectivity
                      - Run via the web admin "Diagnose" button, or manually
                        as Administrator to troubleshoot a specific machine

  post-update.ps1     Post-update hook called by UPDATE.bat
                      - Restarts RQD service after the source update

  LaunchCueNimby.bat  Starts CueNimby manually (used for testing/debugging)

  TEST-CUEBOT.py      Quick connectivity test — verifies CueBot is reachable


DIRECTORIES
-----------

  source\rqd\         RQD Python source files (deployed by UPDATE.bat)
  source\cuenimby\    CueNimby Python source files (deployed by UPDATE.bat)
  source\config\      Config files shared by both INSTALL and UPDATE:
                        cuenimby.json     — CueNimby runtime config
                        opencue.yaml      — OpenCue client config
                        rqd.conf          — RQD config (contains __LAB_TAG__ placeholder)
                        StartCueNimby.vbs — Startup script for CueNimby tray app
  utils\              Embedded installers: Python wheel packages, NSSM binary,
                      used only by INSTALL.bat for a full fresh install.
                      NOTE: these large binaries are stored on the share only
                      and are NOT tracked in git (see utils\.gitignore)


TYPICAL WORKFLOWS
-----------------

  New machine (first-time setup):
    1. Open File Explorer to \\10.40.14.25\RenderSourceRepository\Utility\OpenCue_Deploy
    2. Right-click INSTALL.bat > "Run as administrator"
    3. Follow prompts (~10 min)
    4. Verify machine appears in the web admin host list

  Pushing a code/config update to existing machines:
    1. In the web admin page, select the target hosts
    2. Click "Update"
    3. Monitor job status in the status table (~2 min per host)

  Diagnosing a down/misbehaving machine:
    1. In the web admin page, select the host
    2. Click "Diagnose"
    3. View frame log output for details on the failing check


MAINTENANCE NOTES
-----------------

  - Config files (source\config\*) are kept in source control and published
    to this share via scripts\publish-to-share.ps1 in the cuesubmit-web repo.
  - To update config, edit the file in the repo under
    opencue\uiw3d_installers\OpenCue_Deploy\utils\config\, commit, and run
    publish-to-share.ps1 from the repo root on Windows.
  - rqd.conf contains the placeholder  __LAB_TAG__  which INSTALL.bat and
    UPDATE.bat replace at install time with the room number (e.g. "400").

================================================================================
