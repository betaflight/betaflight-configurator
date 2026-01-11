# WebAuthn Development Setup

This guide will help you set up your development environment to test WebAuthn (passkey) authentication features in the Betaflight App.

## Prerequisites

WebAuthn requires a secure context (HTTPS) to function. For local development, we use `local.betaflight.com` with a trusted self-signed certificate.

**Note:** The development server automatically detects whether certificates are present and configures itself accordingly:
- **With certificates:** Runs on `https://local.betaflight.com:8443`
- **Without certificates:** Runs on `http://localhost:8080` (WebAuthn features disabled)

## Setup Steps

### 1. Install mkcert

mkcert is a tool for creating locally-trusted development certificates.

#### Windows

```powershell
# Using Chocolatey
choco install mkcert

# Or download from: https://github.com/FiloSottile/mkcert/releases
```

#### macOS

```bash
brew install mkcert
```

#### Linux

```bash
# Ubuntu 24.04 and later
sudo apt install mkcert

# Older Ubuntu/Debian versions
sudo apt install libnss3-tools
wget -O mkcert https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v*-linux-amd64
chmod +x mkcert
sudo mv mkcert /usr/local/bin/
```

### 2. Install the Local CA

After installing mkcert, install the local Certificate Authority:

```bash
mkcert -install
```

This will create and install a local CA in your system trust store. You may need to restart your browser after this step.

### 3. Add local.betaflight.com to Hosts File

You need to map `local.betaflight.com` to localhost in your system's hosts file.

#### Windows

1. Open Notepad as Administrator
2. Open the file: `C:\Windows\System32\drivers\etc\hosts`
3. Add the following line:
   ```
   127.0.0.1    local.betaflight.com
   ```
4. Save the file

#### macOS / Linux

```bash
sudo nano /etc/hosts
```

Add the following line:
```
127.0.0.1    local.betaflight.com
```

Save and exit (Ctrl+X, then Y, then Enter in nano).

### 4. Generate SSL Certificates

In the root directory of betaflight-configurator, generate certificates for local.betaflight.com:

```bash
mkcert local.betaflight.com localhost
```

This will create two files:
- `local.betaflight.com.pem` (certificate)
- `local.betaflight.com-key.pem` (private key)

**Important:** The certificate filenames must match exactly as the development server looks for these specific files.

### 5. Start Development Server

Start your development server as usual:

```bash
yarn dev
```

The development server will automatically detect the certificates and configure itself:
- If certificates are found: `https://local.betaflight.com:8443` (WebAuthn enabled)
- If certificates are missing: `http://localhost:8080` (WebAuthn disabled)

## Verification

1. Open your browser and navigate to `https://local.betaflight.com:8443`
2. You should NOT see any certificate warnings
3. The browser's address bar should show a secure lock icon
4. WebAuthn features (passkey creation/authentication) should now work

## Troubleshooting

### Certificate Not Trusted

- Make sure you ran `mkcert -install` before generating certificates
- Restart your browser after installing the CA
- On Windows, you may need to restart your computer

### DNS Not Resolving

- Verify the hosts file entry is correct (no typos)
- Try flushing DNS cache:
  - Windows: `ipconfig /flushdns`
  - macOS: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
  - Linux: `sudo systemctl restart systemd-resolved`

### Port Already in Use

If port 8443 is already in use, you will need to adjust the existing service, as the port number is part of the fully qualified origins for webauthn processing and cannot be changed.

### Development Server Starts on HTTP Instead of HTTPS

If the server starts on `http://localhost:8080` instead of HTTPS:
- Verify the certificate files exist in the project root
- Ensure filenames match exactly: `local.betaflight.com.pem` and `local.betaflight.com-key.pem`
- Check the console output when starting the server - it will indicate which mode it's using

### Browser Privacy/Incognito Mode

WebAuthn may not work properly in private/incognito browsing modes on some browsers.

## Security Notes

- **NEVER** commit the generated `.pem` files to version control
- Add `*.pem` to your `.gitignore` file
- These certificates are only for local development
- The mkcert root CA should never be shared or used in production

## Additional Resources

- [mkcert GitHub Repository](https://github.com/FiloSottile/mkcert)
- [WebAuthn Guide](https://webauthn.guide/)
- [MDN Web Authentication API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API)
