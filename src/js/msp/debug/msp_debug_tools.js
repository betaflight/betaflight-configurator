/**
 * MSP Debug Tools - Integration file to load all debugging and testing tools
 * Include this file to get comprehensive MSP monitoring and testing capabilities
 */

// Import all debug tools
import "./msp_queue_monitor.js";
import "./msp_stress_test.js";
import "./msp_debug_dashboard.js";
import "./msp_test_runner.js";

console.log(`
🔧 MSP Debug Tools Loaded Successfully!

Quick Start:
  • Press Ctrl+Shift+M to toggle the visual dashboard
  • Use MSPTestRunner.help() to see all available commands
  • Use MSPTestRunner.quickHealthCheck() for a quick test

Example Usage:
  MSPTestRunner.startQuickMonitor();     // Start monitoring
  MSPTestRunner.runTest('queue-flooding'); // Run specific test  
  MSPTestRunner.showDashboard();         // Show visual dashboard
  MSPTestRunner.runFullSuite();          // Run all stress tests

The tools will help you:
  ✓ Monitor MSP queue health in real-time
  ✓ Detect memory leaks and performance issues
  ✓ Stress test the MSP implementation
  ✓ Analyze queue contents and response times
  ✓ Export detailed diagnostic reports

Happy debugging! 🚀
`);

// Auto-start basic monitoring in development
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.log("🔄 Development environment detected - auto-starting basic monitoring");

    // Import the monitor and start it with minimal logging
    import("./msp_queue_monitor.js").then(({ mspQueueMonitor }) => {
        mspQueueMonitor.addListener((status) => {
            // Only log alerts and significant events
            const alerts = Object.values(status.alerts).filter((a) => a);
            if (alerts.length > 0) {
                console.warn("🚨 MSP Alert detected - check dashboard for details");
            }
        });

        mspQueueMonitor.startMonitoring(2000); // Monitor every 2 seconds
    });
}
