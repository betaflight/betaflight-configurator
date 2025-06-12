/**
 * MSP Queue Monitor - Real-time monitoring of MSP message queue
 * Provides insights into queue health, performance metrics, and potential issues
 */

export class MSPQueueMonitor {
    constructor(mspInstance) {
        this.msp = mspInstance;
        this.isMonitoring = false;
        this.metrics = {
            totalRequests: 0,
            completedRequests: 0,
            failedRequests: 0,
            timeouts: 0,
            duplicates: 0,
            avgResponseTime: 0,
            maxResponseTime: 0,
            queuePeakSize: 0,
            requestsByCode: new Map(),
            responseTimes: [],
            errorsByType: new Map(),
        };

        this.alerts = {
            queueFull: false,
            highTimeout: false,
            slowResponses: false,
            memoryLeak: false,
        };

        this.thresholds = {
            maxQueueSize: Math.floor((this.msp.MAX_QUEUE_SIZE || 50) * 0.8), // Alert when queue > 80% of MAX_QUEUE_SIZE
            maxAvgResponseTime: 2000, // Alert when avg response > 2s
            maxTimeoutRate: 0.1, // Alert when timeout rate > 10%
            memoryLeakThreshold: 100, // Alert when callbacks grow beyond expected
        };

        this.monitoringInterval = null;
        this.listeners = [];

        // Hook into MSP methods to collect metrics
        this._hookMSPMethods();
    }

    /**
     * Hook into MSP methods to collect real-time metrics
     */
    _hookMSPMethods() {
        // Check if MSP instance is already instrumented to prevent double-patching
        if (this.msp._mspQueueMonitorInstrumented) {
            console.warn("MSP instance is already instrumented by MSPQueueMonitor");
            return;
        }

        // Store original methods
        this.originalSendMessage = this.msp.send_message.bind(this.msp);
        this.originalDispatchMessage = this.msp._dispatch_message.bind(this.msp);
        this.originalRemoveRequest = this.msp._removeRequestFromCallbacks?.bind(this.msp);

        // Override send_message to track requests
        this.msp.send_message = (...args) => {
            this._trackRequestStart(args[0], args[1]);
            return this.originalSendMessage(...args);
        };

        // Override _dispatch_message to track responses
        this.msp._dispatch_message = (...args) => {
            this._trackResponse();
            return this.originalDispatchMessage(...args);
        };

        // Override _removeRequestFromCallbacks to track completions
        if (this.originalRemoveRequest) {
            this.msp._removeRequestFromCallbacks = (requestObj) => {
                this._trackRequestCompletion(requestObj);
                return this.originalRemoveRequest(requestObj);
            };
        }

        // Mark MSP instance as instrumented
        this.msp._mspQueueMonitorInstrumented = true;
    }

    /**
     * Track when a request starts
     */
    _trackRequestStart(code, data) {
        this.metrics.totalRequests++;

        // Track requests by code
        const count = this.metrics.requestsByCode.get(code) || 0;
        this.metrics.requestsByCode.set(code, count + 1);

        // Check for queue size peaks
        const currentQueueSize = this.msp.callbacks?.length ?? 0;
        if (currentQueueSize > this.metrics.queuePeakSize) {
            this.metrics.queuePeakSize = currentQueueSize;
        }

        this._checkAlerts();
    }

    /**
     * Track when a response is received
     */
    _trackResponse() {
        // This will be called for both successful and failed responses
        // More detailed tracking happens in _trackRequestCompletion
    }

    /**
     * Track when a request is completed (success or failure)
     */
    _trackRequestCompletion(requestObj) {
        if (!requestObj) {
            return;
        }

        const responseTime = performance.now() - requestObj.start;
        this.metrics.responseTimes.push(responseTime);

        // Keep only last 100 response times for rolling average
        if (this.metrics.responseTimes.length > 100) {
            this.metrics.responseTimes.shift();
        }

        // Update max response time
        if (responseTime > this.metrics.maxResponseTime) {
            this.metrics.maxResponseTime = responseTime;
        }

        // Calculate average response time
        this.metrics.avgResponseTime =
            this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length;

        // Track completion type
        if (requestObj.attempts > 1) {
            this.metrics.timeouts += requestObj.attempts - 1;
        }

        if (requestObj.success === false) {
            this.metrics.failedRequests++;

            // Track error types
            const errorType = requestObj.errorType || "unknown";
            const errorCount = this.metrics.errorsByType.get(errorType) || 0;
            this.metrics.errorsByType.set(errorType, errorCount + 1);
        } else {
            this.metrics.completedRequests++;
        }

        this._checkAlerts();
    }

