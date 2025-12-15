const std = @import("std");
const builtin = @import("builtin");
const webview = @import("webview.zig");

const DEFAULT_PORT: u16 = 3000;
const DEFAULT_MODE = Mode.offline;
const DEFAULT_NODE_PATH_WIN = "./node/node.exe";
const DEFAULT_NODE_PATH_MAC = "./node/node";
const DEFAULT_SERVER_ENTRY = "./app/.next/standalone/server.js";
const DEFAULT_OPEN_BROWSER = true;
const DEFAULT_URL_PATH = "/";
const DEFAULT_LOG_FILE = "./logs/cueweb-launcher.log";
const READINESS_TIMEOUT_NS: u64 = 20 * std.time.ns_per_s;
const READINESS_POLL_NS: u64 = 250 * std.time.ns_per_ms;

const Mode = enum { offline, online };

const Config = struct {
    port: u16 = DEFAULT_PORT,
    mode: Mode = DEFAULT_MODE,
    api_base: ?[]const u8 = null,
    node_path: []const u8 = if (builtin.os.tag == .windows) DEFAULT_NODE_PATH_WIN else DEFAULT_NODE_PATH_MAC,
    server_entry: []const u8 = DEFAULT_SERVER_ENTRY,
    open_browser: bool = DEFAULT_OPEN_BROWSER,
    url_path: []const u8 = DEFAULT_URL_PATH,
    log_file: []const u8 = DEFAULT_LOG_FILE,
};

const RawConfig = struct {
    port: ?u16 = null,
    mode: ?[]const u8 = null,
    apiBase: ?[]const u8 = null,
    nodePath: ?[]const u8 = null,
    serverEntry: ?[]const u8 = null,
    openBrowser: ?bool = null,
    urlPath: ?[]const u8 = null,
    logFile: ?[]const u8 = null,
};

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const alloc = arena.allocator();

    // Change to the directory where the executable is located
    // This is needed when launched from .app bundle
    try changeToExeDir(alloc);

    const cfg = try resolveConfig(alloc);
    try validateConfig(cfg);

    // Skip file logging for now, use stderr
    const logger = Logger{ .file = std.fs.File.stderr() };

    const node_path = try resolveNodePath(cfg.node_path, alloc, &logger);
    const server_entry = cfg.server_entry;
    try ensureFileExists(server_entry, "server entry");

    try logger.logf("config: port={d} mode={s} apiBase={s} nodePath='{s}' server='{s}' openBrowser={} urlPath='{s}' logFile='{s}'", .{
        cfg.port,
        @tagName(cfg.mode),
        cfg.api_base orelse "(none)",
        node_path,
        server_entry,
        cfg.open_browser,
        cfg.url_path,
        cfg.log_file,
    });

    // Kill any existing process on the port before starting
    try killProcessOnPort(alloc, cfg.port, &logger);

    var child = std.process.Child.init(&[_][]const u8{ node_path, server_entry }, alloc);
    child.stdin_behavior = .Inherit;
    child.stdout_behavior = .Inherit;
    child.stderr_behavior = .Inherit;
    // Set working directory to the app directory so Next.js can find .next
    if (std.fs.path.dirname(server_entry)) |dir| {
        child.cwd = dir;
    }

    var env_map = try std.process.getEnvMap(alloc);
    defer env_map.deinit();
    try env_map.put("PORT", try std.fmt.allocPrint(alloc, "{}", .{cfg.port}));
    try env_map.put("NODE_ENV", "production");
    try env_map.put("CUEWEB_MODE", if (cfg.mode == .online) "online" else "offline");
    if (cfg.mode == .online) {
        // cfg.api_base validated already
        try env_map.put("CUEWEB_API_BASE", cfg.api_base.?);
    }
    child.env_map = &env_map;

    try logger.logf("spawn: {s} {s}", .{ node_path, server_entry });
    try child.spawn();

    const ready = try waitForReady(alloc, cfg.port, READINESS_TIMEOUT_NS, READINESS_POLL_NS, &logger);
    if (!ready) {
        try logger.log("server did not become ready; terminating child");
        _ = child.kill() catch {};
        _ = child.wait() catch {};
        return error.ReadinessTimeout;
    }

    if (cfg.open_browser) {
        var url_path = cfg.url_path;
        var url_path_owned = false;
        if (url_path.len == 0) {
            url_path = "/";
        } else if (url_path[0] != '/') {
            url_path = try std.fmt.allocPrint(alloc, "/{s}", .{url_path});
            url_path_owned = true;
        }

        const url = try std.fmt.allocPrint(alloc, "http://127.0.0.1:{d}{s}", .{ cfg.port, url_path });
        defer alloc.free(url);
        if (url_path_owned) alloc.free(url_path);

        try logger.logf("opening native window: {s}", .{url});

        // Run native WebView - this blocks until window is closed
        webview.run(url);

        // Window closed, terminate child process
        try logger.log("window closed; terminating server");
        _ = child.kill() catch {};
        _ = child.wait() catch {};
        return;
    }

    try logger.log("ready; awaiting server exit");
    const term_status = child.wait() catch |err| {
        try logger.logf("wait error: {any}", .{err});
        return err;
    };
    try logger.logf("server exited with status: {any}", .{term_status});
}

