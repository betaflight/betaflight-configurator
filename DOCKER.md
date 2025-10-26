# Docker: Dev/Build Environment for Betaflight Configurator (Tauri)

This document explains how to build and run a containerized environment for web, desktop (Tauri), and Android builds using the `DockerFile` in this folder.

Note: The Dockerfile has not been fully validated end-to-end yet. Treat this as a starting point; please report gaps and update after the first successful build.

## Prerequisites: Install Docker

- Linux (Ubuntu/Debian):
  - Follow the official guide: https://docs.docker.com/engine/install/
  - After install, add your user to the docker group so you can run without sudo, then re-login:
    - `sudo usermod -aG docker "$USER" && newgrp docker`
- macOS:
  - Install Docker Desktop: https://docs.docker.com/desktop/setup/mac/
- Windows 10/11:
  - Install Docker Desktop (WSL 2 backend strongly recommended): https://docs.docker.com/desktop/setup/windows/

Verify installation:

```bash
docker --version
docker info
```

## What’s in the image

Base: Debian 12 (bookworm-slim)

The Dockerfile installs:

- Toolchains
  - Rust (stable via rustup) + Android Rust targets: aarch64, armv7, i686, x86_64
  - OpenJDK 17 (for Android builds)
  - Node.js 22 (via NodeSource) + Yarn 1.x (1.22.22)
  - System deps for Tauri (GTK/WebKit etc.): `libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev`
  - Build essentials: `clang llvm g++-multilib build-essential git` and more
- Android SDK components
  - Command line tools (latest)
  - Platform tools
  - Android platform 34
  - Build tools 34.0.0
  - NDK 26.3.11579204
- Environment
  - ANDROID_SDK_ROOT=/usr/local/android-sdk
  - NDK_HOME=/usr/local/android-sdk/ndk/26.3.11579204
  - PATH includes Android cmdline-tools, Cargo, etc.
- Non-root user
  - `developer` user, working directory `/app`, entrypoint `/bin/bash`

## Build the image

Run from the repository root so the Docker context includes all needed files:

```bash
docker build -t bf-configurator:dev -f tauri/betaflight-configurator/DockerFile .
```

Optional: cache SDK and toolchains across runs using named volumes (recommended):

```bash
docker volume create android-sdk

docker build -t bf-configurator:dev -f tauri/betaflight-configurator/DockerFile .
```

## Start a dev shell in the container

Mount the repo and (optionally) caches. This drops you into `/app` as the `developer` user.

```bash
docker run --rm -it \
  -v "$PWD":/app \
  -v android-sdk:/usr/local/android-sdk \
  bf-configurator:dev
```

If you plan to build repeatedly, you can also persist Rust and Cargo caches:

```bash
docker volume create rustup-cache

docker volume create cargo-cache

docker run --rm -it \
  -v "$PWD":/app \
  -v android-sdk:/usr/local/android-sdk \
  -v rustup-cache:/usr/local/rustup \
  -v cargo-cache:/usr/local/cargo \
  bf-configurator:dev
```

## Project layout in the container

- Repo is mounted at `/app`
- Project folder for Tauri: `/app/tauri/betaflight-configurator`

Change into it before running yarn/tauri commands:

```bash
cd /app/tauri/betaflight-configurator
```

## Web build (Vite)

```bash
yarn install
# Development server (not exposed unless you map ports)
yarn dev
# Production build
yarn build
```

To access the dev server from host, run the container with port mapping, e.g. `-p 5173:5173`, and include `--host 0.0.0.0` when starting the dev server.

## Desktop (Tauri) build

```bash
yarn install
# Build the web assets first
yarn build
# Build the Tauri app (Linux artifacts inside src-tauri/target)
yarn tauri:build
```

Notes:
- The image includes WebKit/GTK dependencies commonly required by Tauri on Linux.
- If additional runtime libraries are needed by your distro, adjust the Dockerfile accordingly.

## Android build (Capacitor + Tauri Android CLI)

Environment variables are already prepared (ANDROID_SDK_ROOT, NDK_HOME). Typical flows:

Build release APK/AAB (without launching emulator):

```bash
yarn install
yarn build
# Sync/android build via Capacitor (release)
yarn android:release
# or build via Tauri Android
# This uses tauri-cli scripts and expects Android SDK/NDK already in place
yarn tauri:build:android
```

Running an Android emulator inside a container is possible but not recommended (GPU, X11/Wayland, KVM). Prefer using an emulator or device on the host, then use ADB over TCP/IP or USB passthrough.

### Using ADB with a USB device (optional, Linux only)

```bash
docker run --rm -it \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v "$PWD":/app \
  -v android-sdk:/usr/local/android-sdk \
  bf-configurator:dev

# inside the container
$ANDROID_SDK_ROOT/platform-tools/adb devices
```

Alternatively, expose ADB over TCP/IP from the host/emulator and connect from inside the container.

## Gradle 9 — do we need to install it?

- This project uses the Gradle Wrapper located under `android/gradle/wrapper/gradle-wrapper.properties`.
- Current wrapper version: `gradle-8.10.2` (as pinned by `distributionUrl`).
- The Docker image does not install a global Gradle; you don’t need it. The wrapper will download the correct Gradle version automatically.

If you specifically want Gradle 9:

- Update the wrapper to a Gradle 9.x distribution (only if your Android Gradle Plugin and build are compatible):

```bash
# inside the container or on your host (JDK 17+)
cd tauri/betaflight-configurator/android
./gradlew wrapper --gradle-version 9.0 --distribution-type all
# commit the updated gradle/wrapper files
```

- Then rebuild. If issues arise, revert to the pinned version or update AGP accordingly.

Recommendation: keep using the wrapper as-is (8.10.2) unless you have a specific need and have validated plugin compatibility.

## Common pitfalls and tips

- Node version: The image uses Node 22; `package.json` engines specify Node 20.x. This may produce warnings. If you hit issues, switch the Dockerfile to Node 20.x or set Yarn to ignore engines:

```bash
yarn config set ignore-engines true
```

- Caching: Use the named volumes above to avoid re-downloading SDKs and toolchains every run.
- Permissions: Files created by the `developer` user inside the container will be owned by your host user if your UID/GID differs. Adjust with `--user` if needed.
- Not tested yet: Treat this as a baseline. Please update this doc after first successful Android and desktop builds.

## Quick start recap

```bash
# 1) Build image from repo root
docker build -t bf-configurator:dev -f tauri/betaflight-configurator/DockerFile .

# 2) Start a shell with caches and repo mounted
docker run --rm -it -v "$PWD":/app -v android-sdk:/usr/local/android-sdk bf-configurator:dev

# 3) Inside the container
cd /app/tauri/betaflight-configurator
yarn install
yarn build          # web assets
yarn tauri:build    # desktop app
# or
yarn tauri:build:android  # Android build
```