    /**
     * Check for alert conditions
     */
    _checkAlerts() {
        const queueSize = this.msp.callbacks?.length ?? 0;

        // Queue full alert
        const wasQueueFull = this.alerts.queueFull;
        this.alerts.queueFull = queueSize > this.thresholds.maxQueueSize;

        // High timeout rate alert
        const timeoutRate = this.metrics.totalRequests > 0 ? this.metrics.timeouts / this.metrics.totalRequests : 0;
        const wasHighTimeout = this.alerts.highTimeout;
        this.alerts.highTimeout = timeoutRate > this.thresholds.maxTimeoutRate;

        // Slow responses alert
        const wasSlowResponses = this.alerts.slowResponses;
        this.alerts.slowResponses = this.metrics.avgResponseTime > this.thresholds.maxAvgResponseTime;

        // Memory leak detection (callbacks not being cleaned up)
        const wasMemoryLeak = this.alerts.memoryLeak;
        this.alerts.memoryLeak = queueSize > this.thresholds.memoryLeakThreshold;

        // Debug logging for alert changes (only when alerts become active)
        if (this.alerts.queueFull !== wasQueueFull && this.alerts.queueFull) {
            console.warn(`🚨 Queue Full Alert: size ${queueSize}/${this.thresholds.maxQueueSize}`);
        }
        if (this.alerts.highTimeout !== wasHighTimeout && this.alerts.highTimeout) {
            console.warn(`⏱️ High Timeout Alert: rate ${(timeoutRate * 100).toFixed(1)}%`);
        }
        if (this.alerts.slowResponses !== wasSlowResponses && this.alerts.slowResponses) {
            console.warn(`🐌 Slow Response Alert: avg ${this.metrics.avgResponseTime}ms`);
        }
        if (this.alerts.memoryLeak !== wasMemoryLeak && this.alerts.memoryLeak) {
            console.warn(`💾 Memory Leak Alert: callbacks ${queueSize}`);
        }

        // Notify listeners of alerts
        this._notifyListeners();
    }

    /**
     * Start monitoring
     */
    startMonitoring(intervalMs = 1000) {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        this.monitoringInterval = setInterval(() => {
            this._collectMetrics();
            this._notifyListeners();
        }, intervalMs);

        console.log("MSP Queue Monitor started");
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        console.log("MSP Queue Monitor stopped");
    }

    /**
     * Collect current metrics snapshot
     */
    _collectMetrics() {
        // Update current queue size
        this.currentQueueSize = this.msp.callbacks.length;

        // Calculate success rate
        this.metrics.successRate =
            this.metrics.totalRequests > 0 ? this.metrics.completedRequests / this.metrics.totalRequests : 0;

        // Calculate timeout rate
        this.metrics.timeoutRate =
            this.metrics.totalRequests > 0 ? this.metrics.timeouts / this.metrics.totalRequests : 0;
    }

    /**
     * Get current status report
     */
    getStatus() {
        return {
            isMonitoring: this.isMonitoring,
            currentQueueSize: this.msp.callbacks.length,
            maxQueueSize: this.msp.MAX_QUEUE_SIZE || 50,
            metrics: { ...this.metrics },
            alerts: { ...this.alerts },
            queueContents: this.msp.callbacks.map((req) => ({
                code: req.code,
                attempts: req.attempts || 0,
                age: performance.now() - req.start,
                hasTimer: !!req.timer,
            })),
        };
    }

    /**
     * Get detailed queue analysis
     */
    analyzeQueue() {
        const callbacks = this.msp.callbacks;
        const now = performance.now();

        const analysis = {
            totalItems: callbacks.length,
            byCode: {},
            ageDistribution: {
                fresh: 0, // < 1s
                recent: 0, // 1-5s
                stale: 0, // 5-10s
                ancient: 0, // > 10s
            },
            retryDistribution: {
                firstAttempt: 0,
                retrying: 0,
                multipleRetries: 0,
            },
            potentialIssues: [],
        };

        callbacks.forEach((req) => {
            // Group by code
            if (!analysis.byCode[req.code]) {
                analysis.byCode[req.code] = 0;
            }
            analysis.byCode[req.code]++;

            // Age analysis
            const age = now - req.start;
            if (age < 1000) {
                analysis.ageDistribution.fresh++;
            } else if (age < 5000) {
                analysis.ageDistribution.recent++;
            } else if (age < 10000) {
                analysis.ageDistribution.stale++;
            } else {
                analysis.ageDistribution.ancient++;
            }

            // Retry analysis
            const attempts = req.attempts || 0;
            if (attempts === 0) {
                analysis.retryDistribution.firstAttempt++;
            } else if (attempts === 1) {
                analysis.retryDistribution.retrying++;
            } else {
                analysis.retryDistribution.multipleRetries++;
            }

            // Identify potential issues
            if (age > 10000) {
                analysis.potentialIssues.push(`Ancient request: code ${req.code}, age ${Math.round(age / 1000)}s`);
            }
            if (attempts > 5) {
                analysis.potentialIssues.push(`High retry count: code ${req.code}, attempts ${attempts}`);
            }
            if (!req.timer) {
                analysis.potentialIssues.push(`Missing timer: code ${req.code}`);
            }
        });

        return analysis;
    }

