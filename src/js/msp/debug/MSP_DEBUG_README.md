# MSP Debug Tools

Comprehensive monitoring and stress testing tools for the MSP (MultiWii Serial Protocol) implementation in Betaflight Configurator.

## Features

🔍 **Real-time Queue Monitoring**
- Track queue size, response times, and success rates
- Detect memory leaks and performance bottlenecks
- Alert system for potential issues

🧪 **Comprehensive Stress Testing**
- Queue flooding tests
- Timeout recovery validation
- Memory leak detection
- Performance under load testing

📊 **Visual Dashboard**
- Real-time metrics display with smart updates
- Live charts and graphs
- Queue analysis tools
- Test result visualization
- **Interactive-friendly updates**: Dashboard pauses updates during user interactions
- **Clickable test results**: Click on any test result for detailed information
- Visual pause indicators when updates are suspended

⚡ **Easy-to-use API**
- Console commands for quick testing
- Programmable test scenarios
- Detailed reporting and export

## Quick Start

### 1. Load the Debug Tools

Include the debug tools in your page:

```javascript
import './src/js/msp/debug/msp_debug_tools.js';
```

Or in development, load via console:
```javascript
import('./src/js/msp/debug/msp_debug_tools.js');
```

### 2. Basic Usage

**Start monitoring:**
```javascript
MSPDebug.startMonitoring();
```

**Show visual dashboard:**
```javascript
MSPDebug.show();
// Or press Ctrl+Shift+M
```

**Quick test of alert system:**
```javascript
MSPDebug.testAlerts();
```

**Run stress tests:**
```javascript
// Run specific test
MSPDebug.runTests();

// Run complete stress test suite with detailed console output
MSPDebug.runFullSuite();

// Run individual test by name
MSPDebug.runTest('queue-flooding');

// Quick health check
MSPDebug.quickHealthCheck();

// Run stress scenario
MSPDebug.stressScenario('high-frequency');
```

## Available Commands

The MSP Debug Tools provide two APIs:
- **MSPDebug**: Modern, simplified API (recommended)
- **MSPTestRunner**: Legacy API with additional methods

Both APIs provide the same core functionality. Use `MSPDebug` for new code.

### Monitoring Commands

| Command | Description |
|---------|-------------|
| `MSPDebug.startMonitoring()` | Start monitoring with console output |
| `MSPDebug.stopMonitoring()` | Stop monitoring |
| `MSPDebug.getStatus()` | Get current MSP status |
| `MSPDebug.monitor.getStatus()` | Get current MSP status (alternative) |
| `MSPDebug.analyze()` | Analyze current queue contents |

### Testing Commands

| Command | Description |
|---------|-------------|
| `MSPDebug.runTests()` | Run stress test suite |
| `MSPDebug.runFullSuite()` | Run complete stress test suite with detailed output |
| `MSPDebug.runTest('test-name')` | Run a specific test by name |
| `MSPDebug.quickHealthCheck()` | Run a quick MSP health check |
| `MSPDebug.stressScenario('scenario')` | Run specific stress test scenario |
| `MSPDebug.testAlerts()` | Test alert system |
| `MSPDebug.triggerTestAlerts()` | Manually trigger alerts |

### Alert Testing

| Command | Description |
|---------|-------------|
| `MSPDebug.setTestThresholds()` | Lower thresholds for easier testing |
| `MSPDebug.setNormalThresholds()` | Restore normal thresholds |
| `MSPDebug.testAlerts()` | Complete alert system test |

### Visual Tools

| Command | Description |
|---------|-------------|
| `MSPDebug.show()` | Show visual debug dashboard |
| `MSPDebug.report()` | Generate and download report |

## Dashboard Interactions

The visual dashboard includes smart interaction handling to ensure a smooth user experience:

### Automatic Update Pausing

- **Mouse hover**: Updates pause for 3 seconds when hovering over interactive elements
- **Click events**: Updates pause for 5 seconds when clicking buttons or test results
- **Focus events**: Updates pause for 10 seconds when focusing on input elements
- **Visual indicator**: Orange "Updates Paused" indicator appears when updates are suspended

### Clickable Test Results

- Click on any test result item to see detailed information including:
  - Full error messages
  - Performance metrics
  - JSON response data
  - Test duration and status
- Details remain stable and clickable while displayed
- Use the "Close Details" button to dismiss and resume normal updates

### Interactive Elements

- All buttons remain stable during interactions
- Queue analysis results are preserved during examination
- Export functionality works without interference from updates

### Keyboard Shortcuts

- **Ctrl+Shift+M**: Toggle dashboard visibility
- Use console commands for programmatic control

## Available Tests

### Individual Test Names (for `runTest`)

1. **queue-flooding** - Tests queue limits with many simultaneous requests
2. **rapid-fire** - Tests high-frequency request handling
3. **duplicates** - Validates duplicate request management
4. **timeout-recovery** - Tests timeout and retry mechanisms
5. **memory-leaks** - Checks for proper cleanup of completed requests
6. **concurrent-mixed** - Tests various request types simultaneously
7. **queue-overflow** - Tests behavior when queue reaches capacity
8. **connection-disruption** - Simulates connection issues
9. **performance-load** - Tests sustained load performance