fn resolveConfig(alloc: std.mem.Allocator) !Config {
    var cfg = Config{};
    // defaults -> env -> config file -> CLI
    applyEnv(&cfg, alloc) catch |err| return err;
    try applyConfigFile(&cfg, alloc);
    try applyArgs(&cfg, alloc);
    return cfg;
}

fn validateConfig(cfg: Config) !void {
    if (cfg.mode == .online and cfg.api_base == null) {
        return error.MissingApiBase;
    }
}

fn applyEnv(cfg: *Config, alloc: std.mem.Allocator) !void {
    if (try envU16("CUEWEB_PORT")) |v| cfg.port = v;
    if (try envStr("CUEWEB_MODE", alloc)) |v| cfg.mode = parseMode(v) orelse cfg.mode;
    if (try envStr("CUEWEB_API_BASE", alloc)) |v| cfg.api_base = v;
    if (try envStr("CUEWEB_NODE_PATH", alloc)) |v| cfg.node_path = v;
    if (try envStr("CUEWEB_SERVER_ENTRY", alloc)) |v| cfg.server_entry = v;
    if (try envStr("CUEWEB_URL_PATH", alloc)) |v| cfg.url_path = v;
    if (try envStr("CUEWEB_LOG_FILE", alloc)) |v| cfg.log_file = v;
    if (try envStr("CUEWEB_OPEN_BROWSER", alloc)) |v| {
        if (isFalsey(v)) cfg.open_browser = false;
    }
}

fn applyConfigFile(cfg: *Config, alloc: std.mem.Allocator) !void {
    const path = "config.json";
    const file = std.fs.cwd().openFile(path, .{}) catch return;
    defer file.close();

    const data = try file.readToEndAlloc(alloc, 16 * 1024);
    defer alloc.free(data);

    var parsed = try std.json.parseFromSlice(RawConfig, alloc, data, .{});
    defer parsed.deinit();
    const rc = parsed.value;

    if (rc.port) |v| cfg.port = v;
    if (rc.mode) |v| {
        if (parseMode(v)) |m| cfg.mode = m;
    }
    if (rc.apiBase) |v| cfg.api_base = try alloc.dupe(u8, v);
    if (rc.nodePath) |v| cfg.node_path = try alloc.dupe(u8, v);
    if (rc.serverEntry) |v| cfg.server_entry = try alloc.dupe(u8, v);
    if (rc.openBrowser) |v| cfg.open_browser = v;
    if (rc.urlPath) |v| cfg.url_path = try alloc.dupe(u8, v);
    if (rc.logFile) |v| cfg.log_file = try alloc.dupe(u8, v);
}

