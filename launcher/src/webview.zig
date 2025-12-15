// Cross-platform WebView wrapper
const std = @import("std");
const builtin = @import("builtin");

// Import from C/Objective-C (macOS only)
extern fn runWebView(url: [*:0]const u8) void;

pub fn run(url: []const u8) void {
    if (builtin.os.tag == .macos) {
        // macOS: use native WebKit WebView
        var buf: [512]u8 = undefined;
        @memcpy(buf[0..url.len], url);
        buf[url.len] = 0;
        runWebView(buf[0..url.len :0]);
    } else if (builtin.os.tag == .windows) {
        // Windows: open in default browser
        openBrowserWindows(url);
        // Note: On Windows, we just open the browser and return immediately.
        // The main.zig will wait for the Node server to exit.
        // For a proper "press Enter to quit" experience, we'd need console input.
        std.debug.print("\n[CueWeb] Browser opened at {s}\n", .{url});
        std.debug.print("[CueWeb] Server running. Close this window or press Ctrl+C to stop.\n", .{});
        // Block forever - the parent process will handle termination
        while (true) {
            std.Thread.sleep(std.time.ns_per_s);
        }
    } else {
        std.debug.print("WebView not supported on this platform\n", .{});
    }
}

fn openBrowserWindows(url: []const u8) void {
    // Use cmd /c start to open default browser
    var child = std.process.Child.init(
        &[_][]const u8{ "cmd", "/c", "start", "", url },
        std.heap.page_allocator,
    );
    child.stdin_behavior = .Ignore;
    child.stdout_behavior = .Ignore;
    child.stderr_behavior = .Ignore;
    child.spawn() catch |err| {
        std.debug.print("Failed to open browser: {}\n", .{err});
        return;
    };
    _ = child.wait() catch {};
}
