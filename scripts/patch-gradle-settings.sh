#!/bin/bash
# Script to patch settings.gradle.kts with required repositories
# This should be run after 'cargo tauri android init' or 'cargo tauri android build'

set -e

SETTINGS_GRADLE="src-tauri/gen/android/settings.gradle.kts"
echo "Ensuring required repositories in settings.gradle.kts..."

if [ ! -f "$SETTINGS_GRADLE" ]; then
    echo "Creating settings.gradle.kts with required repository blocks..."
    cat > "$SETTINGS_GRADLE" << 'EOF'
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
}

pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
}
EOF
else
    echo "Patching existing settings.gradle.kts..."

    # Add dependencyResolutionManagement repositories if missing
    if ! grep -q "dependencyResolutionManagement" "$SETTINGS_GRADLE"; then
        echo "Adding dependencyResolutionManagement block..."
        cat >> "$SETTINGS_GRADLE" << 'EOF'

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
}
EOF
    else
        # Check and add missing repositories in dependencyResolutionManagement
        if ! grep -A 10 "dependencyResolutionManagement" "$SETTINGS_GRADLE" | grep -q "google()"; then
            sed -i '/dependencyResolutionManagement {/,/}/ { /repositories {/a\
        google()
}' "$SETTINGS_GRADLE"
        fi
        if ! grep -A 10 "dependencyResolutionManagement" "$SETTINGS_GRADLE" | grep -q "mavenCentral()"; then
            sed -i '/dependencyResolutionManagement {/,/}/ { /repositories {/a\
        mavenCentral()
}' "$SETTINGS_GRADLE"
        fi
        if ! grep -A 10 "dependencyResolutionManagement" "$SETTINGS_GRADLE" | grep -q "jitpack.io"; then
            sed -i '/dependencyResolutionManagement {/,/}/ { /repositories {/a\
        maven { url = uri("https://jitpack.io") }
}' "$SETTINGS_GRADLE"
        fi
    fi

    # Add pluginManagement repositories if missing
    if ! grep -q "pluginManagement" "$SETTINGS_GRADLE"; then
        echo "Adding pluginManagement block..."
        cat >> "$SETTINGS_GRADLE" << 'EOF'

pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
}
EOF
    else
        # Check and add missing repositories in pluginManagement
        if ! grep -A 10 "pluginManagement" "$SETTINGS_GRADLE" | grep -q "gradlePluginPortal()"; then
            # Using awk for portability across macOS and Linux
            awk '
                /pluginManagement \{/,/\}/ {
                    if ($0 ~ /repositories \{/ && !found) {
                        print $0
                        print "        gradlePluginPortal()"
                        found=1
                        next
                    }
                }
                { print }
            ' "$SETTINGS_GRADLE" > "$SETTINGS_GRADLE.tmp" && mv "$SETTINGS_GRADLE.tmp" "$SETTINGS_GRADLE"
        fi
        if ! grep -A 10 "pluginManagement" "$SETTINGS_GRADLE" | grep -q "google()"; then
            # Using awk for portability across macOS and Linux
            awk '
                /pluginManagement \{/,/\}/ {
                    if ($0 ~ /repositories \{/ && !found) {
                        print $0
                        print "        google()"
                        found=1
                        next
                    }
                }
                { print }
            ' "$SETTINGS_GRADLE" > "$SETTINGS_GRADLE.tmp" && mv "$SETTINGS_GRADLE.tmp" "$SETTINGS_GRADLE"
        fi
        if ! grep -A 10 "pluginManagement" "$SETTINGS_GRADLE" | grep -q "mavenCentral()"; then
            # Using awk for portability across macOS and Linux
            awk '
                /pluginManagement \{/,/\}/ {
                    if ($0 ~ /repositories \{/ && !found) {
                        print $0
                        print "        mavenCentral()"
                        found=1
                        next
                    }
                }
                { print }
            ' "$SETTINGS_GRADLE" > "$SETTINGS_GRADLE.tmp" && mv "$SETTINGS_GRADLE.tmp" "$SETTINGS_GRADLE"
        fi
        if ! grep -A 10 "pluginManagement" "$SETTINGS_GRADLE" | grep -q "jitpack.io"; then
            # Using awk for portability across macOS and Linux
            awk '
                /pluginManagement \{/,/\}/ {
                    if ($0 ~ /repositories \{/ && !found) {
                        print $0
                        print "        maven { url = uri(\"https://jitpack.io\") }"
                        found=1
                        next
                    }
                }
                { print }
            ' "$SETTINGS_GRADLE" > "$SETTINGS_GRADLE.tmp" && mv "$SETTINGS_GRADLE.tmp" "$SETTINGS_GRADLE"
        fi
    fi
fi

echo "✓ Gradle settings repositories configured successfully!"