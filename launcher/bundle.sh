#!/bin/bash
set -e

APP_NAME="Queue"
BUNDLE_DIR="$APP_NAME.app"
CONTENTS_DIR="$BUNDLE_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
PROJECT_ROOT="$(dirname "$PWD")"

# Build Next.js if needed (optional - skip if already built)
if [ "$1" = "--full" ]; then
    echo "Building Next.js..."
    (cd "$PROJECT_ROOT" && npm run build)
    
    echo "Copying standalone files..."
    rm -rf app
    cp -r "$PROJECT_ROOT/.next/standalone" app
    cp -r "$PROJECT_ROOT/.next/static" app/.next/
    cp -r "$PROJECT_ROOT/public" app/
fi

# Build the executable
echo "Building executable..."
zig build -Doptimize=ReleaseFast

# Create .app bundle structure
echo "Creating app bundle..."
rm -rf "$BUNDLE_DIR"
mkdir -p "$MACOS_DIR"
mkdir -p "$RESOURCES_DIR"

# Copy executable with the app name
cp zig-out/bin/cueweb-launcher "$MACOS_DIR/$APP_NAME"

# Copy Info.plist
cp Info.plist "$CONTENTS_DIR/"

# Copy config if it exists
if [ -f "config.json" ]; then
    cp config.json "$MACOS_DIR/"
fi

# Copy icon if it exists
if [ -f "AppIcon.icns" ]; then
    cp AppIcon.icns "$RESOURCES_DIR/"
fi

echo "App bundle created: $BUNDLE_DIR"
echo "You can now double-click $BUNDLE_DIR or drag it to Applications"
