/**
 * MSP Test Runner - Simple script to run tests and monitoring
 * Usage examples from browser console:
 *
 * // Quick start monitoring
 * MSPTestRunner.startQuickMonitor();
 *
 * // Run specific test
 * MSPTestRunner.runTest('queue-flooding');
 *
 * // Run full stress test suite
 * MSPTestRunner.runFullSuite();
 *
 * // Get current status
 * MSPTestRunner.getStatus();
 */

import { mspQueueMonitor } from "./msp_queue_monitor.js";
import { mspStressTest } from "./msp_stress_test.js";
import { mspDebugDashboard } from "./msp_debug_dashboard.js";

export const MSPTestRunner = {
    // Store the listener function so it can be removed later
    _quickMonitorListener: null,

    /**
     * Start quick monitoring with console output
     */
    startQuickMonitor() {
        console.log("🚀 Starting MSP Quick Monitor...");

        // Remove any existing listener first
        if (this._quickMonitorListener) {
            mspQueueMonitor.removeListener(this._quickMonitorListener);
        }

        // Define the listener function so it can be referenced for removal
        this._quickMonitorListener = (status) => {
            if (status.alerts && Object.values(status.alerts).some((alert) => alert)) {
                console.warn("🚨 MSP Alert:", status.alerts);
            }

            // Log every 10 seconds if monitoring
            if (Date.now() % 10000 < 500) {
                console.log(
                    `📊 MSP Status: Queue=${status.currentQueueSize}/${status.maxQueueSize}, Requests=${status.metrics.totalRequests}, AvgTime=${Math.round(status.metrics.avgResponseTime)}ms`,
                );
            }
        };

        mspQueueMonitor.addListener(this._quickMonitorListener);
        mspQueueMonitor.startMonitoring(1000);
        console.log("✅ Quick monitor started. Use MSPTestRunner.stopMonitor() to stop.");

        return {
            stop: () => this.stopMonitor(),
            status: () => this.getStatus(),
            analyze: () => this.analyzeQueue(),
        };
    },

    /**
     * Stop monitoring
     */
    stopMonitor() {
        mspQueueMonitor.stopMonitoring();

        // Remove the listener to prevent duplicate logs
        if (this._quickMonitorListener) {
            mspQueueMonitor.removeListener(this._quickMonitorListener);
            this._quickMonitorListener = null;
        }

        console.log("⏹️ MSP Monitor stopped");
    },

    /**
     * Run a specific stress test
     */
    async runTest(testName) {
        console.log(`🧪 Running MSP test: ${testName}`);

        try {
            const result = await mspStressTest.runSpecificTest(testName);

            if (result.status === "PASSED") {
                console.log(`✅ Test ${testName} PASSED`);
                console.table(result.result);
            } else {
                console.error(`❌ Test ${testName} FAILED:`, result.error);
            }

            return result;
        } catch (error) {
            console.error(`💥 Test ${testName} crashed:`, error);
            return { status: "ERROR", error: error.message };
        }
    },

    /**
     * Run the full stress test suite
     */
    async runFullSuite() {
        console.log("🚀 Running FULL MSP Stress Test Suite...");
        console.log("This may take several minutes and will stress the MSP system.");

        const startTime = Date.now();

        try {
            const results = await mspStressTest.runStressTestSuite();
            const duration = Date.now() - startTime;

            console.log(`\n📊 Test Suite Complete (${Math.round(duration / 1000)}s)`);
            console.log(`✅ Passed: ${results.summary.passed}`);
            console.log(`❌ Failed: ${results.summary.failed}`);
            console.log(`📈 Success Rate: ${Math.round(results.summary.successRate * 100)}%`);
            console.log(`🎯 Overall Grade: ${results.summary.overallGrade}`);

            if (results.recommendations && results.recommendations.length > 0) {
                console.log("\n💡 Recommendations:");
                results.recommendations.forEach((rec) => console.log(`  • ${rec}`));
            }

            // Show detailed results table
            console.log("\n📋 Detailed Results:");
            console.table(
                results.detailedResults.map((test) => ({
                    Test: test.name,
                    Status: test.status,
                    Duration: test.duration ? `${Math.round(test.duration)}ms` : "N/A",
                })),
            );

            return results;
        } catch (error) {
            console.error("💥 Test Suite Failed:", error);
            return { error: error.message };
        }
    },

    /**
     * Get current MSP status
     */
    getStatus() {
        const status = mspQueueMonitor.getStatus();

        console.log("📊 Current MSP Status:");
        console.log(`   Queue: ${status.currentQueueSize}/${status.maxQueueSize}`);
        console.log(`   Total Requests: ${status.metrics.totalRequests}`);
        console.log(`   Success Rate: ${Math.round((status.metrics.successRate || 0) * 100)}%`);
        console.log(`   Avg Response Time: ${Math.round(status.metrics.avgResponseTime || 0)}ms`);
        console.log(`   Active Alerts: ${Object.values(status.alerts).filter((a) => a).length}`);

        if (status.queueContents.length > 0) {
            console.log("\n📋 Queue Contents:");
            console.table(status.queueContents);
        }

        return status;
    },

    /**
     * Analyze current queue
     */
    analyzeQueue() {
        const analysis = mspQueueMonitor.analyzeQueue();

        console.log("🔍 Queue Analysis:");
        console.log(`   Total Items: ${analysis.totalItems}`);
        console.log("   Age Distribution:", analysis.ageDistribution);
        console.log("   By Code:", analysis.byCode);

        if (analysis.potentialIssues.length > 0) {
            console.log("⚠️ Potential Issues:");
            analysis.potentialIssues.forEach((issue) => console.log(`   • ${issue}`));
        }

        return analysis;
    },

    /**
     * Generate and download comprehensive report
     */
    generateReport() {
        const report = mspQueueMonitor.generateReport();

        console.log("📄 Generating MSP Report...");
        console.log("   Queue Health:", report.summary.queueHealth);
        console.log("   Performance Grade:", report.summary.performanceGrade);

        // Create downloadable report
        const blob = new Blob([JSON.stringify(report, null, 2)], {
            type: "application/json",
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `msp-report-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log("✅ Report downloaded");
        return report;
    },

    /**
     * Show the visual dashboard
     */
    showDashboard() {
        mspDebugDashboard.show();
        console.log("🖥️ Debug dashboard opened. Press Ctrl+Shift+M to toggle.");
    },

    /**
     * Run a quick health check
     */
    async quickHealthCheck() {
        console.log("🏥 Running Quick MSP Health Check...");

        // Start monitoring briefly
        mspQueueMonitor.startMonitoring(100);

        // Send a few test requests
        const testPromises = [
            window.MSP.promise(100, null), // MSP_IDENT
            window.MSP.promise(101, null), // MSP_STATUS
            window.MSP.promise(108, null), // MSP_ATTITUDE
        ];

        try {
            const startTime = Date.now();
            await Promise.all(testPromises);
            const responseTime = Date.now() - startTime;

            // Get status after test
            await new Promise((resolve) => setTimeout(resolve, 200));
            const status = mspQueueMonitor.getStatus();

            mspQueueMonitor.stopMonitoring();

            const health = {
                status: "HEALTHY",
                responseTime,
                queueClearedAfterTest: status.currentQueueSize === 0,
                successRate: status.metrics.successRate || 0,
            };

            if (responseTime > 2000) {
                health.status = "SLOW";
                health.warning = "Response times are slow";
            }

            if (!health.queueClearedAfterTest) {
                health.status = "WARNING";
                health.warning = "Queue not properly cleared after requests";
            }

            if (health.successRate < 1) {
                health.status = "FAILING";
                health.warning = "Some requests are failing";
            }

            console.log(`🏥 Health Check Result: ${health.status}`);
            console.log(`   Response Time: ${responseTime}ms`);
            console.log(`   Queue Cleared: ${health.queueClearedAfterTest ? "✅" : "❌"}`);
            console.log(`   Success Rate: ${Math.round(health.successRate * 100)}%`);

            if (health.warning) {
                console.warn(`⚠️ ${health.warning}`);
            }

            return health;
        } catch (error) {
            mspQueueMonitor.stopMonitoring();
            console.error("💥 Health check failed:", error);
            return { status: "ERROR", error: error.message };
        }
    },

    /**
     * Stress test a specific scenario
     */
    async stressScenario(scenario) {
        const scenarios = {
            "high-frequency": async () => {
                console.log("🔥 High Frequency Scenario: Sending requests every 10ms for 5 seconds");
                const promises = [];
                const startTime = Date.now();

                while (Date.now() - startTime < 5000) {
                    promises.push(window.MSP.promise(101, null).catch(() => {}));
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                const results = await Promise.allSettled(promises);
                return {
                    totalRequests: promises.length,
                    successful: results.filter((r) => r.status === "fulfilled").length,
                    duration: Date.now() - startTime,
                };
            },

            "queue-overflow": async () => {
                console.log("💥 Queue Overflow Scenario: Flooding queue beyond capacity");
                const promises = [];

                // Send more requests than queue can handle
                for (let i = 0; i < 100; i++) {
                    promises.push(window.MSP.promise(101, null).catch((err) => ({ error: err.message })));
                }

                const results = await Promise.allSettled(promises);
                const successful = results.filter((r) => r.status === "fulfilled" && !r.value.error).length;

                return {
                    requestsSent: 100,
                    successful,
                    rejected: 100 - successful,
                };
            },

            "mixed-load": async () => {
                console.log("🎭 Mixed Load Scenario: Various request types and sizes");
                const codes = [100, 101, 102, 104, 108, 110, 111, 112];
                const promises = [];

                for (let i = 0; i < 30; i++) {
                    const code = codes[i % codes.length];
                    const data = i % 4 === 0 ? new Uint8Array([i, i + 1, i + 2]) : null;
                    promises.push(window.MSP.promise(code, data).catch(() => {}));
                }

                const startTime = Date.now();
                const results = await Promise.allSettled(promises);
                const duration = Date.now() - startTime;

                return {
                    totalRequests: 30,
                    successful: results.filter((r) => r.status === "fulfilled").length,
                    duration,
                    avgResponseTime: duration / 30,
                };
            },
        };

        const scenarioFn = scenarios[scenario];
        if (!scenarioFn) {
            console.error(`❌ Unknown scenario: ${scenario}`);
            console.log("Available scenarios:", Object.keys(scenarios));
            return;
        }

        mspQueueMonitor.startMonitoring(100);

        try {
            const result = await scenarioFn();
            const status = mspQueueMonitor.getStatus();

            console.log("📊 Scenario Results:");
            console.table(result);
            console.log("📈 Final MSP Status:");
            console.table({
                "Queue Size": status.currentQueueSize,
                "Total Requests": status.metrics.totalRequests,
                "Success Rate": `${Math.round((status.metrics.successRate || 0) * 100)}%`,
                "Avg Response": `${Math.round(status.metrics.avgResponseTime || 0)}ms`,
            });

            return { scenario: result, mspStatus: status };
        } catch (error) {
            console.error("💥 Scenario failed:", error);
            return { error: error.message };
        } finally {
            mspQueueMonitor.stopMonitoring();
        }
    },

    /**
     * List available commands
     */
    help() {
        console.log(`
🔧 MSP Test Runner Commands:

Basic Monitoring:
  MSPTestRunner.startQuickMonitor()     - Start monitoring with console output
  MSPTestRunner.stopMonitor()           - Stop monitoring
  MSPTestRunner.getStatus()             - Get current status
  MSPTestRunner.analyzeQueue()          - Analyze current queue

Testing:
  MSPTestRunner.runTest('test-name')    - Run specific test
  MSPTestRunner.runFullSuite()          - Run full stress test suite
  MSPTestRunner.quickHealthCheck()      - Quick health check

Stress Scenarios:
  MSPTestRunner.stressScenario('high-frequency')  - High frequency requests
  MSPTestRunner.stressScenario('queue-overflow')  - Queue overflow test
  MSPTestRunner.stressScenario('mixed-load')      - Mixed request types

Visual Tools:
  MSPTestRunner.showDashboard()         - Show visual dashboard
  MSPTestRunner.generateReport()        - Generate and download report

Available Test Names:
  'queue-flooding', 'rapid-fire', 'duplicates', 'timeout-recovery',
  'memory-leaks', 'concurrent-mixed', 'queue-overflow', 
  'connection-disruption', 'performance-load'

Keyboard Shortcuts:
  Ctrl+Shift+M - Toggle debug dashboard
        `);
    },
};

// Make globally available
window.MSPTestRunner = MSPTestRunner;

console.log("🔧 MSP Test Runner loaded! Type MSPTestRunner.help() for commands.");
