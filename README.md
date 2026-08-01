# GIGFPV Station

GIGFPV Station is the integrated configurator for GIGFPV hardware.

It provides one workspace for:

- GIGFLIGHT flight-controller configuration and flashing.
- GIGLRS receiver flashing through GIGFLIGHT passthrough.
- AM32 ESC configuration and flashing through GIGFLIGHT 4-way passthrough.

The app is built from an open-source FPV configurator base and keeps the same technical architecture where it is useful, while presenting GIGFPV/GIGFLIGHT branding and targeting GIGFPV-maintained firmware and hardware.

## Development

Install dependencies:

```sh
npm install
```

Run the development server:

```sh
npm run dev
```

The app runs at:

```text
http://localhost:8080
```

Build the production app:

```sh
npm run build
```

Preview a production build:

```sh
npm run preview
```

## Validation

Run linting:

```sh
npm run lint
```

Run tests:

```sh
npm test
```

## License and attribution

This project is GPL-3.0 licensed and is derived from open-source FPV software. Source-code copyright and license headers are preserved where required.
