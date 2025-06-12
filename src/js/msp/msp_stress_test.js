/**
 * MSP Stress Test Framework
 * Comprehensive testing tool for MSP queue management, timeout handling, and performance
 */

import { MSPQueueMonitor } from "./msp_queue_monitor.js";

export class MSPStressTest {
    constructor(mspInstance) {
        this.msp = mspInstance;
        this.monitor = new MSPQueueMonitor(mspInstance);
        this.isRunning = false;
        this.testResults = [];
        this.currentTest = null;

        // Common MSP codes for testing
        this.testCodes = {
            MSP_IDENT: 100,
            MSP_STATUS: 101,
            MSP_RAW_IMU: 102,
            MSP_SERVO: 103,
            MSP_MOTOR: 104,
            MSP_RC: 105,
            MSP_RAW_GPS: 106,
            MSP_COMP_GPS: 107,
            MSP_ATTITUDE: 108,
            MSP_ALTITUDE: 109,
            MSP_ANALOG: 110,
            MSP_RC_TUNING: 111,
            MSP_PID: 112,
            MSP_PIDNAMES: 116,
            MSP_BOXNAMES: 116,
            MSP_MISC: 114,
            MSP_MOTOR_PINS: 115,
        };
    }

    /**
     * Run a comprehensive stress test suite
     */
    async runStressTestSuite() {
        console.log("🚀 Starting MSP Stress Test Suite");
        this.monitor.startMonitoring(100); // High frequency monitoring during tests

        const tests = [
            { name: "Queue Flooding", test: () => this.testQueueFlooding() },
            { name: "Rapid Fire Requests", test: () => this.testRapidFireRequests() },
            { name: "Duplicate Request Handling", test: () => this.testDuplicateRequests() },
            { name: "Timeout Recovery", test: () => this.testTimeoutRecovery() },
            { name: "Memory Leak Detection", test: () => this.testMemoryLeaks() },
            { name: "Concurrent Mixed Requests", test: () => this.testConcurrentMixedRequests() },
            { name: "Queue Overflow Handling", test: () => this.testQueueOverflow() },
            { name: "Connection Disruption", test: () => this.testConnectionDisruption() },
            { name: "Performance Under Load", test: () => this.testPerformanceUnderLoad() },
        ];

        const results = [];

        for (const testDef of tests) {
            try {
                console.log(`\n📋 Running: ${testDef.name}`);
                this.currentTest = testDef.name;
                this.monitor.resetAll(); // Reset both metrics and alerts for clean test start

                const startTime = performance.now();
                const result = await testDef.test();
                const duration = performance.now() - startTime;

                const testResult = {
                    name: testDef.name,
                    status: "PASSED",
                    duration,
                    result,
                    metrics: this.monitor.getStatus(),
                    timestamp: new Date().toISOString(),
                };

                results.push(testResult);
                console.log(`✅ ${testDef.name} completed in ${Math.round(duration)}ms`);

                // Wait between tests to let queue settle
                await this.wait(1000);
            } catch (error) {
                console.error(`❌ ${testDef.name} failed:`, error);
                results.push({
                    name: testDef.name,
                    status: "FAILED",
                    error: error.message,
                    timestamp: new Date().toISOString(),
                });
            }
        }

        this.monitor.stopMonitoring();
        this.testResults = results;

        const report = this.generateTestReport(results);
        console.log("\n📊 Stress Test Suite Complete");
        console.log(report.summary);

        return report;
    }

    /**
     * Test 1: Queue Flooding - Send many requests quickly to test queue limits
     */
    async testQueueFlooding() {
        const requestCount = 60; // More than default MAX_QUEUE_SIZE
        const promises = [];

        console.log(`  Flooding queue with ${requestCount} requests...`);

        for (let i = 0; i < requestCount; i++) {
            const code = Object.values(this.testCodes)[i % Object.keys(this.testCodes).length];
            const promise = this.msp.promise(code, null).catch((err) => ({ error: err.message }));
            promises.push(promise);
        }

        const results = await Promise.allSettled(promises);
        const successful = results.filter((r) => r.status === "fulfilled" && !r.value.error).length;
        const failed = results.length - successful;

        return {
            requestsSent: requestCount,
            successful,
            failed,
            successRate: successful / requestCount,
            peakQueueSize: this.monitor.metrics.queuePeakSize,
        };
    }

