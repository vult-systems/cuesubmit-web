# OpenCue Tools

## First-Time Setup

Run `SetupClientTools.bat` once to install the OpenCue packages.

## Launchers

| File | Purpose |
|------|---------|
| CueSubmit.bat | Submit render jobs |
| CueGUI.bat | Monitor jobs and hosts |
| CueAdmin.bat | Command line tools |

## Requirements

- Python 3.9 installed at C:\Program Files\Python39\
- Network access to 10.40.14.25

## Troubleshooting

**Nothing happens when clicking launcher:**
- Run SetupClientTools.bat first
- Check Python is installed

**Cannot connect to Cuebot:**
- Test: ping 10.40.14.25
- Verify port 8443 is accessible

## Server Info

- Cuebot: 10.40.14.25:8443
- Logs: \\10.40.14.25\RenderOutputRepo\OpenCue\Logs
