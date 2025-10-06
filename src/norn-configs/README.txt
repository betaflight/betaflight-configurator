# NORN Configuration Template Documentation
# ======================================
#
# This template generates Betaflight CLI configuration based on selected options.
# Available template variables (from getSelectedKeys() in norn_config.js):
#
# fcKey: Flight Controller type (from select[name='norn_fc'])
#   - '': Empty/None selected
#   - 'f4': FLASHHOBBYF405 (F4 chip)
#   - 'f7': SPEEDYBEEF405V3 (F7 chip)  
#   - 'h7': TAKERF722SE or GEPRCF722 (H7 chip) - Note: both use same value
#
# droneSize: Drone frame size in inches (from select[name='norn_drone_size'])
#   - '': Empty/None selected
#   - '7': 7-inch frame
#   - '8': 8-inch frame
#   - '9': 9-inch frame
#   - '10': 10-inch frame
#   - '13': 13-inch frame
#   - '15': 15-inch frame
#
# manticoreKey: Manticore system configuration (from select[name='norn_manticore'])
#   - '': Empty/None selected
#   - 'uart': UART-based Manticore setup
#   - 'gpio': GPIO-based Manticore setup
#
# vtxKey: Video Transmitter configuration (from select[name='norn_vtx'])
#   - '': Empty/None selected
#   - '3.3_vtx': 3.3GHz VTX setup
#   - '5.8_vtx': 5.8GHz VTX setup
#   - 'optica': Optica VTX setup
#
# gpsEnabled: Boolean flag for GPS functionality (from #norn_gps checkbox)
#   - true: Enable GPS features
#   - false: No GPS configuration
#
# craftName: Custom craft name (from #norn_craft_name input)
#   - '': Empty string if no name entered
#   - Any string value for craft identification
#
# Template Syntax:
#   - <% if (condition) { %> ... <% } %> : Conditional blocks
#   - <%= variable %> : Output variable value
#   - <%# comment %> : Template comments (not included in output)
#
# Example usage in conditional blocks:
#   <% if (fcKey === 'f4') { %>
#   # This section applies only to F4 flight controllers
#   <% } %>
#
#   <% if (droneSize === '7') { %>
#   # This section applies only to 7-inch drones
#   <% } %>
#
# Note: All select elements have an empty option for "None" selection
# Checkbox elements return boolean values (true/false)
# Input elements return string values (may be empty string)