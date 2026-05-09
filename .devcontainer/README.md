# Using Devcontainers

NOTE: Unless otherwise specified all commands below should be run from the main workspace folder of the betaflight-configurator repository.

## Why use devcontainers?

Devcontainers provide a consistent, reproducible development environment that works the same across machines.
This container includes Node.js 24.x, Rust 1.85, and all Tauri system dependencies pre-installed.

## Prerequisites

Install Docker or Podman on your host machine.

### Docker

Follow the [official installation guide](https://docs.docker.com/engine/install/).
After installation add your user to the `docker` group:

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect
docker run docker.io/library/hello-world
```

### USB device access

For serial device access (connecting to flight controllers), define udev rules on the host:

```bash
sudo tee /etc/udev/rules.d/46-stdfu-permissions.rules <<EOF
# DFU (Internal bootloader for STM32, GD32, AT32, APM32 and RP2040 MCUs)

ACTION=="add", SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="df11", MODE="0664", GROUP="plugdev" # STM32
ACTION=="add", SUBSYSTEM=="usb", ATTRS{idVendor}=="28e9", ATTRS{idProduct}=="0189", MODE="0664", GROUP="plugdev" # GD32
ACTION=="add", SUBSYSTEM=="usb", ATTRS{idVendor}=="2e3c", ATTRS{idProduct}=="df11", MODE="0664", GROUP="plugdev" # AT32
ACTION=="add", SUBSYSTEM=="usb", ATTRS{idVendor}=="2e8a", ATTRS{idProduct}=="000f", MODE="0664", GROUP="plugdev" # RP2040
ACTION=="add", SUBSYSTEM=="usb", ATTRS{idVendor}=="314b", ATTRS{idProduct}=="0106", MODE="0664", GROUP="plugdev" # APM32

# WCH CH340/CH341 USB-to-Serial

ACTION=="add", SUBSYSTEM=="usb", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="5523", MODE="0664", GROUP="plugdev" # CH341
ACTION=="add", SUBSYSTEM=="usb", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7522", MODE="0664", GROUP="plugdev" # CH340 (variant)
ACTION=="add", SUBSYSTEM=="usb", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", MODE="0664", GROUP="plugdev" # CH340
ACTION=="add", SUBSYSTEM=="usb", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7584", MODE="0664", GROUP="plugdev" # CH340S

# STM32 VCP (Virtual COM Port)

SUBSYSTEM=="tty", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="5740", MODE="0666", TAG+="uaccess"
EOF

sudo udevadm control --reload-rules
```

The container is started with `--volume=/dev:/dev` and `--privileged` to pass through USB devices.

## Using with VS Code

Open the repository in VS Code and use the Dev Containers extension to build and run:

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Open the command palette (`Ctrl+Shift+P`) and select "Dev Containers: Reopen in Container"
3. Wait for the container to build (first time takes a few minutes)

## Using with Docker CLI

```bash
# Build the container
docker build -t bf-configurator-dev .devcontainer/

# Run interactively with USB access
docker run -it --rm \
  --privileged \
  --volume=/dev:/dev \
  -v "$(pwd)":/workspace \
  -p 8080:8080 \
  bf-configurator-dev

# Inside the container
npm install
npm run dev       # Vite dev server on :8080
npm run test      # Run tests
npm run lint      # Lint check
npm run tauri:dev # Desktop app (requires display)
```

## What's included

- **Node.js 24.x** — matches `.nvmrc`
- **Rust 1.85** — matches `src-tauri/rust-toolchain.toml`, with Android cross-compilation targets
- **Tauri system libs** — webkit2gtk, libsoup, librsvg, openssl, udev
- **Android SDK** — platform-tools, build-tools 35, NDK 28, JDK 17
- **USB passthrough** — serial device access for flight controller communication

## Build targets

### Web (PWA)

```bash
npm run dev       # Dev server on :8080
npm run build     # Production build
```

### Desktop (Tauri)

```bash
npm run tauri:dev    # Desktop app with hot reload
npm run tauri:build  # Release build
```

### Android (Capacitor)

```bash
npm run android:dev      # Build + run on connected device/emulator
npm run android:open     # Open in Android Studio
npm run android:sync     # Sync web assets to Android project
npm run android:release  # Release build
```

### Testing

```bash
npm run test      # Vitest (includes lint)
npm run lint      # ESLint only
npm run format    # Prettier
npm run storybook # Component docs on :6006
```
