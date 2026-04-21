"""
TEST-CUEBOT.py  —  Run on AD415-INST to diagnose the gRPC connection failure.

Usage (as the normal lab user, NOT as admin):
  "C:\Program Files\Python39\python.exe"  C:\TEST-CUEBOT.py

What this does:
  1. Reads the cuebot host from C:\OpenCue\config\cuenimby.json
  2. Makes a raw gRPC insecure_channel call and shows the FULL exception
  3. Checks the opencue library version installed
"""

import json
import os
import sys
import traceback

print()
print("=" * 55)
print("  CueBOT gRPC Diagnostic")
print("=" * 55)
print()

# --- Read config ---
config_path = r"C:\OpenCue\config\cuenimby.json"
try:
    with open(config_path) as f:
        cfg = json.load(f)
    host = cfg["cuebot_host"]
    port = cfg.get("cuebot_port", 8443)
    connect_str = f"{host}:{port}"
    print(f"[1] Config: {connect_str}")
except Exception as e:
    print(f"[1] ERROR reading config: {e}")
    sys.exit(1)

# --- Check opencue version ---
try:
    import opencue
    version = getattr(opencue, "__version__", "unknown")
    print(f"[2] opencue library version: {version}")
    site = os.path.dirname(opencue.__file__)
    print(f"    Installed at: {site}")
    print(f"    Contents: {sorted(os.listdir(site))}")
except ImportError as e:
    print(f"[2] ERROR: cannot import opencue: {e}")
    sys.exit(1)

# --- Check grpc version ---
try:
    import grpc
    print(f"[3] grpcio version: {grpc.__version__}")
except ImportError as e:
    print(f"[3] ERROR: cannot import grpc: {e}")
    sys.exit(1)

print()
print("[4] Creating insecure gRPC channel and calling GetSystemStats (10s timeout)...")

# Try to find the right proto import path for whatever version is installed
cue_pb2 = None
cue_pb2_grpc = None

for proto_path in ("opencue.compiled_proto", "opencue_proto", "opencue.proto"):
    try:
        import importlib
        pb2 = importlib.import_module(f"{proto_path}.cue_pb2")
        pb2_grpc = importlib.import_module(f"{proto_path}.cue_pb2_grpc")
        cue_pb2 = pb2
        cue_pb2_grpc = pb2_grpc
        print(f"    Proto path: {proto_path}")
        break
    except ImportError:
        continue

if cue_pb2 is None:
    print("    WARNING: Could not find cue_pb2 via any known proto path.")
    print("    Will try via opencue.Cuebot directly instead.")

try:
    channel = grpc.insecure_channel(
        connect_str,
        options=[
            ('grpc.max_send_message_length', 104857600),
            ('grpc.max_receive_message_length', 104857600),
        ]
    )
    channel_ready = grpc.channel_ready_future(channel)
    try:
        channel_ready.result(timeout=5)
        print("    Channel ready (HTTP/2 handshake succeeded)")
    except grpc.FutureTimeoutError:
        print("    TIMEOUT: Channel not ready after 5s — server may be overloaded or rejecting HTTP/2")

    if cue_pb2 is not None and cue_pb2_grpc is not None:
        stub = cue_pb2_grpc.CueInterfaceStub(channel)
        try:
            response = stub.GetSystemStats(cue_pb2.CueGetSystemStatsRequest(), timeout=10)
            print(f"    SUCCESS! Hosts: {response.system_stats.total_hosts},"
                  f" Running cores: {response.system_stats.total_running_cores}")
        except grpc.RpcError as e:
            print(f"    gRPC FAILED with code: {e.code()}")
            print(f"    Details: {e.details()}")
            traceback.print_exc()
        except Exception as e:
            print(f"    FAILED: {type(e).__name__}: {e}")
            traceback.print_exc()
    else:
        # Fallback: use opencue library directly but monkey-patch to expose the real error
        print("    Trying via opencue.Cuebot (will show real exception)...")
        import opencue
        opencue.Cuebot.setHosts([connect_str])
        try:
            # Force a connection attempt
            opencue.Cuebot.setChannel()
            print("    SUCCESS via opencue.Cuebot.setChannel()")
        except Exception as e:
            print(f"    FAILED: {type(e).__name__}: {e}")
            traceback.print_exc()

    channel.close()

except Exception as e:
    print(f"    ERROR: {type(e).__name__}: {e}")
    traceback.print_exc()

print()
print("[5] Checking opencue.yaml...")
import pathlib
user = os.environ.get("USERNAME", "unknown")
yaml_path = pathlib.Path(f"C:/Users/{user}/.config/opencue/opencue.yaml")
if yaml_path.exists():
    print(f"    Found: {yaml_path}")
    print(f"    Contents: {yaml_path.read_text()}")
else:
    print(f"    NOT FOUND: {yaml_path}")

print()
print("[6] HTTP_PROXY / HTTPS_PROXY environment variables...")
for var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "GRPC_PROXY"):
    val = os.environ.get(var)
    if val:
        print(f"    {var} = {val}  <-- THIS COULD BLOCK gRPC")
    else:
        print(f"    {var} = (not set)")

print()
print("=" * 55)
print("  Done.")
print("=" * 55)
print()
input("Press Enter to exit...")
