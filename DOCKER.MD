🐳 Development Environment with Docker

To ensure all developers use a consistent environment, especially for cross-platform compilation (Rust, Node.js, Android SDK/NDK), we provide a Dockerfile.

1. Build the Docker Image

Build the container image from the Dockerfile in the project root. This process will download all system dependencies, the Rust toolchain, and the Android SDK/NDK.
Bash

docker build -t betaflight-tauri-dev .

2. Run the Development Container

Run the image and mount your local project directory into the container's /app directory. This allows you to work on your code locally while running all build commands inside the isolated Docker environment.
Bash

docker run -it --rm \
    -v $(pwd):/app \
    --name betaflight-dev-container \
    betaflight-tauri-dev

    -it: Runs the container in interactive mode with a TTY (shell access).

    --rm: Automatically removes the container when you exit.

    -v $(pwd):/app: Mounts your current directory (the project root) to the /app working directory in the container.

3. Execute Build/Dev Commands

Once inside the container's terminal, you can run any of the Tauri commands without needing to worry about local prerequisites.

Command | Purpose
--- | ---
bun install | Installs the frontend dependencies.
bun tauri dev |	Runs the desktop development server.
bun tauri android dev | Runs the app on a connected Android device or emulator (must be running outside of the container).
bun tauri android build | Builds a release APK for Android.

You may need to start an Android emulator on your host machine before running bun tauri android dev.

You can watch this video for a practical demonstration of setting up a dev container for Tauri and Android development.
https://www.youtube.com/watch?v=X3EThnruPA4
