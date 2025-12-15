// macOS native window via Objective-C
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface AppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate>
@property (strong, nonatomic) NSWindow *window;
@property (strong, nonatomic) WKWebView *webView;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    // Window will be created by runWebView
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (void)windowWillClose:(NSNotification *)notification {
    [NSApp terminate:nil];
}

@end

static AppDelegate *appDelegate = nil;

void runWebView(const char *url) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        
        appDelegate = [[AppDelegate alloc] init];
        [NSApp setDelegate:appDelegate];
        
        // Create window
        NSRect frame = NSMakeRect(0, 0, 1440, 900);
        NSWindowStyleMask style = NSWindowStyleMaskTitled | 
                                  NSWindowStyleMaskClosable | 
                                  NSWindowStyleMaskMiniaturizable | 
                                  NSWindowStyleMaskResizable;
        
        NSWindow *window = [[NSWindow alloc] initWithContentRect:frame
                                                       styleMask:style
                                                         backing:NSBackingStoreBuffered
                                                           defer:NO];
        [window setTitle:@"Queue"];
        [window setDelegate:appDelegate];
        [window setReleasedWhenClosed:NO];
        
        // Enable layer-backing for smoother animations
        [[window contentView] setWantsLayer:YES];
        
        appDelegate.window = window;
        
        // Create WebView with optimized configuration
        WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
        
        // Enable hardware acceleration and better rendering
        WKPreferences *prefs = [[WKPreferences alloc] init];
        [prefs setValue:@YES forKey:@"acceleratedDrawingEnabled"];
        [prefs setValue:@YES forKey:@"developerExtrasEnabled"];
        config.preferences = prefs;
        
        // Enable GPU process for better performance
        config.suppressesIncrementalRendering = NO;
        
        WKWebView *webView = [[WKWebView alloc] initWithFrame:frame configuration:config];
        
        // Enable layer-backed rendering for smooth scrolling and animations
        [webView setWantsLayer:YES];
        webView.layer.drawsAsynchronously = YES;
        
        // Allow back-forward navigation gestures
        webView.allowsBackForwardNavigationGestures = YES;
        
        // Enable magnification (pinch to zoom)
        webView.allowsMagnification = YES;
        
        appDelegate.webView = webView;
        
        // Load URL
        NSString *urlString = [NSString stringWithUTF8String:url];
        NSURL *nsurl = [NSURL URLWithString:urlString];
        NSURLRequest *request = [NSURLRequest requestWithURL:nsurl];
        [webView loadRequest:request];
        
        // Set webview as content
        [window setContentView:webView];
        
        // Show window
        [window center];
        [window makeKeyAndOrderFront:nil];
        
        // Activate and run
        [NSApp activateIgnoringOtherApps:YES];
        [NSApp run];
    }
}
