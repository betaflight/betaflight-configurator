# Changelog

## [1.1.0] - 2026-03-24

### Added
- GPS satellite sky plot — polar scatter showing satellite positions by azimuth/elevation, coloured by lock status (green=locked, blue=found, red=searching), labelled with constellation and satellite ID
- GPS stationary accuracy scatter plot — live position fix scatter with 1σ and 2σ accuracy displayed, CEP rings at 50% and 95%, cumulative accuracy calculation
- AeroTune PID output table redesigned to match Betaflight PID tuning tab layout — Roll/Pitch/Yaw rows with Proportional/Integral/D Max/Derivative/Feedforward columns
- AeroTune voltage scaling — PIDs now correctly scale down for 6S (−13%) and 8S (−23%) builds
- AeroTune prop size scaling — corrected scaling curve from 2-inch to 8-inch with real-world validated anchor points
- AeroTune tooltip (i) icons on all PID column headers with plain-English seesaw analogy explanations
- Bando flying style added

### Changed
- Apply PIDs button resized and recoloured to match Betaflight orange theme
- Freestyle renamed to Bando