    /**
     * Test 2: Rapid Fire Requests - Send requests in rapid succession
     */
    async testRapidFireRequests() {
        const requestCount = 20;
        const interval = 10; // 10ms between requests

        console.log(`  Sending ${requestCount} requests with ${interval}ms intervals...`);

        const results = [];
        const startTime = performance.now();

        for (let i = 0; i < requestCount; i++) {
            const code = this.testCodes.MSP_STATUS;
            const requestStart = performance.now();

            try {
                await this.msp.promise(code, null);
                results.push({
                    success: true,
                    responseTime: performance.now() - requestStart,
                });
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    responseTime: performance.now() - requestStart,
                });
            }

            if (i < requestCount - 1) {
                await this.wait(interval);
            }
        }

        const totalTime = performance.now() - startTime;
        const successful = results.filter((r) => r.success).length;
        const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

        return {
            requestCount,
            successful,
            failed: requestCount - successful,
            totalTime,
            avgResponseTime,
            throughput: requestCount / (totalTime / 1000), // requests per second
        };
    }

    /**
     * Test 3: Duplicate Request Handling
     */
    async testDuplicateRequests() {
        const code = this.testCodes.MSP_IDENT;
        const data = new Uint8Array([1, 2, 3]); // Same data for all requests
        const duplicateCount = 5;

        console.log(`  Sending ${duplicateCount} duplicate requests...`);

        const promises = [];
        for (let i = 0; i < duplicateCount; i++) {
            promises.push(this.msp.promise(code, data).catch((err) => ({ error: err.message })));
        }

        const results = await Promise.allSettled(promises);
        const successful = results.filter((r) => r.status === "fulfilled" && !r.value.error).length;
        const duplicateErrors = results.filter(
            (r) => r.status === "rejected" || r?.value?.error?.includes("duplicate"),
        ).length;

        return {
            duplicatesSent: duplicateCount,
            successful,
            duplicateRejections: duplicateErrors,
            queueSizeAfter: this.msp.callbacks.length,
        };
    }

    /**
     * Test 4: Timeout Recovery
     */
    async testTimeoutRecovery() {
        console.log("  Testing timeout recovery...");

        // Save original timeout
        const originalTimeout = this.msp.TIMEOUT;
        this.msp.TIMEOUT = 100; // Very short timeout for testing

        try {
            const code = this.testCodes.MSP_STATUS;
            const startTime = performance.now();

            try {
                await this.msp.promise(code, null);
                return { error: "Expected timeout but request succeeded" };
            } catch (error) {
                const timeoutTime = performance.now() - startTime;

                // Test that new requests work after timeout
                this.msp.TIMEOUT = originalTimeout;
                await this.wait(200);

                const recoveryStart = performance.now();
                await this.msp.promise(this.testCodes.MSP_IDENT, null);
                const recoveryTime = performance.now() - recoveryStart;

                return {
                    timeoutOccurred: true,
                    timeoutDuration: timeoutTime,
                    recoveryTime,
                    queueCleanedUp: this.msp.callbacks.length === 0,
                };
            }
        } finally {
            this.msp.TIMEOUT = originalTimeout;
        }
    }

    /**
     * Test 5: Memory Leak Detection
     */
    async testMemoryLeaks() {
        console.log("  Testing for memory leaks...");

        const initialCallbackCount = this.msp.callbacks.length;
        const requestCount = 10;

        // Send requests and let them complete
        const promises = [];
        for (let i = 0; i < requestCount; i++) {
            promises.push(this.msp.promise(this.testCodes.MSP_STATUS, null).catch(() => {}));
        }

        await Promise.allSettled(promises);
        await this.wait(100); // Let cleanup complete

        const finalCallbackCount = this.msp.callbacks.length;
        const leaked = finalCallbackCount - initialCallbackCount;

        return {
            initialCallbacks: initialCallbackCount,
            finalCallbacks: finalCallbackCount,
            leaked,
            memoryLeakDetected: leaked > 0,
            requestsProcessed: requestCount,
        };
    }

    /**
     * Test 6: Concurrent Mixed Requests
     */
    async testConcurrentMixedRequests() {
        console.log("  Testing concurrent mixed requests...");

        const promises = [];
        const codes = Object.values(this.testCodes);

        // Mix of different request types
        for (let i = 0; i < 15; i++) {
            const code = codes[i % codes.length];
            const data = i % 3 === 0 ? new Uint8Array([i]) : null;

            promises.push(this.msp.promise(code, data).catch((err) => ({ error: err.message })));
        }

        const startTime = performance.now();
        const results = await Promise.allSettled(promises);
        const totalTime = performance.now() - startTime;

        const successful = results.filter((r) => r.status === "fulfilled" && !r.value.error).length;

        return {
            totalRequests: promises.length,
            successful,
            failed: promises.length - successful,
            totalTime,
            concurrentProcessing: true,
        };
    }

    /**
     * Test 7: Queue Overflow Handling
     */
    async testQueueOverflow() {
        console.log("  Testing queue overflow handling...");

        const maxQueue = this.msp.MAX_QUEUE_SIZE || 50;
        const overflowCount = maxQueue + 10;

        const promises = [];
        for (let i = 0; i < overflowCount; i++) {
            promises.push(this.msp.promise(this.testCodes.MSP_STATUS, null).catch((err) => ({ error: err.message })));
        }

        const results = await Promise.allSettled(promises);
        const rejected = results.filter((r) => r.status === "rejected" || r.value?.error).length;

        return {
            attemptedRequests: overflowCount,
            maxQueueSize: maxQueue,
            rejectedDueToOverflow: rejected,
            overflowHandled: rejected > 0,
            finalQueueSize: this.msp.callbacks.length,
        };
    }

    /**
     * Test 8: Connection Disruption Simulation
     */
    async testConnectionDisruption() {
        console.log("  Simulating connection disruption...");

        // This test would need to work with the actual serial implementation
        // For now, we'll simulate by temporarily breaking the connection

        const originalConnected = this.msp.serial?.connected;

        try {
            // Simulate disconnection
            if (this.msp.serial) {
                this.msp.serial.connected = false;
            }

            // Try to send requests while "disconnected"
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    this.msp.promise(this.testCodes.MSP_STATUS, null).catch((err) => ({ error: err.message })),
                );
            }

            const disconnectedResults = await Promise.allSettled(promises);
            const failedWhileDisconnected = disconnectedResults.filter(
                (r) => r.status === "rejected" || r.value?.error,
            ).length;

            // Restore connection
            if (this.msp.serial) {
                this.msp.serial.connected = originalConnected;
            }

            // Test recovery
            await this.wait(100);
            const recoveryResult = await this.msp
                .promise(this.testCodes.MSP_IDENT, null)
                .catch((err) => ({ error: err.message }));

            return {
                failedWhileDisconnected,
                recoverySuccessful: !recoveryResult.error,
                connectionHandled: failedWhileDisconnected > 0,
            };
        } finally {
            // Ensure connection is restored
            if (this.msp.serial) {
                this.msp.serial.connected = originalConnected;
            }
        }
    }

    /**
     * Test 9: Performance Under Load
     */
    async testPerformanceUnderLoad() {
        console.log("  Testing performance under sustained load...");

        const duration = 5000; // 5 seconds
        const requestInterval = 50; // Request every 50ms
        const startTime = performance.now();

        const results = [];
        let requestCount = 0;

        while (performance.now() - startTime < duration) {
            const requestStart = performance.now();
            requestCount++;

            try {
                await this.msp.promise(this.testCodes.MSP_STATUS, null);
                results.push({
                    success: true,
                    responseTime: performance.now() - requestStart,
                });
            } catch (error) {
                results.push({
                    success: false,
                    responseTime: performance.now() - requestStart,
                    error: error.message,
                });
            }

            await this.wait(requestInterval);
        }

        const successful = results.filter((r) => r.success).length;
        const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
        const maxResponseTime = Math.max(...results.map((r) => r.responseTime));

        return {
            duration,
            requestCount,
            successful,
            failed: requestCount - successful,
            successRate: successful / requestCount,
            avgResponseTime,
            maxResponseTime,
            throughput: requestCount / (duration / 1000),
        };
    }

    /**
     * Generate comprehensive test report
     */
    generateTestReport(results) {
        const totalTests = results.length;
        const passedTests = results.filter((r) => r.status === "PASSED").length;
        const failedTests = totalTests - passedTests;

        const summary = {
            totalTests,
            passed: passedTests,
            failed: failedTests,
            successRate: passedTests / totalTests,
            overallGrade: this._calculateOverallGrade(results),
        };

        const recommendations = this._generateTestRecommendations(results);

        return {
            timestamp: new Date().toISOString(),
            summary,
            recommendations,
            detailedResults: results,
            monitorReport: this.monitor.generateReport(),
        };
    }

    /**
     * Calculate overall test grade
     */
    _calculateOverallGrade(results) {
        const passRate = results.filter((r) => r.status === "PASSED").length / results.length;

        if (passRate >= 0.95) {
            return "A+";
        }
        if (passRate >= 0.9) {
            return "A";
        }
        if (passRate >= 0.85) {
            return "B+";
        }
        if (passRate >= 0.8) {
            return "B";
        }
        if (passRate >= 0.75) {
            return "C+";
        }
        if (passRate >= 0.7) {
            return "C";
        }
        if (passRate >= 0.6) {
            return "D";
        }
        return "F";
    }

    /**
     * Generate recommendations based on test results
     */
    _generateTestRecommendations(results) {
        const recommendations = [];

        // Check for specific test failures
        const failedTests = results.filter((r) => r.status === "FAILED");
        if (failedTests.length > 0) {
            recommendations.push(
                `${failedTests.length} tests failed. Review implementation for: ${failedTests.map((t) => t.name).join(", ")}`,
            );
        }

        // Check performance issues
        const perfTest = results.find((r) => r.name === "Performance Under Load");
        if (perfTest?.result?.avgResponseTime > 1000) {
            recommendations.push("Average response time is high. Consider optimizing MSP request handling.");
        }

        // Check memory leaks
        const memTest = results.find((r) => r.name === "Memory Leak Detection");
        if (memTest?.result?.memoryLeakDetected) {
            recommendations.push("Memory leak detected. Ensure all callbacks are properly cleaned up.");
        }

        // Check queue overflow handling
        const overflowTest = results.find((r) => r.name === "Queue Overflow Handling");
        if (!overflowTest?.result?.overflowHandled) {
            recommendations.push("Queue overflow not properly handled. Implement proper queue management.");
        }

        return recommendations;
    }

    /**
     * Utility: Wait for specified milliseconds
     */
    wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Run a specific test by name
     */
    async runSpecificTest(testName) {
        const testMethods = {
            "queue-flooding": () => this.testQueueFlooding(),
            "rapid-fire": () => this.testRapidFireRequests(),
            duplicates: () => this.testDuplicateRequests(),
            "timeout-recovery": () => this.testTimeoutRecovery(),
            "memory-leaks": () => this.testMemoryLeaks(),
            "concurrent-mixed": () => this.testConcurrentMixedRequests(),
            "queue-overflow": () => this.testQueueOverflow(),
            "connection-disruption": () => this.testConnectionDisruption(),
            "performance-load": () => this.testPerformanceUnderLoad(),
        };

        const testMethod = testMethods[testName];
        if (!testMethod) {
            throw new Error(`Unknown test: ${testName}`);
        }

        console.log(`🧪 Running specific test: ${testName}`);
        this.monitor.startMonitoring(100);
        this.monitor.resetAll(); // Reset both metrics and alerts for clean test start

        try {
            const result = await testMethod();
            return {
                name: testName,
                status: "PASSED",
                result,
                metrics: this.monitor.getStatus(),
            };
        } catch (error) {
            return {
                name: testName,
                status: "FAILED",
                error: error.message,
            };
        } finally {
            this.monitor.stopMonitoring();
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.monitor.destroy();
    }
}

// Export singleton for easy use
export const mspStressTest = new MSPStressTest(window.MSP);
