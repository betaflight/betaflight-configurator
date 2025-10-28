# Android APK Signing Guide

## Overview

Android requires all APKs to be signed before they can be installed on devices. This repository supports both **debug signing** (for development/testing) and **release signing** (for production releases).

## CI/PR Builds (Debug Signing)

PR builds in the `ci.yml` workflow automatically sign APKs with a **debug keystore**. These are suitable for:
- Testing on development devices
- Internal QA
- Feature validation

The debug-signed APKs can be downloaded from the PR's workflow artifacts and installed on any Android device with developer mode enabled.

## Release Builds (Production Signing)

For production releases via the `release.yml` workflow, you should configure a **release keystore** using GitHub Secrets.

### Creating a Release Keystore

If you don't already have a release keystore, create one:

```bash
keytool -genkeypair -v \
  -keystore betaflight-release.keystore \
  -storepass <YOUR_STORE_PASSWORD> \
  -alias betaflight \
  -keypass <YOUR_KEY_PASSWORD> \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=Betaflight,O=Betaflight,C=US"
```

**⚠️ IMPORTANT**: Keep this keystore file and passwords secure. If you lose them, you cannot update your app on the Play Store!

### Configure GitHub Secrets

Add the following secrets to your GitHub repository (Settings → Secrets and variables → Actions):

1. **ANDROID_KEYSTORE_BASE64**
   ```bash
   base64 -w 0 betaflight-release.keystore
   ```
   Copy the output and paste it as the secret value.

2. **ANDROID_KEYSTORE_PASSWORD**  
   The password you used for `-storepass` when creating the keystore.

3. **ANDROID_KEY_ALIAS**  
   The alias you used (e.g., `betaflight`).

4. **ANDROID_KEY_PASSWORD**  
   The password you used for `-keypass` when creating the keystore.

### How Release Signing Works

When you trigger a release build:

1. If **all four secrets are configured**, the workflow will:
   - Decode the base64 keystore
   - Sign both the APK and AAB with your release key
   - Upload signed artifacts with `-release-signed` suffix

2. If **secrets are NOT configured**, the workflow will:
   - Fall back to debug signing
   - Upload APKs with `-debug-signed` suffix
   - ⚠️ These cannot be uploaded to the Play Store!

## Verifying Signed APKs

To verify an APK signature:

```bash
# Check signature
jarsigner -verify -verbose -certs your-app.apk

# View certificate details
keytool -printcert -jarfile your-app.apk
```

For release APKs, the certificate should match your release keystore.  
For debug APKs, the certificate will show "CN=Android Debug".

## Installing Signed APKs

### Debug-signed APKs
- Enable "Install from unknown sources" or "Install unknown apps" on your Android device
- Download the APK from GitHub Actions artifacts
- Install via file manager or `adb install path/to/app.apk`

### Release-signed APKs
- Can be installed the same way as debug APKs
- Can be uploaded to Google Play Store for distribution
- Must be signed with the same keystore for app updates

## Security Best Practices

1. **Never commit keystores to the repository**
2. **Keep keystore passwords in GitHub Secrets only**
3. **Back up your release keystore securely** (preferably in multiple secure locations)
4. **Use strong passwords** for both keystore and key alias
5. **Limit access** to GitHub Secrets to trusted maintainers only

## Troubleshooting

### "APK not signed" error during installation
- The APK must be signed (either debug or release)
- Check workflow logs to ensure signing step completed successfully

### "App not installed" or "Package conflicts" error
- You may have an existing version signed with a different key
- Uninstall the old version first, then install the new APK

### Release workflow falls back to debug signing
- Check that all four GitHub Secrets are configured correctly
- Verify the base64-encoded keystore is valid: `echo "$SECRET" | base64 -d > test.keystore`
- Check workflow logs for any error messages in the "Setup release keystore" step
