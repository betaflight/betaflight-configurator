/**
 * MSP Debug Dashboard - Visual interface for monitoring MSP queue and running stress tests
 */

import { mspQueueMonitor } from "./msp_queue_monitor.js";
import { mspStressTest } from "./msp_stress_test.js";

export class MSPDebugDashboard {
    constructor() {
        this.isVisible = false;
        this.updateInterval = null;
        this.chartData = {
            queueSize: [],
            responseTime: [],
            timestamps: [],
        };
        this.maxDataPoints = 50;
        this.updatesPaused = false;
        this.pauseTimeout = null;
        this.lastUpdateData = {};

        this.createDashboard();
        this.setupEventListeners();
    }

    /**
     * Create the dashboard HTML structure
     */
    createDashboard() {
        // Create dashboard container
        this.container = document.createElement("div");
        this.container.id = "msp-debug-dashboard";
        this.container.innerHTML = `
            <div class="msp-dashboard-header">
                <h3>🔧 MSP Debug Dashboard</h3>
                <div class="dashboard-controls">
                    <button id="msp-toggle-monitoring">Start Monitoring</button>
                    <button id="msp-run-stress-test">Run Stress Test</button>
                    <button id="msp-clear-metrics">Clear Metrics</button>
                    <button id="msp-close-dashboard">×</button>
                </div>
                <div id="updates-status" class="updates-status" style="display: none;">⏸️ Updates Paused</div>
            </div>
            
            <div class="msp-dashboard-content">
                <!-- Status Overview -->
                <div class="status-section">
                    <h4>📊 Status Overview</h4>
                    <div class="status-grid">
                        <div class="status-item">
                            <label>Queue Size:</label>
                            <span id="queue-size" class="value">0</span>
                            <span class="max-value">/ <span id="max-queue-size">50</span></span>
                        </div>
                        <div class="status-item">
                            <label>Success Rate:</label>
                            <span id="success-rate" class="value">100%</span>
                        </div>
                        <div class="status-item">
                            <label>Avg Response:</label>
                            <span id="avg-response-time" class="value">0ms</span>
                        </div>
                        <div class="status-item">
                            <label>Total Requests:</label>
                            <span id="total-requests" class="value">0</span>
                        </div>
                    </div>
                </div>
                
                <!-- Alerts Section -->
                <div class="alerts-section">
                    <h4>🚨 Alerts</h4>
                    <div class="alerts-header">
                        <button id="clear-alerts" style="float: right; padding: 2px 6px; font-size: 10px; background: #666; color: white; border: none; border-radius: 2px; cursor: pointer;">Clear Alerts</button>
                    </div>
                    <div id="alerts-container" class="alerts-container">
                        <div class="no-alerts">No active alerts</div>
                    </div>
                </div>
                
                <!-- Queue Analysis -->
                <div class="queue-section">
                    <h4>📋 Queue Analysis</h4>
                    <div class="queue-controls">
                        <button id="analyze-queue">Analyze Current Queue</button>
                        <button id="export-report">Export Report</button>
                    </div>
                    <div id="queue-analysis" class="queue-analysis"></div>
                </div>
                
                <!-- Live Chart -->
                <div class="chart-section">
                    <h4>📈 Live Metrics</h4>
                    <canvas id="msp-metrics-chart"></canvas>
                </div>
                
                <!-- Request Details -->
                <div class="details-section">
                    <h4>🔍 Current Queue Contents</h4>
                    <div id="queue-contents" class="queue-contents"></div>
                </div>
                
                <!-- Test Results -->
                <div class="test-section">
                    <h4>🧪 Test Results</h4>
                    <div id="test-results" class="test-results"></div>
                </div>
            </div>
        `;

        // Add CSS styles
        this.addStyles();

        // Add to document but keep hidden initially
        document.body.appendChild(this.container);
        this.container.style.display = "none";
    }

