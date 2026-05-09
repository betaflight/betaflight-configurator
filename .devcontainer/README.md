# Using Devcontainers

NOTE: Unless otherwise specified all commands below should be run from the main workspace folder of the betaflight-configurator repository.

## Why use devcontainers?

Devcontainers provide a consistent, reproducible development environment that works the same across machines.
This container includes Node.js 24.x, Rust 1.95, and all Tauri system dependencies pre-installed.

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

For serial device access (connecting to flight controllers), you need udev rules and group membership on the host.
See the [Building in Ubuntu](https://betaflight.com/docs/development/building/Building-in-Ubuntu) guide for detailed setup instructions including DFU rules, CH340/CH341 USB-to-Serial rules, and VCP permissions.

By default the devcontainer runs unprivileged. To enable USB device access for serial/DFU communication with flight controllers, either:

1. **devcontainer.json** — uncomment the `privileged` and `runArgs` lines
2. **Docker CLI** — add `--privileged --volume=/dev:/dev` flags (see below)

## Using with VS Code

Open the repository in VS Code and use the Dev Containers extension to build and run:

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and select "Dev Containers: Reopen in Container"
3. Wait for the container to build (first time takes a few minutes)

## Using with Docker CLI

```bash
# Build the container
docker build -f .devcontainer/containerfile -t bf-configurator-dev .devcontainer/

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
- **Rust 1.95** — matches `src-tauri/rust-toolchain.toml`, with Android cross-compilation targets
- **Tauri system libs** — webkit2gtk, libsoup, librsvg, openssl, udev
- **Android SDK** — platform-tools, build-tools 35, NDK 28, JDK 21
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
