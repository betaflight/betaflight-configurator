#!/bin/bash
# Script to patch app/build.gradle.kts with USB serial dependencies and repositories
# This should be run after 'cargo tauri android init' or 'cargo tauri android build'

set -e

APP_BUILD_GRADLE="src-tauri/gen/android/app/build.gradle.kts"
echo "Ensuring usb-serial-for-android dependency and repositories in app/build.gradle.kts..."

if [ -f "$APP_BUILD_GRADLE" ]; then
    # Add repositories block to app/build.gradle.kts if missing
    if ! grep -q "^repositories {" "$APP_BUILD_GRADLE"; then
        echo "Adding repositories block to app/build.gradle.kts..."
        # Insert repositories block after plugins block
        awk '
            /^plugins \{/ {
                print $0
                in_plugins=1
                next
            }
            in_plugins && /^\}/ {
                print $0
                print ""
                print "repositories {"
                print "    maven { url = uri(\"https://jitpack.io\") }"
                print "}"
                in_plugins=0
                next
            }
            { print }
        ' "$APP_BUILD_GRADLE" > "$APP_BUILD_GRADLE.tmp" && mv "$APP_BUILD_GRADLE.tmp" "$APP_BUILD_GRADLE"
    else
        # Check if jitpack.io is already in repositories
        if ! grep -A 10 "^repositories {" "$APP_BUILD_GRADLE" | grep -q "jitpack.io"; then
            echo "Adding jitpack.io repository to existing repositories block..."
            # Insert jitpack.io repository into existing repositories block
            awk '
                /^repositories \{/ {
                    print $0
                    print "    maven { url = uri(\"https://jitpack.io\") }"
                    found=1
                    next
                }
                { print }
            ' "$APP_BUILD_GRADLE" > "$APP_BUILD_GRADLE.tmp" && mv "$APP_BUILD_GRADLE.tmp" "$APP_BUILD_GRADLE"
        fi
    fi

    if ! grep -q "usb-serial-for-android" "$APP_BUILD_GRADLE"; then
        echo "Adding usb-serial-for-android dependency to app module..."
        # Find the dependencies block and add the dependency
        if grep -q "^dependencies {" "$APP_BUILD_GRADLE"; then
            # Insert after the opening dependencies { line
            sed -i '/^dependencies {/a\
    implementation("com.github.mik3y:usb-serial-for-android:3.8.0")
' "$APP_BUILD_GRADLE"
        else
            # Create dependencies block if it doesn't exist
            echo "Creating dependencies block with usb-serial-for-android..."
            cat >> "$APP_BUILD_GRADLE" << 'EOF'

dependencies {
    implementation("com.github.mik3y:usb-serial-for-android:3.8.0")
}
EOF
        fi
    else
        echo "usb-serial-for-android dependency already present in app module"
    fi
else
    echo "Warning: app/build.gradle.kts not found, cannot add usb-serial-for-android dependency"
fi

echo "✓ App Gradle dependencies and repositories configured successfully!"