    /**
     * Add CSS styles for the dashboard
     */
    addStyles() {
        const style = document.createElement("style");
        style.textContent = `
            #msp-debug-dashboard {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 500px;
                max-height: 80vh;
                background: #1e1e1e;
                color: #ffffff;
                border: 1px solid #444;
                border-radius: 8px;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                z-index: 10000;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            }
            
            .msp-dashboard-header {
                background: #2d2d2d;
                padding: 10px 15px;
                border-bottom: 1px solid #444;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .msp-dashboard-header h3 {
                margin: 0;
                font-size: 14px;
            }
            
            .dashboard-controls {
                display: flex;
                gap: 5px;
            }
            
            .dashboard-controls button {
                padding: 4px 8px;
                font-size: 11px;
                background: #444;
                color: white;
                border: 1px solid #666;
                border-radius: 3px;
                cursor: pointer;
            }
            
            .dashboard-controls button:hover {
                background: #555;
            }
            
            .updates-status {
                position: absolute;
                top: 50%;
                right: 160px;
                transform: translateY(-50%);
                font-size: 11px;
                color: #ffaa00;
                background: rgba(255, 170, 0, 0.15);
                padding: 3px 8px;
                border-radius: 3px;
                border: 1px solid #ffaa00;
                font-weight: bold;
                z-index: 10001;
            }
            
            .msp-dashboard-content {
                padding: 15px;
            }
            
            .status-section, .alerts-section, .queue-section, .chart-section, .details-section, .test-section {
                margin-bottom: 20px;
                border: 1px solid #333;
                border-radius: 4px;
                padding: 10px;
            }
            
            .status-section h4, .alerts-section h4, .queue-section h4, .chart-section h4, .details-section h4, .test-section h4 {
                margin: 0 0 10px 0;
                font-size: 13px;
                color: #ffd700;
            }
            
            .status-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
            }
            
            .status-item {
                background: #2a2a2a;
                padding: 8px;
                border-radius: 3px;
            }
            
            .status-item label {
                display: block;
                font-size: 11px;
                color: #ccc;
                margin-bottom: 3px;
            }
            
            .status-item .value {
                font-weight: bold;
                color: #00ff00;
            }
            
            .max-value {
                color: #888;
                font-size: 10px;
            }
            
            .alerts-container {
                min-height: 30px;
            }
            
            .alert-item {
                background: #ff4444;
                color: white;
                padding: 5px 10px;
                border-radius: 3px;
                margin-bottom: 5px;
                font-size: 11px;
            }
            
            .alert-item.warning {
                background: #ffaa00;
            }
            
            .no-alerts {
                color: #888;
                font-style: italic;
                text-align: center;
                padding: 10px;
            }
            
            .queue-controls {
                margin-bottom: 10px;
            }
            
            .queue-controls button {
                padding: 5px 10px;
                margin-right: 5px;
                background: #0066cc;
                color: white;
                border: none;
                border-radius: 3px;
                cursor: pointer;
                font-size: 11px;
            }
            
            .queue-controls button:hover {
                background: #0088ff;
            }
            
            .queue-analysis {
                background: #2a2a2a;
                padding: 10px;
                border-radius: 3px;
                font-size: 11px;
                max-height: 200px;
                overflow-y: auto;
                pointer-events: auto; /* Ensure clickability */
            }
            
            .queue-contents {
                background: #2a2a2a;
                padding: 10px;
                border-radius: 3px;
                max-height: 150px;
                overflow-y: auto;
                pointer-events: auto; /* Ensure clickability */
            }
            
            .queue-item {
                display: flex;
                justify-content: space-between;
                padding: 3px 0;
                border-bottom: 1px solid #333;
                font-size: 11px;
            }
            
            .queue-item:last-child {
                border-bottom: none;
            }
            
            .queue-item-empty {
                opacity: 0.3;
                font-style: italic;
            }
            
            .test-results {
                background: #2a2a2a;
                padding: 10px;
                border-radius: 3px;
                max-height: 200px;
                overflow-y: auto;
                font-size: 11px;
                pointer-events: auto; /* Ensure clickability */
            }
            
            .test-result-item {
                display: flex;
                justify-content: space-between;
                padding: 5px 0;
                border-bottom: 1px solid #333;
                cursor: pointer;
                min-height: 20px; /* Prevent height changes during updates */
            }
            
            .test-result-item:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            
            .test-result-item:last-child {
                border-bottom: none;
            }
            
            .test-passed {
                color: #00ff00;
            }
            
            .test-failed {
                color: #ff4444;
            }
            
            #msp-metrics-chart {
                width: 100%;
                height: 150px;
                background: #2a2a2a;
                border-radius: 3px;
                display: block;
            }
            
            .test-result-item {
                padding: 5px 10px;
                margin: 2px 0;
                border-radius: 3px;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: #1a1a1a;
                border: 1px solid #444;
                transition: all 0.2s ease;
                user-select: none;
            }
            
            .test-result-item:hover {
                background: #333 !important;
                border-color: #666;
                transform: translateX(2px);
            }
            
            .test-result-item:active {
                background: #444 !important;
                transform: translateX(0px);
            }
            
            .queue-item {
                padding: 5px;
                margin: 2px 0;
                background: #1a1a1a;
                border-radius: 3px;
                display: flex;
                justify-content: space-between;
                font-size: 11px;
                border: 1px solid #333;
            }
            
            .alert-item {
                padding: 5px 10px;
                margin: 2px 0;
                background: #4a2a2a;
                border-radius: 3px;
                border-left: 3px solid #ff4444;
                color: #ffcccc;
            }
            
            #updates-status {
                position: absolute;
                top: 5px;
                right: 50px;
                background: rgba(255, 165, 0, 0.9);
                color: #000;
                padding: 2px 8px;
                border-radius: 3px;
                font-size: 10px;
                font-weight: bold;
                display: none;
                z-index: 1001;
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Toggle monitoring
        document.addEventListener("click", (e) => {
            if (e.target.id === "msp-toggle-monitoring") {
                this.toggleMonitoring();
            } else if (e.target.id === "msp-run-stress-test") {
                this.runStressTest();
            } else if (e.target.id === "msp-clear-metrics") {
                this.clearMetrics();
            } else if (e.target.id === "clear-alerts") {
                this.clearAlerts();
            } else if (e.target.id === "msp-close-dashboard") {
                this.hide();
            } else if (e.target.id === "analyze-queue") {
                this.analyzeQueue();
            } else if (e.target.id === "export-report") {
                this.exportReport();
            }
        });

        // Enhanced interaction handling
        this.setupInteractionHandlers();

        // Listen to monitor events
        mspQueueMonitor.addListener((status) => {
            this.updateDisplay(status);
        });

        // Keyboard shortcut to toggle dashboard
        document.addEventListener("keydown", (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === "M") {
                this.toggle();
            }
        });

        // Handle window resize to redraw canvas with correct dimensions
        window.addEventListener("resize", () => {
            if (this.isVisible) {
                // Delay redraw to ensure layout is updated
                setTimeout(() => this.drawChart(), 100);
            }
        });
    }

    /**
     * Show the dashboard
     */
    show() {
        this.container.style.display = "block";
        this.isVisible = true;
        this.updateDisplay();
    }

    /**
     * Hide the dashboard
     */
    hide() {
        this.container.style.display = "none";
        this.isVisible = false;
    }

    /**
     * Toggle dashboard visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Setup enhanced interaction handlers
     */
    setupInteractionHandlers() {
        // Pause updates on any hover over interactive elements
        const interactiveSelectors = [
            ".test-results",
            ".queue-analysis",
            ".test-result-item",
            "button",
            "select",
            "input",
            ".queue-item",
            ".alert-item",
        ];

        interactiveSelectors.forEach((selector) => {
            this.container.addEventListener(
                "mouseenter",
                (e) => {
                    if (e.target.matches(selector) || e.target.closest(selector)) {
                        this.pauseUpdates(3000);
                    }
                },
                true,
            );
        });

        // Extended pause on clicks
        this.container.addEventListener("click", (e) => {
            const isInteractive = interactiveSelectors.some(
                (selector) => e.target.matches(selector) || e.target.closest(selector),
            );

            if (isInteractive) {
                this.pauseUpdates(5000); // Longer pause for clicks
            }
        });

        // Pause on focus for input elements
        this.container.addEventListener("focusin", (e) => {
            if (e.target.matches("input, select, textarea, button")) {
                this.pauseUpdates(10000); // Long pause for focused elements
            }
        });

        // Resume updates when focus is lost
        this.container.addEventListener("focusout", (e) => {
            // Check if focus moved to another element within the dashboard
            if (!this.container.contains(e.relatedTarget)) {
                this.pauseUpdates(1000); // Short pause before resuming
            }
        });

        // Special handling for test result items
        this.container.addEventListener(
            "mouseenter",
            (e) => {
                if (e.target.closest(".test-result-item")) {
                    e.target.style.backgroundColor = "#333";
                    this.pauseUpdates(2000);
                }
            },
            true,
        );

        this.container.addEventListener(
            "mouseleave",
            (e) => {
                if (e.target.closest(".test-result-item")) {
                    e.target.style.backgroundColor = "";
                }
            },
            true,
        );
    }

    /**
     * Toggle monitoring
     */
    toggleMonitoring() {
        const button = document.getElementById("msp-toggle-monitoring");

        if (mspQueueMonitor.isMonitoring) {
            mspQueueMonitor.stopMonitoring();
            button.textContent = "Start Monitoring";
            button.style.background = "#444";
        } else {
            mspQueueMonitor.startMonitoring(500);
            button.textContent = "Stop Monitoring";
            button.style.background = "#00aa00";
        }
    }

    /**
     * Run stress test
     */
    async runStressTest() {
        const button = document.getElementById("msp-run-stress-test");
        const originalText = button.textContent;

        button.textContent = "Running Tests...";
        button.disabled = true;

        try {
            const results = await mspStressTest.runStressTestSuite();
            this.displayTestResults(results);
        } catch (error) {
            console.error("Stress test failed:", error);
            this.displayTestResults({
                summary: { failed: 1, error: error.message },
                detailedResults: [],
            });
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    /**
     * Clear metrics
     */
    clearMetrics() {
        mspQueueMonitor.resetMetrics();
        this.chartData = {
            queueSize: [],
            responseTime: [],
            timestamps: [],
        };
        this.updateDisplay();
    }

    /**
     * Clear alerts only
     */
    clearAlerts() {
        mspQueueMonitor.clearAlerts();
    }

    /**
     * Update display with current status
     */
    updateDisplay(status = null) {
        if (!this.isVisible || this.updatesPaused) {
            return;
        }

        status = status || mspQueueMonitor.getStatus();

        // Only update if data has actually changed to avoid unnecessary DOM manipulation
        if (this._hasDataChanged(status)) {
            this._updateStatusMetrics(status);
            this._updateAlertsIfChanged(status.alerts);
            this._updateQueueContentsIfChanged(status.queueContents);
            this._updateChart(status);

            // Store current data for comparison
            this.lastUpdateData = {
                currentQueueSize: status.currentQueueSize,
                totalRequests: status.metrics.totalRequests,
                successRate: status.metrics.successRate,
                avgResponseTime: status.metrics.avgResponseTime,
                alerts: JSON.stringify(status.alerts),
                queueContents: JSON.stringify(status.queueContents),
            };
        }
    }

    /**
     * Check if data has changed to avoid unnecessary updates
     */
    _hasDataChanged(status) {
        const lastData = this.lastUpdateData;
        return (
            !lastData ||
            lastData.currentQueueSize !== status.currentQueueSize ||
            lastData.totalRequests !== status.metrics.totalRequests ||
            lastData.successRate !== status.metrics.successRate ||
            lastData.avgResponseTime !== status.metrics.avgResponseTime ||
            lastData.alerts !== JSON.stringify(status.alerts) ||
            lastData.queueContents !== JSON.stringify(status.queueContents)
        );
    }

    /**
     * Update status metrics only
     */
    _updateStatusMetrics(status) {
        this.updateElement("queue-size", status.currentQueueSize);
        this.updateElement("max-queue-size", status.maxQueueSize);
        this.updateElement("success-rate", `${Math.round((status.metrics.successRate || 0) * 100)}%`);
        this.updateElement("avg-response-time", `${Math.round(status.metrics.avgResponseTime || 0)}ms`);
        this.updateElement("total-requests", status.metrics.totalRequests);
    }

    /**
     * Update alerts only if they've changed
     */
    _updateAlertsIfChanged(alerts) {
        const currentAlerts = JSON.stringify(alerts);
        if (this.lastUpdateData.alerts !== currentAlerts) {
            this.updateAlerts(alerts);
        }
    }

    /**
     * Update queue contents only if they've changed
     */
    _updateQueueContentsIfChanged(queueContents) {
        const currentQueue = JSON.stringify(queueContents);
        if (this.lastUpdateData.queueContents !== currentQueue) {
            this.updateQueueContents(queueContents);
        }
    }

    /**
     * Pause updates for a specified duration
     */
    pauseUpdates(duration = 2000) {
        this.updatesPaused = true;

        // Show pause indicator
        const pauseIndicator = document.getElementById("updates-status");
        if (pauseIndicator) {
            pauseIndicator.style.display = "block";
        }

        if (this.pauseTimeout) {
            clearTimeout(this.pauseTimeout);
        }

        this.pauseTimeout = setTimeout(() => {
            this.updatesPaused = false;

            // Hide pause indicator
            if (pauseIndicator) {
                pauseIndicator.style.display = "none";
            }

            // Force an update when resuming
            this.updateDisplay();
        }, duration);
    }

    /**
     * Update element text content
     */
    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    /**
     * Update alerts display
     */
    updateAlerts(alerts) {
        const container = document.getElementById("alerts-container");
        if (!container) {
            return;
        }

        const activeAlerts = Object.entries(alerts).filter(([_, active]) => active);

        if (activeAlerts.length === 0) {
            container.innerHTML = '<div class="no-alerts">No active alerts</div>';
            return;
        }

        const alertMessages = {
            queueFull: "Queue is near capacity",
            highTimeout: "High timeout rate detected",
            slowResponses: "Slow response times detected",
            memoryLeak: "Potential memory leak detected",
        };

        container.innerHTML = activeAlerts
            .map(([alertType, _]) => `<div class="alert-item">${alertMessages[alertType] || alertType}</div>`)
            .join("");
    }

    /**
     * Update queue contents display
     */
    updateQueueContents(queueContents) {
        const container = document.getElementById("queue-contents");
        if (!container) {
            return;
        }

        // Always show exactly 5 slots to prevent layout shifts
        const maxSlots = 5;
        const items = queueContents || [];
        const slotsHtml = [];

        // Add actual queue items
        for (let i = 0; i < maxSlots; i++) {
            if (i < items.length) {
                const item = items[i];
                slotsHtml.push(`
                    <div class="queue-item">
                        <span>Code: ${item.code}</span>
                        <span>Age: ${Math.round(item.age)}ms</span>
                        <span>Attempts: ${item.attempts}</span>
                        <span style="color: ${item.hasTimer ? "#00ff00" : "#ff4444"}">${item.hasTimer ? "✓" : "✗"}</span>
                    </div>
                `);
            } else {
                // Add empty slot placeholder
                slotsHtml.push(`
                    <div class="queue-item queue-item-empty">
                        <span style="color: #555;">—</span>
                        <span style="color: #555;">—</span>
                        <span style="color: #555;">—</span>
                        <span style="color: #555;">—</span>
                    </div>
                `);
            }
        }

        container.innerHTML = slotsHtml.join("");
    }

    /**
     * Update chart with new data
     */
    _updateChart(status) {
        this.updateChart(status);
    }

    /**
     * Update chart with new data
     */
    updateChart(status) {
        const now = Date.now();
        this.chartData.timestamps.push(now);
        this.chartData.queueSize.push(status.currentQueueSize);
        this.chartData.responseTime.push(status.metrics.avgResponseTime || 0);

        // Keep only recent data points
        if (this.chartData.timestamps.length > this.maxDataPoints) {
            this.chartData.timestamps.shift();
            this.chartData.queueSize.shift();
            this.chartData.responseTime.shift();
        }

        this.drawChart();
    }

    /**
     * Draw the metrics chart
     */
    drawChart() {
        const canvas = document.getElementById("msp-metrics-chart");
        if (!canvas) {
            return;
        }

        const ctx = canvas.getContext("2d");

        // Get the display size (CSS pixels)
        const rect = canvas.getBoundingClientRect();
        const displayWidth = rect.width;
        const displayHeight = rect.height;

        // Get the device pixel ratio, falling back to 1
        const devicePixelRatio = window.devicePixelRatio || 1;

        // Set the internal canvas size to actual pixels for Hi-DPI displays
        canvas.width = displayWidth * devicePixelRatio;
        canvas.height = displayHeight * devicePixelRatio;

        // Scale the canvas back down using CSS
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        // Scale the drawing context so everything draws at the correct size
        ctx.scale(devicePixelRatio, devicePixelRatio);

        const width = displayWidth;
        const height = displayHeight;

        // Clear canvas
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(0, 0, width, height);

        if (this.chartData.timestamps.length < 2) {
            return;
        }

        // Draw queue size line
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 2;
        ctx.beginPath();

        const maxQueueSize = Math.max(...this.chartData.queueSize, 10);

        this.chartData.queueSize.forEach((size, i) => {
            const x = (i / (this.chartData.queueSize.length - 1)) * width;
            const y = height - (size / maxQueueSize) * height;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Draw labels with proper font scaling
        ctx.fillStyle = "#ffffff";
        ctx.font = "10px monospace";
        ctx.fillText("Queue Size", 5, 15);
        ctx.fillText(`Max: ${maxQueueSize}`, 5, height - 5);
    }

    /**
     * Analyze current queue
     */
    analyzeQueue() {
        const analysis = mspQueueMonitor.analyzeQueue();
        const container = document.getElementById("queue-analysis");

        if (!container) {
            return;
        }

        container.innerHTML = `
            <div><strong>Total Items:</strong> ${analysis.totalItems}</div>
            <div><strong>Age Distribution:</strong></div>
            <div style="margin-left: 10px;">
                Fresh (&lt;1s): ${analysis.ageDistribution.fresh}<br>
                Recent (1-5s): ${analysis.ageDistribution.recent}<br>
                Stale (5-10s): ${analysis.ageDistribution.stale}<br>
                Ancient (&gt;10s): ${analysis.ageDistribution.ancient}
            </div>
            <div><strong>By Code:</strong></div>
            <div style="margin-left: 10px;">
                ${Object.entries(analysis.byCode)
        .map(([code, count]) => `Code ${code}: ${count}`)
        .join("<br>")}
            </div>
            ${
    analysis.potentialIssues.length > 0
        ? `
                <div><strong>Issues:</strong></div>
                <div style="margin-left: 10px; color: #ff4444;">
                    ${analysis.potentialIssues.join("<br>")}
                </div>
            `
        : ""
}
        `;
    }

    /**
     * Display test results
     */
    displayTestResults(results) {
        const container = document.getElementById("test-results");
        if (!container) {
            return;
        }

        const summary = results.summary || {};

        container.innerHTML = `
            <div><strong>Test Summary:</strong></div>
            <div style="margin-left: 10px;">
                Passed: <span class="test-passed">${summary.passed || 0}</span><br>
                Failed: <span class="test-failed">${summary.failed || 0}</span><br>
                Success Rate: ${Math.round((summary.successRate || 0) * 100)}%<br>
                Grade: ${summary.overallGrade || "N/A"}
            </div>
            <div style="margin-top: 10px;"><strong>Details (click for more info):</strong></div>
            <div style="margin-left: 10px;">
                ${(results.detailedResults || [])
        .map(
            (test, index) => `
                    <div class="test-result-item" data-test-index="${index}" onclick="window.MSPDebug.showTestDetails(${index})">
                        <span class="${test.status === "PASSED" ? "test-passed" : "test-failed"}">
                            ${test.name}
                        </span>
                        <span>${test.status}</span>
                    </div>
                `,
        )
        .join("")}
            </div>
        `;

        // Store test results for detailed view
        this.lastTestResults = results;
    }

    /**
     * Show detailed test information
     */
    showTestDetails(testIndex) {
        if (!this?.lastTestResults?.detailedResults) {
            return;
        }

        const test = this.lastTestResults.detailedResults[testIndex];
        if (!test) {
            return;
        }

        // Pause updates while showing details
        this.pauseUpdates(5000);

        const detailsHtml = `
            <div style="background: #1a1a1a; padding: 15px; border-radius: 5px; margin: 10px 0;">
                <h4 style="color: #ffd700; margin: 0 0 10px 0;">📋 ${test.name} Details</h4>
                <div><strong>Status:</strong> <span class="${test.status === "PASSED" ? "test-passed" : "test-failed"}">${test.status}</span></div>
                ${test.duration ? `<div><strong>Duration:</strong> ${Math.round(test.duration)}ms</div>` : ""}
                ${test.error ? `<div><strong>Error:</strong> <span style="color: #ff4444;">${test.error}</span></div>` : ""}
                ${
    test.result
        ? `
                    <div style="margin-top: 10px;"><strong>Results:</strong></div>
                    <pre style="background: #000; padding: 10px; border-radius: 3px; font-size: 10px; overflow-x: auto;">${JSON.stringify(test.result, null, 2)}</pre>
                `
        : ""
}
                ${
    test.metrics
        ? `
                    <div style="margin-top: 10px;"><strong>Metrics:</strong></div>
                    <div style="margin-left: 10px;">
                        Queue Size: ${test.metrics.currentQueueSize}/${test.metrics.maxQueueSize}<br>
                        Total Requests: ${test.metrics.metrics.totalRequests}<br>
                        Success Rate: ${Math.round((test.metrics.metrics.successRate || 0) * 100)}%<br>
                        Avg Response: ${Math.round(test.metrics.metrics.avgResponseTime || 0)}ms
                    </div>
                `
        : ""
}
                <button onclick="this.parentElement.remove(); window.MSPDebug.dashboard.pauseUpdates(1000);" 
                        style="margin-top: 10px; padding: 5px 10px; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer;">
                    Close Details
                </button>
            </div>
        `;

        // Add details after the test results
        const testContainer = document.getElementById("test-results");
        const existingDetails = testContainer.querySelector(".test-details");
        if (existingDetails) {
            existingDetails.remove();
        }

        const detailsDiv = document.createElement("div");
        detailsDiv.className = "test-details";
        detailsDiv.innerHTML = detailsHtml;
        testContainer.appendChild(detailsDiv);
    }

    /**
     * Export comprehensive report
     */
    exportReport() {
        const report = mspQueueMonitor.generateReport();
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
    }
}

// Create and export dashboard instance
export const mspDebugDashboard = new MSPDebugDashboard();

// Add global shortcut and console commands
window.MSPDebug = {
    dashboard: mspDebugDashboard,
    monitor: mspQueueMonitor,
    stressTest: mspStressTest,

    // Convenience methods
    show: () => mspDebugDashboard.show(),
    hide: () => mspDebugDashboard.hide(),
    startMonitoring: () => mspQueueMonitor.startMonitoring(),
    stopMonitoring: () => mspQueueMonitor.stopMonitoring(),
    runTests: () => mspStressTest.runStressTestSuite(),
    runFullSuite: () => mspStressTest.runStressTestSuite(),
    analyze: () => mspQueueMonitor.analyzeQueue(),
    report: () => mspQueueMonitor.generateReport(),
    showTestDetails: (index) => mspDebugDashboard.showTestDetails(index),

    // Individual test methods
    runTest: (testName) => mspStressTest.runSpecificTest(testName),
    quickHealthCheck: () => window.MSPTestRunner.quickHealthCheck(),
    stressScenario: (scenario) => window.MSPTestRunner.stressScenario(scenario),
    getStatus: () => mspQueueMonitor.getStatus(),

    // Alert testing methods
    triggerTestAlerts: () => mspQueueMonitor.triggerTestAlerts(),
    setTestThresholds: () => mspQueueMonitor.setTestThresholds(),
    setNormalThresholds: () => mspQueueMonitor.setNormalThresholds(),

    // Quick test method
    testAlerts: () => {
        console.log("🧪 Running alert test...");
        mspDebugDashboard.show();
        mspQueueMonitor.startMonitoring(500);
        return mspQueueMonitor.triggerTestAlerts();
    },
};

console.log("🔧 MSP Debug Tools loaded! Use Ctrl+Shift+M to toggle dashboard or MSPDebug.show()");
