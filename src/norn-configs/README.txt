# NORN Configuration Template Documentation
# ======================================
#
# This template generates Betaflight CLI configuration based on selected options.
# Available template variables (from getSelectedKeys() in norn_config.js):
#
# fcKey: Flight Controller type (from select[name='norn_fc'])
#   - '': Empty/None selected
#   - 'FLASHHOBBYF405': FLASHHOBBYF405 (F4 chip)
#   - 'SPEEDYBEEF405V3': SPEEDYBEEF405V3 (F7 chip)  
#   - 'TAKERF722SE': TAKERF722SE (H7 chip)
#   - 'GEPRCF722': GEPRCF722 (H7 chip)
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
#   - 'UART': UART-based Manticore setup
#   - 'GPIO': GPIO-based Manticore setup
#
# vtxKey: Video Transmitter configuration (from select[name='norn_vtx'])
#   - '': Empty/None selected
#   - '3.3VTX': 3.3GHz VTX setup
#   - '5.8VTX': 5.8GHz VTX setup
#   - 'OPTICA': Optica VTX setup
#
# gpsEnabled: Boolean flag for GPS functionality (from #norn_gps checkbox)
#   - true: Enable GPS features
#   - false: No GPS configuration
#
# craftName: Custom craft name (from #norn_craft_name input)
#   - '': Empty string if no name entered
#   - Any string value for craft identification
#
# mbId: MB ID identifier (from #norn_mb_id input)
#   - '': Empty string if no MB ID entered
#   - Any string value for MB identification
#
# controller: Controller type (from select[name='norn_controller'])
#   - '': Empty/None selected
#   - 'BOXER': BOXER controller
#   - 'TX12': TX12 controller
#
# failSafe: FailSafe configuration (from select[name='norn_failsafe'])
#   - '': Empty/None selected
#   - 'Default': Default failSafe configuration
#
# videoFormat: Video format (from select[name='norn_video_format'])
#   - '': Empty/None selected
#   - 'NTSC': NTSC video format
#   - 'PAL': PAL video format
#
# Template Syntax (Handlebars):
#   - {{#if condition}} ... {{/if}} : Conditional blocks
#   - {{variable}} : Output variable value
#   - {{!-- comment --}} : Template comments (not included in output)
#   - {{#if (eq variable 'value')}} : Equality comparison with helper
#
# Example usage in conditional blocks:
#   {{#if (eq fcKey 'FLASHHOBBYF405')}}
#   # This section applies only to FLASHHOBBYF405 flight controllers
#   {{/if}}
#
#   {{#if droneSize}}
#   # This section applies only when drone size is selected
#   {{/if}}
#
# Note: All select elements have an empty option for "None" selection
# Checkbox elements return boolean values (true/false)
# Input elements return string values (may be empty string)
# The 'eq' helper is registered for equality comparisons in Handlebars