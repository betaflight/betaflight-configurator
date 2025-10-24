#!/bin/bash

# Android SDK and NDK environment setup script for Tauri Android development

# Set Android SDK path (adjust if your SDK is in a different location)
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

# Find the NDK version automatically (uses the first one found)
if [[ -d "$ANDROID_HOME/ndk" ]]; then
    NDK_VERSION=$(ls -1 "$ANDROID_HOME/ndk" | head -n 1)
    if [[ -n "$NDK_VERSION" ]]; then
        export NDK_HOME="$ANDROID_HOME/ndk/$NDK_VERSION"
        echo "Found NDK version: $NDK_VERSION"
    else
        echo "Warning: No NDK version found in $ANDROID_HOME/ndk"
        echo "Please install NDK from Android Studio SDK Manager"
    fi
else
    echo "Warning: NDK directory not found at $ANDROID_HOME/ndk"
    echo "Please install NDK from Android Studio SDK Manager"
fi

# Add Android tools to PATH
export PATH="$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools"
if [[ -n "$NDK_HOME" ]]; then
    export PATH="$PATH:$NDK_HOME"
fi

# Verify the setup
echo ""
echo "Android environment variables set:"
echo "ANDROID_HOME=$ANDROID_HOME"
echo "ANDROID_SDK_ROOT=$ANDROID_SDK_ROOT"
echo "NDK_HOME=$NDK_HOME"
echo ""

# Check if SDK exists
if [[ ! -d "$ANDROID_HOME" ]]; then
    echo "ERROR: Android SDK not found at $ANDROID_HOME" >&2
    echo "Please install Android SDK or update the ANDROID_HOME path in this script" >&2
    return 1 2>/dev/null || exit 1
fi

echo "Setup complete! You can now run: yarn tauri:dev:android"