fn applyArgs(cfg: *Config, alloc: std.mem.Allocator) !void {
    var args = std.process.args();
    _ = args.next(); // exe

    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--help")) {
            try printHelp();
            std.process.exit(0);
        } else if (std.mem.eql(u8, arg, "--port")) {
            const val = args.next() orelse return error.MissingValue;
            cfg.port = try std.fmt.parseInt(u16, val, 10);
        } else if (std.mem.eql(u8, arg, "--mode")) {
            const val = args.next() orelse return error.MissingValue;
            cfg.mode = parseMode(val) orelse return error.InvalidMode;
        } else if (std.mem.eql(u8, arg, "--api-base")) {
            const val = args.next() orelse return error.MissingValue;
            cfg.api_base = try alloc.dupe(u8, val);
        } else if (std.mem.eql(u8, arg, "--server")) {
            const val = args.next() orelse return error.MissingValue;
            cfg.server_entry = try alloc.dupe(u8, val);
        } else if (std.mem.eql(u8, arg, "--node")) {
            const val = args.next() orelse return error.MissingValue;
            cfg.node_path = try alloc.dupe(u8, val);
        } else if (std.mem.eql(u8, arg, "--url-path")) {
            const val = args.next() orelse return error.MissingValue;
            cfg.url_path = try alloc.dupe(u8, val);
        } else if (std.mem.eql(u8, arg, "--log")) {
            const val = args.next() orelse return error.MissingValue;
            cfg.log_file = try alloc.dupe(u8, val);
        } else if (std.mem.eql(u8, arg, "--no-browser")) {
            cfg.open_browser = false;
        } else {
            return error.UnknownArgument;
        }
    }
}

fn parseMode(val: []const u8) ?Mode {
    if (std.ascii.eqlIgnoreCase(val, "offline")) return .offline;
    if (std.ascii.eqlIgnoreCase(val, "online")) return .online;
    return null;
}

fn envStr(name: []const u8, alloc: std.mem.Allocator) !?[]const u8 {
    return std.process.getEnvVarOwned(alloc, name) catch |err| switch (err) {
        error.EnvironmentVariableNotFound => null,
        else => err,
    };
}

fn envU16(name: []const u8) !?u16 {
    const tmp = std.process.getEnvVarOwned(std.heap.page_allocator, name) catch |err| switch (err) {
        error.EnvironmentVariableNotFound => return null,
        else => return err,
    };
    defer std.heap.page_allocator.free(tmp);
    return std.fmt.parseInt(u16, tmp, 10) catch null;
}

fn isFalsey(val: []const u8) bool {
    return std.ascii.eqlIgnoreCase(val, "false") or std.ascii.eqlIgnoreCase(val, "0") or std.ascii.eqlIgnoreCase(val, "no");
}

fn ensureLogDir(log_path: []const u8) !void {
    if (std.fs.path.dirname(log_path)) |dir| {
        try std.fs.cwd().makePath(dir);
    }
}

fn openLog(path: []const u8) !std.fs.File {
    // Just create/truncate the log file for simplicity
    return try std.fs.cwd().createFile(path, .{});
}

const Logger = struct {
    file: std.fs.File,

    fn log(self: *const Logger, msg: []const u8) !void {
        const ts = timestamp();
        var buf: [2048]u8 = undefined;
        const line = try std.fmt.bufPrint(&buf, "[{s}] {s}\n", .{ ts, msg });
        _ = try self.file.write(line);
        std.debug.print("{s}", .{line});
    }

    fn logf(self: *const Logger, comptime fmt: []const u8, args: anytype) !void {
        var buf: [1024]u8 = undefined;
        const len = try std.fmt.bufPrint(&buf, fmt, args);
        try self.log(len);
    }
};

fn timestamp() []const u8 {
    const now = std.time.timestamp();
    const epoch_secs = std.time.epoch.EpochSeconds{ .secs = @as(u64, @intCast(now)) };
    const day_secs = epoch_secs.getDaySeconds();
    const epoch_day = epoch_secs.getEpochDay();
    const year_day = epoch_day.calculateYearDay();
    const month_day = year_day.calculateMonthDay();
    const slice = std.fmt.bufPrint(&TS_BUFFER, "{d:0>4}-{d:0>2}-{d:0>2} {d:0>2}:{d:0>2}:{d:0>2}", .{
        year_day.year,
        @intFromEnum(month_day.month),
        month_day.day_index + 1,
        day_secs.getHoursIntoDay(),
        day_secs.getMinutesIntoHour(),
        day_secs.getSecondsIntoMinute(),
    }) catch "0000-00-00 00:00:00";
    return slice;
}

