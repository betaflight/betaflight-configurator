/**
 * Alert System Test Script
 * Run this in the browser console to test the MSP debug alert system
 */

console.log("🧪 Starting MSP Alert System Test...");

// Test function to check alert system
async function testAlertSystem() {
    console.log("1. Checking if MSPDebug is available...");
    if (typeof window.MSPDebug === "undefined") {
        console.error("❌ MSPDebug not found! Debug tools may not be loaded.");
        return;
    }
    console.log("✅ MSPDebug is available");

    console.log("2. Checking dashboard...");
    const dashboard = window.MSPDebug.dashboard;
    if (!dashboard) {
        console.error("❌ Dashboard not found!");
        return;
    }
    console.log("✅ Dashboard is available");

    console.log("3. Checking monitor...");
    const monitor = window.MSPDebug.monitor;
    if (!monitor) {
        console.error("❌ Monitor not found!");
        return;
    }
    console.log("✅ Monitor is available");

    console.log("4. Showing dashboard...");
    dashboard.show();

    console.log("5. Starting monitoring...");
    monitor.startMonitoring(500);

    console.log("6. Checking alert container exists...");
    const alertContainer = document.getElementById("alerts-container");
    if (!alertContainer) {
        console.error("❌ Alert container not found in DOM!");
        return;
    }
    console.log("✅ Alert container found:", alertContainer);

    console.log("7. Getting current status...");
    const status = monitor.getStatus();
    console.log("Current status:", status);
    console.log("Current alerts:", status.alerts);

    console.log("8. Testing alert display directly...");
    dashboard.updateAlerts({
        queueFull: true,
        highTimeout: false,
        slowResponses: true,
        memoryLeak: false,
    });

    console.log("9. Checking alert container content after manual update...");
    console.log("Alert container HTML:", alertContainer.innerHTML);

    console.log("10. Triggering test alerts...");
    const testAlerts = monitor.triggerTestAlerts();
    console.log("Test alerts triggered:", testAlerts);

    console.log("11. Waiting 2 seconds and checking again...");
    setTimeout(() => {
        const newStatus = monitor.getStatus();
        console.log("Status after test alerts:", newStatus);
        console.log("Alerts after test:", newStatus.alerts);
        console.log("Alert container HTML after test:", alertContainer.innerHTML);

        // Test the complete update flow
        console.log("12. Testing complete update flow...");
        dashboard.updateDisplay(newStatus);
        console.log("Alert container HTML after updateDisplay:", alertContainer.innerHTML);

        console.log("🏁 Alert system test complete!");
    }, 2000);
}

// Run the test
testAlertSystem();

// Also provide manual test functions
window.testAlertSystem = testAlertSystem;
window.checkAlerts = () => {
    const container = document.getElementById("alerts-container");
    console.log("Alert container:", container);
    console.log("Alert container HTML:", container?.innerHTML);
    const status = window.MSPDebug?.monitor?.getStatus();
    console.log("Current alerts:", status?.alerts);
};

window.manualTestAlert = () => {
    console.log("Testing alert display manually...");
    const dashboard = window.MSPDebug.dashboard;
    dashboard.updateAlerts({
        queueFull: true,
        highTimeout: true,
        slowResponses: false,
        memoryLeak: true,
    });
    console.log("Manual test alerts set");
};