### Stress Scenarios (for `stressScenario`)

- **high-frequency** - High-frequency requests every 10ms for 5 seconds
- **queue-overflow** - Floods queue beyond capacity
- **mixed-load** - Various request types and sizes

### Full Test Suite

The `runFullSuite()` command runs all individual tests in sequence with detailed console output and generates a comprehensive report.

## Monitoring Metrics

The tools track various metrics:

- **Queue Size**: Current number of pending requests
- **Response Times**: Average, minimum, and maximum response times
- **Success Rate**: Percentage of successful requests
- **Timeout Rate**: Percentage of requests that timeout
- **Request Distribution**: Breakdown by MSP command codes
- **Error Tracking**: Categorized error types and frequencies

## Alert System

The monitoring system provides alerts for:

- 🚨 **Queue Full**: Queue approaching capacity
- ⏱️ **High Timeout Rate**: Excessive request timeouts
- 🐌 **Slow Responses**: Average response time too high
- 💾 **Memory Leak**: Callbacks not being cleaned up properly

## Dashboard Features

The visual dashboard provides:

- **Real-time Status**: Current queue state and metrics
- **Live Charts**: Queue size and response time trends
- **Queue Analysis**: Detailed breakdown of pending requests
- **Alert Display**: Active alerts and warnings
- **Test Integration**: Run tests directly from the UI
- **Export Tools**: Generate and download reports

## Keyboard Shortcuts

- `Ctrl+Shift+M` - Toggle debug dashboard
- Dashboard is draggable and resizable

## Example Usage Scenarios

### Development Testing
```javascript
// Start monitoring during development
MSPDebug.startMonitoring();

// Quick health check
MSPDebug.quickHealthCheck();

// Test the alert system
MSPDebug.testAlerts();

// Show visual dashboard
MSPDebug.show();
```

### Performance Analysis
```javascript
// Show dashboard for visual monitoring
MSPDebug.show();

// Run complete stress tests with detailed output
MSPDebug.runFullSuite();

// Test specific scenarios
MSPDebug.stressScenario('high-frequency');

// Generate detailed report
MSPDebug.report();
```

### Issue Debugging
```javascript
// Get current status
MSPDebug.getStatus();

// Analyze current queue state
MSPDebug.analyze();

// Test specific problematic scenario
MSPDebug.runTest('memory-leaks');

// Check for alerts with low thresholds
MSPDebug.setTestThresholds();
MSPDebug.triggerTestAlerts();

// Generate diagnostic report
MSPDebug.report();
```

## Integration with Existing Code

The debug tools are designed to be non-intrusive:

- They hook into existing MSP methods without modifying core functionality
- Monitoring can be enabled/disabled at runtime
- No performance impact when not actively monitoring
- Original MSP behavior is preserved

### Auto-loading
The debug tools auto-load when `msp_debug_tools.js` is imported. They detect the presence of the global MSP object and initialize automatically.

### Keyboard Shortcuts
- `Ctrl+Shift+M`: Toggle debug dashboard

## Implementation Status

### ✅ Current Features

#### Alert System
- Enhanced debug logging with reduced console noise
- Test infrastructure: `triggerTestAlerts()`, `setTestThresholds()`, `setNormalThresholds()`
- Visual alert display in dashboard
- Smart threshold management for testing

#### Interactive Dashboard
- Smart update pausing during user interactions
- Clickable test results with detailed information
- Enhanced interaction handling for all UI elements
- Visual feedback with updates pause indicator

#### Complete API
- Dual API support: `MSPDebug` (modern) and `MSPTestRunner` (legacy)
- All documented commands implemented and verified
- Comprehensive testing methods (9 test types + 3 stress scenarios)
- Real-time monitoring with alert detection

### ✅ Verified Working
- Alert system triggers correctly when thresholds exceeded
- Dashboard displays alerts visually without update interference
- Test results provide comprehensive detailed information
- All API commands function as documented
- Auto-loading works in development environment

## File Structure

```
src/js/msp/
├── MSPCodes.js
├── MSPConnector.js  
├── MSPHelper.js
└── debug/
    ├── msp_queue_monitor.js     # Core monitoring functionality
    ├── msp_stress_test.js       # Stress testing framework
    ├── msp_debug_dashboard.js   # Visual dashboard UI
    ├── msp_test_runner.js       # Console command interface
    ├── msp_debug_tools.js       # Integration and auto-loading
    └── MSP_DEBUG_README.md      # Documentation
```

## Requirements

- Modern browser with ES6 module support
- Access to the global `MSP` object
- Console access for command-line interface

## Troubleshooting

**Tools not loading:**
- Ensure MSP object is available globally
- Check browser console for import errors

**Tests failing unexpectedly:**
- Verify serial connection is active
- Check that flight controller is responding
- Review console for specific error messages

**Dashboard not appearing:**
- Try `MSPTestRunner.showDashboard()` from console
- Check for CSS conflicts
- Verify no popup blockers are interfering

## Contributing

When adding new tests or monitoring features:

1. Add test methods to `MSPStressTest` class
2. Update monitor metrics in `MSPQueueMonitor`
3. Extend dashboard UI as needed
4. Update this documentation

## License

Same as Betaflight Configurator project.