var TS_BUFFER: [32]u8 = undefined;

fn resolveNodePath(preferred: []const u8, alloc: std.mem.Allocator, logger: *const Logger) ![]const u8 {
    if (fileExists(preferred)) return preferred;

    if (try findInPath("node", alloc)) |found| {
        try logger.logf("node not found at '{s}', using PATH node at '{s}'", .{ preferred, found });
        return found;
    }

    return error.NodeNotFound;
}

fn ensureFileExists(path: []const u8, label: []const u8) !void {
    std.fs.cwd().access(path, .{}) catch {
        std.debug.print("{s} not found at {s}\n", .{ label, path });
        return error.FileNotFound;
    };
}

fn fileExists(path: []const u8) bool {
    std.fs.cwd().access(path, .{}) catch return false;
    return true;
}

fn findInPath(name: []const u8, alloc: std.mem.Allocator) !?[]const u8 {
    const path_env = std.process.getEnvVarOwned(alloc, "PATH") catch |err| switch (err) {
        error.EnvironmentVariableNotFound => return null,
        else => return err,
    };
    defer alloc.free(path_env);

    var it = std.mem.splitScalar(u8, path_env, std.fs.path.delimiter);
    while (it.next()) |dir| {
        const full = try std.fs.path.join(alloc, &[_][]const u8{ dir, name });
        if (std.fs.cwd().access(full, .{})) |_| {
            return full;
        } else |_| {
            alloc.free(full);
            continue;
        }
    }
    return null;
}

fn waitForReady(alloc: std.mem.Allocator, port: u16, timeout_ns: u64, interval_ns: u64, logger: *const Logger) !bool {
    var client = std.http.Client{ .allocator = alloc };
    defer client.deinit();

    const start = std.time.nanoTimestamp();
    while (true) {
        const now = std.time.nanoTimestamp();
        if (now - start > timeout_ns) return false;

        const url = try std.fmt.allocPrint(alloc, "http://127.0.0.1:{d}/", .{port});
        defer alloc.free(url);

        const result = client.fetch(.{ .location = .{ .url = url } }) catch null;
        if (result) |r| {
            if (r.status == .ok or r.status == .found or r.status == .moved_permanently) {
                try logger.log("server is ready");
                return true;
            }
        }
        std.Thread.sleep(interval_ns);
        _ = logger.log("waiting for server...") catch {};
    }
}

