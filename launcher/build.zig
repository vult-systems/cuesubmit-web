const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const root_mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });

    const exe = b.addExecutable(.{
        .name = "cueweb-launcher",
        .root_module = root_mod,
    });

    // Link macOS frameworks and compile Objective-C for native WebView
    if (target.result.os.tag == .macos) {
        exe.addCSourceFile(.{
            .file = b.path("src/webview.m"),
            .flags = &.{"-fobjc-arc"},
        });
        exe.linkFramework("Cocoa");
        exe.linkFramework("WebKit");
    }

    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }

    b.step("run", "Run the launcher").dependOn(&run_cmd.step);
}
