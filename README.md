# StairMath

IRC-compliant stair stringer calculator. Enter a floor-to-floor rise and get a live side-profile diagram with riser, tread, angle, and throat math — plus auto-placed intermediate landings, one-click auto-fix for code failures, and a clean PDF spec sheet for handoff.

### → [Try it live at hgolden62.github.io/StairMath](https://hgolden62.github.io/StairMath/)

No install needed — it runs entirely in your browser. The instructions below are only for running or modifying the app locally.

## Features

- **Real-time calculation.** Every input updates the layout, diagram, and compliance panel as you type — no submit button.
- **IRC code compliance.** Checks max riser height (R311.7.5.1), min tread depth (R311.7.5.2), min throat depth, stair angle comfort range (30°–37°), and max flight rise (R311.7.3).
- **Auto-placed landings.** When total rise exceeds 151″, the flight splits automatically into code-compliant sub-flights with 36″ platforms between them.
- **Auto-fix.** When the layout fails compliance, one click proposes a valid geometry (tread depth, target riser, stock size) without touching your total rise.
- **Live SVG diagram.** Side-profile of the full staircase with dimensioned stringers, treads, risers, landings, angle arc, and step numbering.
- **PDF export.** One-page handoff spec with the diagram, inputs, computed layout, per-flight breakdown, compliance report, and cut list — selectable text, no rasterization.
- **Imperial / Metric toggle.** All inputs and labels convert between units.
- **Liquid-glass UI.** Dark atmospheric background, blurred drifting blobs, glass panels with specular highlights, Fraunces display + Geist UI typography.

## Tech stack

- [Vite](https://vite.dev) + [React 19](https://react.dev) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com) (via `@tailwindcss/vite`)
- [Motion](https://motion.dev) for animations
- [jsPDF](https://github.com/parallax/jsPDF) for PDF generation
- Fonts: Fraunces (display), Geist (UI), Geist Mono (numbers)

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173.

```bash
npm run build     # production build
npm run preview   # preview the build
```

## How the math works

Given total rise `R` and target riser height `r`:

- `numRisers = round(R / r)` — rounded to the nearest whole step.
- `actualRise = R / numRisers` — uniform across every step.
- `numTreads = numRisers − 1` — the top landing takes the role of the last tread.
- `totalRun = numTreads × treadDepth`.
- `hypotenuse = √(R² + totalRun²)` — rounded up to the next standard lumber length (8, 10, 12, 14, 16 ft).
- `angle = atan(R / totalRun)` in degrees.
- `throat = stockWidth − (riser × tread) / √(riser² + tread²)` — perpendicular wood remaining behind the notch cut.

When `R > 151″`, the flight splits into `ceil(R / 151)` flights, distributing risers as evenly as possible, with 36″ landings inserted between them.

## Project structure

```
src/
├── App.tsx       # Everything — state, math, compliance, SVG, PDF export
├── index.css     # Tailwind config + liquid-glass recipe
└── main.tsx      # React entry
```

Single-file by design. No routing, no backend, no persistence.

## Disclaimer

StairMath is a design aid. Always verify dimensions on site before cutting, and confirm local code with your AHJ — this tool implements IRC residential defaults and is not a substitute for a licensed inspection.