    /**
     * Add a listener for monitoring events
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * Remove a listener
     */
    removeListener(callback) {
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * Notify all listeners
     */
    _notifyListeners() {
        const status = this.getStatus();
        this.listeners.forEach((listener) => {
            try {
                listener(status);
            } catch (error) {
                console.error("Error in MSP monitor listener:", error);
            }
        });
    }

    /**
     * Reset metrics only (keep alerts intact)
     */
    resetMetrics() {
        this.metrics = {
            totalRequests: 0,
            completedRequests: 0,
            failedRequests: 0,
            timeouts: 0,
            duplicates: 0,
            avgResponseTime: 0,
            maxResponseTime: 0,
            queuePeakSize: 0,
            requestsByCode: new Map(),
            responseTimes: [],
            errorsByType: new Map(),
        };

        // Note: Alerts are NOT reset here - they should only be cleared when conditions are no longer true
        // or when explicitly requested via clearAlerts() method
    }

    /**
     * Clear alerts (separate from metrics)
     */
    clearAlerts() {
        console.log("🔄 Clearing all alerts...");
        this.alerts = {
            queueFull: false,
            highTimeout: false,
            slowResponses: false,
            memoryLeak: false,
        };
        this._notifyListeners();
    }

    /**
     * Reset both metrics and alerts (complete reset)
     */
    resetAll() {
        this.resetMetrics();
        this.clearAlerts();
    }

    /**
     * Generate a detailed report
     */
    generateReport() {
        const status = this.getStatus();
        const analysis = this.analyzeQueue();

        return {
            timestamp: new Date().toISOString(),
            summary: {
                queueHealth: this._assessQueueHealth(),
                performanceGrade: this._calculatePerformanceGrade(),
                recommendations: this._generateRecommendations(),
            },
            status,
            analysis,
            rawMetrics: this.metrics,
        };
    }

    /**
     * Assess overall queue health
     */
    _assessQueueHealth() {
        const alerts = Object.values(this.alerts);
        const activeAlerts = alerts.filter((alert) => alert).length;

        if (activeAlerts === 0) {
            return "HEALTHY";
        }
        if (activeAlerts <= 2) {
            return "WARNING";
        }
        return "CRITICAL";
    }

    /**
     * Calculate performance grade
     */
    _calculatePerformanceGrade() {
        let score = 100;

        // Deduct for high timeout rate
        if (this.metrics.timeoutRate > 0.1) {
            score -= 30;
        } else if (this.metrics.timeoutRate > 0.05) {
            score -= 15;
        }

        // Deduct for slow responses
        if (this.metrics.avgResponseTime > 2000) {
            score -= 25;
        } else if (this.metrics.avgResponseTime > 1000) {
            score -= 10;
        }

        // Deduct for queue size issues
        const currentQueueSize = this.currentQueueSize || (this.msp.callbacks?.length ?? 0);
        const queueRatio = currentQueueSize / (this.msp.MAX_QUEUE_SIZE || 50);
        if (queueRatio > 0.8) {
            score -= 20;
        } else if (queueRatio > 0.6) {
            score -= 10;
        }

        // Deduct for failed requests
        const failureRate =
            this.metrics.totalRequests > 0 ? this.metrics.failedRequests / this.metrics.totalRequests : 0;
        if (failureRate > 0.05) {
            score -= 15;
        }

        if (score >= 90) {
            return "A";
        }
        if (score >= 80) {
            return "B";
        }
        if (score >= 70) {
            return "C";
        }
        if (score >= 60) {
            return "D";
        }
        return "F";
    }

    /**
     * Generate recommendations
     */
    _generateRecommendations() {
        const recommendations = [];

        if (this.alerts.queueFull) {
            recommendations.push(
                "Queue is near capacity. Consider implementing request prioritization or increasing queue size.",
            );
        }

        if (this.alerts.highTimeout) {
            recommendations.push(
                "High timeout rate detected. Check serial connection stability or increase timeout values.",
            );
        }

        if (this.alerts.slowResponses) {
            recommendations.push(
                "Slow response times detected. Investigate flight controller performance or reduce request frequency.",
            );
        }

        if (this.alerts.memoryLeak) {
            recommendations.push(
                "Potential memory leak detected. Check that all requests are being properly cleaned up.",
            );
        }

        if (this.metrics.maxResponseTime > 5000) {
            recommendations.push(
                "Some requests are taking very long to complete. Consider implementing request timeouts.",
            );
        }

        return recommendations;
    }

    /**
     * Test the alert system by manually triggering alerts
     */
    triggerTestAlerts() {
        console.log("🧪 Triggering test alerts...");

        // Store original alerts
        const originalAlerts = { ...this.alerts };

        // Trigger all alerts
        this.alerts.queueFull = true;
        this.alerts.highTimeout = true;
        this.alerts.slowResponses = true;
        this.alerts.memoryLeak = true;

        console.log("🚨 Test alerts triggered:", this.alerts);

        // Notify listeners immediately
        this._notifyListeners();

        // Reset after 10 seconds
        setTimeout(() => {
            this.alerts = originalAlerts;
            console.log("✅ Test alerts reset");
            this._notifyListeners();
        }, 10000);

        return this.alerts;
    }

    /**
     * Lower alert thresholds for testing
     */
    setTestThresholds() {
        console.log("🎯 Setting test thresholds for easier alert triggering...");
        this.thresholds = {
            maxQueueSize: 1, // Alert when queue > 1
            maxAvgResponseTime: 100, // Alert when avg response > 100ms
            maxTimeoutRate: 0.01, // Alert when timeout rate > 1%
            memoryLeakThreshold: 5, // Alert when callbacks > 5
        };
        console.log("New thresholds:", this.thresholds);
    }

    /**
     * Reset to normal thresholds
     */
    setNormalThresholds() {
        console.log("🔧 Resetting to normal thresholds...");
        this.thresholds = {
            maxQueueSize: Math.floor((this.msp.MAX_QUEUE_SIZE || 50) * 0.8), // Alert when queue > 80% of MAX_QUEUE_SIZE
            maxAvgResponseTime: 2000, // Alert when avg response > 2s
            maxTimeoutRate: 0.1, // Alert when timeout rate > 10%
            memoryLeakThreshold: 100, // Alert when callbacks grow beyond expected
        };
        console.log("Normal thresholds restored:", this.thresholds);
    }

    /**
     * Cleanup and restore original MSP methods
     */
    destroy() {
        this.stopMonitoring();

        // Restore original methods
        if (this.originalSendMessage) {
            this.msp.send_message = this.originalSendMessage;
        }
        if (this.originalDispatchMessage) {
            this.msp._dispatch_message = this.originalDispatchMessage;
        }
        if (this.originalRemoveRequest) {
            this.msp._removeRequestFromCallbacks = this.originalRemoveRequest;
        }

        // Clear instrumentation flag
        this.msp._mspQueueMonitorInstrumented = undefined;

        this.listeners = [];

        // Clear the singleton instance to allow creating a fresh monitor later
        _mspQueueMonitorInstance = null;
    }
}

// Lazy initialization to avoid errors when window.MSP is not yet available
let _mspQueueMonitorInstance = null;

export const mspQueueMonitor = {
    get instance() {
        if (!_mspQueueMonitorInstance) {
            if (typeof window === "undefined" || !window.MSP) {
                throw new Error(
                    "MSP Queue Monitor: window.MSP is not available. Make sure MSP is loaded before using the monitor.",
                );
            }
            _mspQueueMonitorInstance = new MSPQueueMonitor(window.MSP);
        }
        return _mspQueueMonitorInstance;
    },

    // Proxy all methods to the lazy-initialized instance
    startMonitoring(...args) {
        return this.instance.startMonitoring(...args);
    },
    stopMonitoring(...args) {
        return this.instance.stopMonitoring(...args);
    },
    getStatus(...args) {
        return this.instance.getStatus(...args);
    },
    analyzeQueue(...args) {
        return this.instance.analyzeQueue(...args);
    },
    addListener(...args) {
        return this.instance.addListener(...args);
    },
    removeListener(...args) {
        return this.instance.removeListener(...args);
    },
    resetMetrics(...args) {
        return this.instance.resetMetrics(...args);
    },
    clearAlerts(...args) {
        return this.instance.clearAlerts(...args);
    },
    resetAll(...args) {
        return this.instance.resetAll(...args);
    },
    generateReport(...args) {
        return this.instance.generateReport(...args);
    },
    triggerTestAlerts(...args) {
        return this.instance.triggerTestAlerts(...args);
    },
    setTestThresholds(...args) {
        return this.instance.setTestThresholds(...args);
    },
    setNormalThresholds(...args) {
        return this.instance.setNormalThresholds(...args);
    },
    destroy(...args) {
        return this.instance.destroy(...args);
    },

    // Getters for properties
    get isMonitoring() {
        return this.instance.isMonitoring;
    },
    get metrics() {
        return this.instance.metrics;
    },
    get alerts() {
        return this.instance.alerts;
    },
    get thresholds() {
        return this.instance.thresholds;
    },
};
