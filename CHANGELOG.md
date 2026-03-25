# Changelog

## [2026.3.4] - 2026-03-24

### The big one — AUTO TUNE is here

After years of watching ArduCopter pilots have all the fun with one-click AutoTune,
Betaflight now has its own. Flip one switch in the air and the chirp system sweeps
through every frequency your drone can produce — Pitch, Roll then Yaw — automatically.
Land, drop the log in Step 2, done.

The AUTO TUNE tab keeps it simple. Pick your shake intensity — Easy, Medium or Hard —
hit Configure, assign your Chirp switch in Modes, and fly. Advanced pilots can dig into
sweep frequency and duration under the Advanced Settings panel.

Confirmed working on Betaflight 25.12.

### Also shipped today

- **Native BFL file support** — drop your raw Betaflight blackbox file straight into
  Step 2. No more exporting CSV from Blackbox Explorer first. Just fly, land, analyse.

- **Filter frequency visualiser** — now shows the crossfade sweep zone between your
  dynamic filter min and max frequencies as a shaded region. See exactly where your
  filters are working.

- **Rock solid update notifications** — the "new version available" prompt now fires
  reliably on every deploy, even when GitHub Pages caches the service worker.

- **GPS sky plot and accuracy scatter** — see your satellites by position and lock
  status, plus live 1σ and 2σ accuracy calculated as fixes come in. Know your GPS is
  solid before you fly.

## [2026.3.2] - 2026-03-24

### Added
- Filter visualiser now shows crossfade sweep zones — dynamic notch and D-Term LPF1 dynamic range shown as semi-transparent shaded regions between min and max frequencies
- Filter frequency response visualiser at the bottom of the Filter Settings tab — full-width D3 chart showing signal attenuation (0 dB to −40 dB) across 0–1000 Hz for all active filters: Gyro LPF1 (blue, static or dynamic min/max pair), Gyro LPF2 (cyan), D-Term LPF1 (orange, dynamic-aware), D-Term LPF2 (yellow), dynamic notch filters (red, Q-scaled notches evenly spaced across min/max range), and RPM filter harmonics (green, shown only when DShot telemetry is enabled). A dashed Nyquist marker is drawn at half the computed PID loop rate. All curves update live as filter values are changed on the tab. Filter math uses standard biquad transfer functions: PT1 (1st-order RC), BIQUAD (Butterworth 2nd order), PT2 (cascaded PT1²), PT3 (cascaded PT1³), and notch via |fn²−f²|/√((fn²−f²)²+(fn·f/Q)²).

## [2026.3.1] - 2026-03-24

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