fn killProcessOnPort(alloc: std.mem.Allocator, port: u16, logger: *const Logger) !void {
    switch (builtin.os.tag) {
        .macos, .linux => {
            // Use lsof to find process on port, then kill it
            const port_str = try std.fmt.allocPrint(alloc, ":{d}", .{port});
            defer alloc.free(port_str);

            var lsof = std.process.Child.init(&[_][]const u8{ "lsof", "-ti", port_str }, alloc);
            lsof.stdin_behavior = .Ignore;
            lsof.stdout_behavior = .Pipe;
            lsof.stderr_behavior = .Ignore;
            try lsof.spawn();

            const stdout = lsof.stdout.?;
            var buf: [256]u8 = undefined;
            const n = stdout.read(&buf) catch 0;
            _ = lsof.wait() catch {};

            if (n > 0) {
                // Parse PIDs (one per line) and kill them
                var lines = std.mem.splitScalar(u8, buf[0..n], '\n');
                while (lines.next()) |line| {
                    const trimmed = std.mem.trim(u8, line, " \t\r\n");
                    if (trimmed.len == 0) continue;

                    const pid = std.fmt.parseInt(i32, trimmed, 10) catch continue;
                    try logger.logf("killing existing process {d} on port {d}", .{ pid, port });

                    var kill = std.process.Child.init(&[_][]const u8{ "kill", "-9", trimmed }, alloc);
                    kill.stdin_behavior = .Ignore;
                    kill.stdout_behavior = .Ignore;
                    kill.stderr_behavior = .Ignore;
                    try kill.spawn();
                    _ = kill.wait() catch {};
                }
                // Give the OS a moment to release the port
                std.Thread.sleep(500 * std.time.ns_per_ms);
            }
        },
        .windows => {
            // Use netstat and taskkill on Windows
            const port_str = try std.fmt.allocPrint(alloc, "{d}", .{port});
            defer alloc.free(port_str);

            // Find PID using netstat
            var netstat = std.process.Child.init(&[_][]const u8{ "cmd", "/c", "netstat -ano | findstr", port_str }, alloc);
            netstat.stdin_behavior = .Ignore;
            netstat.stdout_behavior = .Pipe;
            netstat.stderr_behavior = .Ignore;
            try netstat.spawn();

            const stdout = netstat.stdout.?;
            var buf: [1024]u8 = undefined;
            const n = stdout.read(&buf) catch 0;
            _ = netstat.wait() catch {};

            if (n > 0) {
                // Parse output to find PID (last column)
                var lines = std.mem.splitScalar(u8, buf[0..n], '\n');
                while (lines.next()) |line| {
                    const trimmed = std.mem.trim(u8, line, " \t\r\n");
                    if (trimmed.len == 0) continue;

                    // Get last token (PID)
                    var tokens = std.mem.tokenizeScalar(u8, trimmed, ' ');
                    var last: ?[]const u8 = null;
                    while (tokens.next()) |tok| {
                        last = tok;
                    }
                    if (last) |pid_str| {
                        const pid = std.fmt.parseInt(i32, pid_str, 10) catch continue;
                        try logger.logf("killing existing process {d} on port {d}", .{ pid, port });

                        var taskkill = std.process.Child.init(&[_][]const u8{ "taskkill", "/F", "/PID", pid_str }, alloc);
                        taskkill.stdin_behavior = .Ignore;
                        taskkill.stdout_behavior = .Ignore;
                        taskkill.stderr_behavior = .Ignore;
                        try taskkill.spawn();
                        _ = taskkill.wait() catch {};
                    }
                }
                std.Thread.sleep(500 * std.time.ns_per_ms);
            }
        },
        else => {
            try logger.log("port cleanup not implemented for this platform");
        },
    }
}

fn openBrowser(url: []const u8, alloc: std.mem.Allocator, logger: *const Logger) !void {
    switch (builtin.os.tag) {
        .windows => {
            var child = std.process.Child.init(&[_][]const u8{ "cmd", "/c", "start", "", url }, alloc);
            child.stdin_behavior = .Ignore;
            child.stdout_behavior = .Inherit;
            child.stderr_behavior = .Inherit;
            try child.spawn();
            _ = child.wait() catch {};
        },
        .macos => {
            var child = std.process.Child.init(&[_][]const u8{ "open", url }, alloc);
            child.stdin_behavior = .Ignore;
            child.stdout_behavior = .Inherit;
            child.stderr_behavior = .Inherit;
            try child.spawn();
            _ = child.wait() catch {};
        },
        else => {
            try logger.log("open browser not implemented for this platform");
        },
    }
}

fn changeToExeDir(alloc: std.mem.Allocator) !void {
    const exe_path = try std.fs.selfExePathAlloc(alloc);
    defer alloc.free(exe_path);

    if (std.fs.path.dirname(exe_path)) |dir| {
        var dir_handle = try std.fs.openDirAbsolute(dir, .{});
        defer dir_handle.close();
        try dir_handle.setAsCwd();
    }
}

fn printHelp() !void {
    std.debug.print(
        "cueweb-launcher options:\n" ++
            "  --port <num>          Port to listen on (default 3000)\n" ++
            "  --mode offline|online  Backend mode (default offline)\n" ++
            "  --api-base <url>      Required in online mode\n" ++
            "  --server <path>       Server entry (default ./app/.next/standalone/server.js)\n" ++
            "  --node <path>         Node binary path (default ./node/node(.exe) or PATH fallback)\n" ++
            "  --url-path <path>     Path to open after ready (default /)\n" ++
            "  --log <path>          Log file path (default ./logs/cueweb-launcher.log)\n" ++
            "  --no-browser          Do not open a browser\n" ++
            "  --help                Show this help\n",
        .{},
    );
}
