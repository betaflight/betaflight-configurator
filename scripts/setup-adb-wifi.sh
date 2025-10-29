#!/bin/bash
# Script to help set up ADB over WiFi/TCP for Android debugging
# This allows USB port to be used for flight controller while still debugging

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       ADB Wireless Debugging Setup for Betaflight         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if adb is installed
if ! command -v adb &> /dev/null; then
    echo "❌ Error: adb not found. Please install Android SDK platform-tools."
    exit 1
fi

echo "Choose your method:"
echo ""
echo "1) Wireless Debugging (Android 11+) - Recommended"
echo "2) ADB over TCP/IP (Any Android version)"
echo ""
read -p "Enter choice [1-2]: " choice

case $choice in
    1)
        echo ""
        echo "═══ Wireless Debugging (Android 11+) ═══"
        echo ""
        echo "On your Android tablet:"
        echo "  1. Settings → Developer Options → Wireless debugging"
        echo "  2. Tap 'Pair device with pairing code'"
        echo "  3. Note the IP address, port, and pairing code"
        echo ""
        read -p "Enter IP:PORT (e.g., 192.168.1.100:12345): " pair_address
        echo ""
        echo "Running: adb pair $pair_address"
        adb pair "$pair_address"
        
        if [ $? -eq 0 ]; then
            echo ""
            echo "✅ Pairing successful!"
            echo ""
            read -p "Enter the wireless debugging port (usually different, like :38281): " debug_port
            connect_address="${pair_address%:*}:${debug_port}"
            echo "Running: adb connect $connect_address"
            adb connect "$connect_address"
            
            if [ $? -eq 0 ]; then
                echo ""
                echo "✅ Connected successfully!"
                adb devices -l
            fi
        fi
        ;;
        
    2)
        echo ""
        echo "═══ ADB over TCP/IP (Traditional Method) ═══"
        echo ""
        echo "⚠️  You need USB connected FIRST to enable TCP/IP mode"
        echo ""
        read -p "Press Enter when tablet is connected via USB..."
        
        # Check for USB device
        usb_devices=$(adb devices | grep -v "List of devices" | grep -v "^$" | grep -v "wifi" | wc -l)
        
        if [ "$usb_devices" -eq 0 ]; then
            echo "❌ No USB device found. Please connect tablet via USB and enable USB debugging."
            exit 1
        fi
        
        echo ""
        echo "Found USB device(s):"
        adb devices
        echo ""
        
        # Enable TCP/IP mode
        echo "Enabling TCP/IP mode on port 5555..."
        adb tcpip 5555
        
        if [ $? -eq 0 ]; then
            echo "✅ TCP/IP mode enabled"
            echo ""
            echo "Getting tablet IP address..."
            tablet_ip=$(adb shell ip addr show wlan0 | grep -oP 'inet \K[\d.]+' | head -1)
            
            if [ -z "$tablet_ip" ]; then
                echo "⚠️  Could not detect IP automatically."
                echo "On your tablet, go to Settings → About → Status → IP address"
                read -p "Enter tablet IP address: " tablet_ip
            else
                echo "Detected IP: $tablet_ip"
            fi
            
            echo ""
            echo "Now DISCONNECT the USB cable and connect your flight controller"
            read -p "Press Enter when USB cable is disconnected and you're ready to connect via WiFi..."
            
            # Connect over network
            echo ""
            echo "Connecting to $tablet_ip:5555..."
            adb connect "$tablet_ip:5555"
            
            if [ $? -eq 0 ]; then
                echo ""
                echo "✅ Connected successfully!"
                adb devices -l
            fi
        else
            echo "❌ Failed to enable TCP/IP mode"
            exit 1
        fi
        ;;
        
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Connect flight controller to tablet's USB port"
echo "  2. Open Betaflight Configurator on tablet"
echo "  3. On PC, open Chrome and go to: chrome://inspect"
echo "  4. Click 'inspect' next to the app to see console logs"
echo ""
echo "To check connection anytime:"
echo "  adb devices"
echo ""
echo "To reconnect later (after reboot):"
echo "  adb connect <IP>:5555"
echo "════════════════════════════════════════════════════════"
