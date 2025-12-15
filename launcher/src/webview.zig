// Zig wrapper for Objective-C WebView
const std = @import("std");

// Import from C/Objective-C
extern fn runWebView(url: [*:0]const u8) void;

pub fn run(url: []const u8) void {
    // Convert to null-terminated string
    var buf: [512]u8 = undefined;
    @memcpy(buf[0..url.len], url);
    buf[url.len] = 0;
    runWebView(buf[0..url.len :0]);
}
