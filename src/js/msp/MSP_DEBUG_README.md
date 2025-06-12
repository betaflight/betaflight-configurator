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
import './src/js/msp_debug_tools.js';
```

Or in development, load via console:
```javascript
import('./src/js/msp_debug_tools.js');
```

### 2. Basic Usage

**Start monitoring:**
```javascript
MSPTestRunner.startQuickMonitor();
```

**Show visual dashboard:**
```javascript
MSPTestRunner.showDashboard();
// Or press Ctrl+Shift+M
```

**Quick health check:**
```javascript
MSPTestRunner.quickHealthCheck();
```

**Run stress tests:**
```javascript
// Run specific test
MSPTestRunner.runTest('queue-flooding');

// Run full test suite
MSPTestRunner.runFullSuite();
```

## Available Commands

### Monitoring Commands

| Command | Description |
|---------|-------------|
| `MSPTestRunner.startQuickMonitor()` | Start monitoring with console output |
| `MSPTestRunner.stopMonitor()` | Stop monitoring |
| `MSPTestRunner.getStatus()` | Get current MSP status |
| `MSPTestRunner.analyzeQueue()` | Analyze current queue contents |

### Testing Commands

| Command | Description |
|---------|-------------|
| `MSPTestRunner.runTest('test-name')` | Run specific stress test |
| `MSPTestRunner.runFullSuite()` | Run complete test suite |
| `MSPTestRunner.quickHealthCheck()` | Quick health validation |

### Stress Scenarios

| Command | Description |
|---------|-------------|
| `MSPTestRunner.stressScenario('high-frequency')` | High frequency request test |
| `MSPTestRunner.stressScenario('queue-overflow')` | Queue overflow handling test |
| `MSPTestRunner.stressScenario('mixed-load')` | Mixed request types test |

### Visual Tools

| Command | Description |
|---------|-------------|
| `MSPTestRunner.showDashboard()` | Show visual debug dashboard |
| `MSPTestRunner.generateReport()` | Generate and download report |

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

1. **Queue Flooding** - Tests queue limits with many simultaneous requests
2. **Rapid Fire Requests** - Tests high-frequency request handling
3. **Duplicate Request Handling** - Validates duplicate request management
4. **Timeout Recovery** - Tests timeout and retry mechanisms
5. **Memory Leak Detection** - Checks for proper cleanup of completed requests
6. **Concurrent Mixed Requests** - Tests various request types simultaneously
7. **Queue Overflow Handling** - Tests behavior when queue reaches capacity
8. **Connection Disruption** - Simulates connection issues
9. **Performance Under Load** - Tests sustained load performance

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
MSPTestRunner.startQuickMonitor();

// Run quick health check after changes
MSPTestRunner.quickHealthCheck();

// Test specific functionality
MSPTestRunner.runTest('timeout-recovery');
```

### Performance Analysis
```javascript
// Show dashboard for visual monitoring
MSPTestRunner.showDashboard();

// Run performance stress test
MSPTestRunner.stressScenario('high-frequency');

// Generate detailed report
MSPTestRunner.generateReport();
```

### Issue Debugging
```javascript
// Analyze current queue state
MSPTestRunner.analyzeQueue();

// Check for memory leaks
MSPTestRunner.runTest('memory-leaks');

// Run full diagnostic
MSPTestRunner.runFullSuite();
```

## Integration with Existing Code

The debug tools are designed to be non-intrusive:

- They hook into existing MSP methods without modifying core functionality
- Monitoring can be enabled/disabled at runtime
- No performance impact when not actively monitoring
- Original MSP behavior is preserved

## File Structure

```
src/js/
├── msp_queue_monitor.js     # Core monitoring functionality
├── msp_stress_test.js       # Stress testing framework
├── msp_debug_dashboard.js   # Visual dashboard UI
├── msp_test_runner.js       # Console command interface
└── msp_debug_tools.js       # Integration and auto-loading
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
