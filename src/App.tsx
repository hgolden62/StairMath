import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, animate, useMotionValue, useTransform } from "motion/react";
import { jsPDF } from "jspdf";

type Unit = "imperial" | "metric";
type Stock = "2x10" | "2x12";

const STOCK_WIDTH: Record<Stock, number> = {
  "2x10": 9.25,
  "2x12": 11.25,
};

const STANDARD_LENGTHS_FT = [8, 10, 12, 14, 16];

const MAX_FLIGHT_RISE = 151; // IRC R311.7.3 — max 151″ vertical rise between floors/landings
const LANDING_DEPTH = 36; // min landing depth in the direction of travel (IRC R311.7.6)

const DEFAULTS = {
  totalRise: 108,
  treadDepth: 10.5,
  riserHeight: 7.5,
  nosing: 1,
  stock: "2x12" as Stock,
};

const IN_TO_MM = 25.4;

function unitLabel(unit: Unit) {
  return unit === "metric" ? "mm" : "in";
}

function AnimatedNumber({
  value,
  decimals = 2,
}: {
  value: number;
  decimals?: number;
}) {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v) => v.toFixed(decimals));
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.4, ease: "easeOut" });
    return controls.stop;
  }, [value, mv]);

  useEffect(() => {
    return display.on("change", (v) => {
      if (ref.current) ref.current.textContent = v;
    });
  }, [display]);

  return <span ref={ref} className="tabular">{value.toFixed(decimals)}</span>;
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 7.5L5.5 10.5L11.5 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 3L11 11M11 3L3 11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconWand() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M9.5 2L10.2 3.8L12 4.5L10.2 5.2L9.5 7L8.8 5.2L7 4.5L8.8 3.8L9.5 2Z"
        fill="currentColor"
      />
      <path
        d="M2 12L7 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M3.5 9.5L4.5 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 2V9M7 9L4 6M7 9L10 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 11.5H11.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconWarn() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 4V7.5M7 10H7.005"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

type NumInputProps = {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit: Unit;
  displayUnit: string;
  onChange: (val: number) => void;
};

function NumberInput({
  id,
  label,
  value,
  min,
  max,
  step = 0.125,
  unit,
  displayUnit,
  onChange,
}: NumInputProps) {
  const toDisplay = (v: number) =>
    unit === "metric" ? (v * IN_TO_MM).toFixed(1) : v.toString();
  const [local, setLocal] = useState(toDisplay(value));

  useEffect(() => {
    setLocal(toDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, unit]);

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return;
    const inches = unit === "metric" ? n / IN_TO_MM : n;
    let clamped = inches;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);
    onChange(clamped);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[12px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] font-medium"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          className="glass-input pr-12"
          value={local}
          min={min !== undefined ? (unit === "metric" ? (min * IN_TO_MM).toFixed(1) : min) : undefined}
          max={max !== undefined ? (unit === "metric" ? (max * IN_TO_MM).toFixed(1) : max) : undefined}
          step={unit === "metric" ? 1 : step}
          onChange={(e) => {
            setLocal(e.target.value);
            commit(e.target.value);
          }}
          onBlur={(e) => commit(e.target.value)}
        />
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] text-[var(--color-ink-muted)] font-[var(--font-mono)] pointer-events-none">
          {displayUnit}
        </span>
      </div>
    </div>
  );
}

type Compliance = {
  key: string;
  label: string;
  value: string;
  ruleText: string;
  state: "pass" | "warn" | "fail";
  fix?: string;
};

function ComplianceRow({ c }: { c: Compliance }) {
  const Icon = c.state === "pass" ? IconCheck : c.state === "warn" ? IconWarn : IconX;
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-white/5 last:border-b-0">
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center rounded-full ${
            c.state === "pass"
              ? "bg-[rgba(125,211,252,0.15)] text-[#7dd3fc]"
              : c.state === "warn"
                ? "bg-[rgba(251,191,36,0.15)] text-[#fbbf24]"
                : "bg-[rgba(251,113,133,0.15)] text-[#fb7185]"
          }`}
        >
          <Icon />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] text-[var(--color-ink)] font-medium">{c.label}</div>
          <div className="text-[12px] text-[var(--color-ink-muted)] mt-0.5">
            {c.ruleText}
          </div>
          {c.fix && c.state !== "pass" && (
            <div className="text-[12px] text-[var(--color-ink-muted)] mt-1 italic">
              {c.fix}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[13px] tabular text-[var(--color-ink)] font-medium">{c.value}</span>
        <span
          className={`pill ${
            c.state === "pass" ? "pill-pass" : c.state === "warn" ? "pill-warn" : "pill-fail"
          }`}
        >
          {c.state === "pass" ? "Pass" : c.state === "warn" ? "Warn" : "Fail"}
        </span>
      </div>
    </div>
  );
}

type Flight = {
  index: number;
  numRisers: number;
  numTreads: number;
  rise: number;
  run: number;
  hypotenuse: number;
  stockLength: number;
  startX: number;
  startY: number;
};

type StairCalc = {
  totalRisers: number;
  totalTreads: number;
  actualRise: number;
  totalRun: number;
  flights: Flight[];
  numLandings: number;
  landingDepth: number;
  landingHeights: number[];
  angleDeg: number;
  throat: number;
  maxStockLength: number;
  hypotenuse: number;
};

type AutoFixResult = {
  treadDepth: number;
  riserHeight: number;
  stock: Stock;
  notes: string[];
};

function autoFix(
  totalRise: number,
  treadDepth: number,
  riserHeight: number,
  stock: Stock,
): AutoFixResult | null {
  const minRisersForCode = Math.ceil(totalRise / 7.75);
  const idealAngleTan = Math.tan((33 * Math.PI) / 180);

  for (let N = Math.max(2, minRisersForCode); N <= 40; N++) {
    const actualRise = totalRise / N;
    const numTreads = N - 1;
    if (numTreads < 1) continue;

    const idealTread = totalRise / idealAngleTan / numTreads;
    const tread = Math.max(10, Math.min(14, +idealTread.toFixed(3)));
    const run = numTreads * tread;
    const angle = (Math.atan2(totalRise, run) * 180) / Math.PI;
    const stepHyp = Math.sqrt(actualRise * actualRise + tread * tread);
    const perp = (actualRise * tread) / stepHyp;

    for (const tryStock of [stock, "2x12" as Stock]) {
      const throat = STOCK_WIDTH[tryStock] - perp;
      const pass =
        actualRise <= 7.75 &&
        tread >= 10 &&
        throat >= 5 &&
        angle >= 30 &&
        angle <= 37;
      if (pass) {
        const notes: string[] = [];
        const newRiser = +actualRise.toFixed(3);
        const newTread = +tread.toFixed(3);
        if (Math.abs(newRiser - riserHeight) > 0.01) {
          notes.push(`Riser target ${riserHeight}″ → ${newRiser}″`);
        }
        if (Math.abs(newTread - treadDepth) > 0.01) {
          notes.push(`Tread depth ${treadDepth}″ → ${newTread}″`);
        }
        if (tryStock !== stock) {
          notes.push(`Stock ${stock} → ${tryStock}`);
        }
        if (notes.length === 0) return null;
        return {
          treadDepth: newTread,
          riserHeight: newRiser,
          stock: tryStock,
          notes,
        };
      }
    }
  }
  return null;
}

function calculate(
  totalRise: number,
  treadDepth: number,
  targetRiser: number,
  stock: Stock,
): StairCalc {
  const totalRisers = Math.max(2, Math.round(totalRise / Math.max(0.1, targetRiser)));
  const actualRise = totalRise / totalRisers;

  const numFlights = Math.max(1, Math.ceil(totalRise / MAX_FLIGHT_RISE));
  const numLandings = numFlights - 1;

  const base = Math.floor(totalRisers / numFlights);
  const extra = totalRisers % numFlights;

  const flights: Flight[] = [];
  const landingHeights: number[] = [];
  let cumX = 0;
  let cumY = 0;

  for (let i = 0; i < numFlights; i++) {
    const nRisers = base + (i < extra ? 1 : 0);
    const nTreads = Math.max(0, nRisers - 1);
    const rise = nRisers * actualRise;
    const run = nTreads * treadDepth;
    const hyp = Math.sqrt(rise * rise + run * run);
    const stockLength =
      STANDARD_LENGTHS_FT.find((l) => l >= hyp / 12) ??
      STANDARD_LENGTHS_FT.at(-1)!;

    flights.push({
      index: i,
      numRisers: nRisers,
      numTreads: nTreads,
      rise,
      run,
      hypotenuse: hyp,
      stockLength,
      startX: cumX,
      startY: cumY,
    });

    cumX += run;
    cumY += rise;

    if (i < numFlights - 1) {
      landingHeights.push(cumY);
      cumX += LANDING_DEPTH;
    }
  }

  const totalRun = cumX;
  const totalTreads = flights.reduce((s, f) => s + f.numTreads, 0);
  const angleDeg = (Math.atan2(actualRise, treadDepth) * 180) / Math.PI;
  const stockWidth = STOCK_WIDTH[stock];
  const stepHyp = Math.sqrt(actualRise * actualRise + treadDepth * treadDepth);
  const throat = stockWidth - (actualRise * treadDepth) / stepHyp;
  const maxStockLength = Math.max(...flights.map((f) => f.stockLength));
  const hypotenuse = Math.max(...flights.map((f) => f.hypotenuse));

  return {
    totalRisers,
    totalTreads,
    actualRise,
    totalRun,
    flights,
    numLandings,
    landingDepth: LANDING_DEPTH,
    landingHeights,
    angleDeg,
    throat,
    maxStockLength,
    hypotenuse,
  };
}

export default function App() {
  const [unit, setUnit] = useState<Unit>("imperial");
  const [totalRise, setTotalRise] = useState(DEFAULTS.totalRise);
  const [treadDepth, setTreadDepth] = useState(DEFAULTS.treadDepth);
  const [riserHeight, setRiserHeight] = useState(DEFAULTS.riserHeight);
  const [nosing, setNosing] = useState(DEFAULTS.nosing);
  const [stock, setStock] = useState<Stock>(DEFAULTS.stock);

  const calc = useMemo(
    () => calculate(totalRise, treadDepth, riserHeight, stock),
    [totalRise, treadDepth, riserHeight, stock],
  );

  const compliance: Compliance[] = useMemo(() => {
    const rows: Compliance[] = [];

    const riserPass = calc.actualRise <= 7.75;
    rows.push({
      key: "riser",
      label: "Max riser height",
      ruleText: "IRC R311.7.5.1 — riser ≤ 7.75″",
      value: `${calc.actualRise.toFixed(2)}″`,
      state: riserPass ? "pass" : "fail",
      fix: "Reduce riser height — increase total rise or lower the target riser.",
    });

    const treadPass = treadDepth >= 10;
    rows.push({
      key: "tread",
      label: "Min tread depth",
      ruleText: "IRC R311.7.5.2 — tread ≥ 10″ (nose to nose)",
      value: `${treadDepth.toFixed(2)}″`,
      state: treadPass ? "pass" : "fail",
      fix: "Increase preferred tread depth to at least 10″.",
    });

    const throatPass = calc.throat >= 5;
    rows.push({
      key: "throat",
      label: "Min throat depth",
      ruleText: "Structural — throat ≥ 5″ behind the cut",
      value: `${calc.throat.toFixed(2)}″`,
      state: throatPass ? "pass" : "fail",
      fix:
        stock === "2x10"
          ? "Upsize stock to 2x12 or reduce riser/tread dimensions."
          : "Reduce riser or tread — the cut is eating too much of the stringer.",
    });

    const angleIdeal = calc.angleDeg >= 30 && calc.angleDeg <= 37;
    rows.push({
      key: "angle",
      label: "Stair angle",
      ruleText: "Ideal 30°–37° (comfort range)",
      value: `${calc.angleDeg.toFixed(1)}°`,
      state: angleIdeal ? "pass" : "warn",
      fix:
        calc.angleDeg > 37
          ? "Too steep — increase tread depth or reduce riser height."
          : "Too shallow — reduce tread depth or increase riser height.",
    });

    const maxFlightRise = Math.max(...calc.flights.map((f) => f.rise));
    const flightRisePass = maxFlightRise <= MAX_FLIGHT_RISE;
    rows.push({
      key: "flight",
      label: "Max rise per flight",
      ruleText: `IRC R311.7.3 — flight rise ≤ ${MAX_FLIGHT_RISE}″ (landings auto-placed)`,
      value:
        calc.numLandings > 0
          ? `${maxFlightRise.toFixed(1)}″ · ${calc.flights.length} flights`
          : `${maxFlightRise.toFixed(1)}″`,
      state: flightRisePass ? "pass" : "fail",
      fix: "Add a landing — this should auto-resolve.",
    });

    return rows;
  }, [calc, treadDepth, stock]);

  const allCompliant = compliance.every((r) => r.state === "pass");

  const fix = useMemo(
    () =>
      allCompliant ? null : autoFix(totalRise, treadDepth, riserHeight, stock),
    [allCompliant, totalRise, treadDepth, riserHeight, stock],
  );

  const applyAutoFix = () => {
    if (!fix) return;
    setTreadDepth(fix.treadDepth);
    setRiserHeight(fix.riserHeight);
    setStock(fix.stock);
  };

  const exportSpec = () => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const todayPretty = today.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN = 60;
    const BOTTOM_LIMIT = PAGE_H - 60;

    // Helvetica's WinAnsi encoding doesn't support ″ ≤ ≥ — swap to ASCII.
    const ascii = (s: string) =>
      s
        .replace(/″/g, '"')
        .replace(/≤/g, "<=")
        .replace(/≥/g, ">=");
    const textW = (s: string) => doc.getTextWidth(ascii(s));
    const writeText = (s: string, x: number, yPos: number) => {
      doc.text(ascii(s), x, yPos);
    };

    // Colors
    const INK: [number, number, number] = [20, 24, 34];
    const MUTED: [number, number, number] = [115, 125, 145];
    const RULE: [number, number, number] = [220, 224, 232];
    const PASS: [number, number, number] = [20, 120, 96];
    const WARN: [number, number, number] = [170, 105, 10];
    const FAIL: [number, number, number] = [180, 44, 70];

    let y = MARGIN;

    const newPageIfNeeded = (needed: number) => {
      if (y + needed > BOTTOM_LIMIT) {
        doc.addPage();
        y = MARGIN;
      }
    };

    // ========== TITLE ==========
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...INK);
    writeText("Stair Stringer Specification", MARGIN, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    writeText(`StairMath  ·  ${todayPretty}`, MARGIN, y);

    // Status text on the right (plain, no pill)
    const statusText = allCompliant ? "CODE COMPLIANT" : "NEEDS ADJUSTMENT";
    const statusColor = allCompliant ? PASS : FAIL;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...statusColor);
    const stW = textW(statusText);
    writeText(statusText, PAGE_W - MARGIN - stW, y);

    y += 10;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 28;

    // ========== HELPERS ==========
    const sectionHeader = (title: string) => {
      newPageIfNeeded(36);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      writeText(title, MARGIN, y);
      y += 14;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += 14;
    };

    const kv = (label: string, value: string) => {
      newPageIfNeeded(18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      writeText(label, MARGIN, y);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      const vw = textW(value);
      writeText(value, PAGE_W - MARGIN - vw, y);
      y += 16;
    };

    // ========== STAIR PROFILE DIAGRAM ==========
    {
      const diagramH = 200;
      const padLeft = 54;
      const padRight = 16;
      const padTop = 14;
      const padBottom = 44;
      const plotW = PAGE_W - MARGIN * 2 - padLeft - padRight;
      const plotH = diagramH - padTop - padBottom;

      newPageIfNeeded(diagramH + 36);
      sectionHeader("Stair profile");

      const diagramTop = y;
      const originX = MARGIN + padLeft;
      const originY = diagramTop + padTop + plotH;

      const scaleDiag = Math.min(
        plotW / Math.max(calc.totalRun, 1),
        plotH / Math.max(totalRise, 1),
      );
      const sxD = (xIn: number) => originX + xIn * scaleDiag;
      const syD = (yIn: number) => originY - yIn * scaleDiag;

      const stockW = STOCK_WIDTH[stock];
      const angleRad = (calc.angleDeg * Math.PI) / 180;
      const perpX = Math.sin(angleRad) * stockW;
      const perpY = Math.cos(angleRad) * stockW;

      // Floor + top-floor reference lines (dashed)
      doc.setDrawColor(200, 205, 215);
      doc.setLineWidth(0.5);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(sxD(0) - 12, syD(0), sxD(calc.totalRun) + 12, syD(0));
      doc.line(sxD(0) - 12, syD(totalRise), sxD(calc.totalRun) + 12, syD(totalRise));
      doc.setLineDashPattern([], 0);

      // Each flight: fill + stroke using doc.lines
      calc.flights.forEach((f) => {
        const pts: Array<[number, number]> = [[f.startX, f.startY]];
        for (let i = 0; i < f.numTreads; i++) {
          const baseX = f.startX + i * treadDepth;
          const riseY = f.startY + (i + 1) * calc.actualRise;
          pts.push([baseX, riseY]);
          pts.push([baseX + treadDepth, riseY]);
        }
        pts.push([f.startX + f.numTreads * treadDepth, f.startY + f.rise]);
        pts.push([f.startX + f.run + perpX, f.startY + f.rise - perpY]);
        pts.push([f.startX - perpX, f.startY - perpY]);

        const screenPts = pts.map(([x, yi]) => [sxD(x), syD(yi)] as [number, number]);
        const deltas = screenPts.slice(1).map(
          (p, i) => [p[0] - screenPts[i][0], p[1] - screenPts[i][1]] as [number, number],
        );
        doc.setFillColor(232, 240, 248);
        doc.setDrawColor(70, 110, 150);
        doc.setLineWidth(0.9);
        doc.lines(deltas, screenPts[0][0], screenPts[0][1], [1, 1], "FD", true);

        // Tread and riser edges for clarity
        doc.setDrawColor(140, 150, 170);
        doc.setLineWidth(0.5);
        for (let i = 0; i < f.numTreads; i++) {
          const ty = f.startY + (i + 1) * calc.actualRise;
          doc.line(
            sxD(f.startX + i * treadDepth),
            syD(ty),
            sxD(f.startX + (i + 1) * treadDepth),
            syD(ty),
          );
          const rx = f.startX + i * treadDepth;
          doc.line(sxD(rx), syD(f.startY + i * calc.actualRise), sxD(rx), syD(ty));
        }
        // Final riser up to landing/top floor
        const finalRx = f.startX + f.numTreads * treadDepth;
        doc.line(
          sxD(finalRx),
          syD(f.startY + f.numTreads * calc.actualRise),
          sxD(finalRx),
          syD(f.startY + f.rise),
        );
      });

      // Landings: outlined rectangle + label
      calc.flights.slice(0, -1).forEach((f, i) => {
        const lX = f.startX + f.run;
        const lY = f.startY + f.rise;
        const lThick = Math.max(6, stockW * 0.9);
        const rx = sxD(lX);
        const ry = syD(lY);
        const rw = calc.landingDepth * scaleDiag;
        const rh = lThick * scaleDiag;
        doc.setFillColor(225, 228, 234);
        doc.setDrawColor(90, 100, 120);
        doc.setLineWidth(0.9);
        doc.rect(rx, ry, rw, rh, "FD");

        // Label beneath the platform
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...INK);
        const nm = `Landing ${i + 1}`;
        const nmW = textW(nm);
        writeText(nm, rx + rw / 2 - nmW / 2, ry + rh + 9);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        const ht = `${lY.toFixed(1)}" from floor`;
        const htW = textW(ht);
        writeText(ht, rx + rw / 2 - htW / 2, ry + rh + 18);
      });

      // Total rise dimension (left)
      const dimLX = originX - 24;
      doc.setDrawColor(130, 140, 160);
      doc.setLineWidth(0.5);
      doc.line(dimLX, syD(0), dimLX, syD(totalRise));
      doc.line(dimLX - 3, syD(0), dimLX + 3, syD(0));
      doc.line(dimLX - 3, syD(totalRise), dimLX + 3, syD(totalRise));
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(`Rise ${totalRise.toFixed(1)}"`, dimLX - 6, (syD(0) + syD(totalRise)) / 2, {
        angle: 90,
        align: "center",
      });

      // Total run dimension (below)
      const dimBY = originY + 18;
      doc.setDrawColor(130, 140, 160);
      doc.line(sxD(0), dimBY, sxD(calc.totalRun), dimBY);
      doc.line(sxD(0), dimBY - 3, sxD(0), dimBY + 3);
      doc.line(sxD(calc.totalRun), dimBY - 3, sxD(calc.totalRun), dimBY + 3);
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      const runLbl = `Run ${calc.totalRun.toFixed(1)}" (incl. landings)`;
      const runLblW = textW(runLbl);
      writeText(runLbl, (sxD(0) + sxD(calc.totalRun)) / 2 - runLblW / 2, dimBY + 11);

      // Angle arc at origin
      const arcR = Math.min(32, plotW * 0.1, plotH * 0.3);
      doc.setDrawColor(130, 140, 160);
      doc.setLineWidth(0.5);
      const arcSteps = 14;
      for (let i = 0; i < arcSteps; i++) {
        const a1 = (i / arcSteps) * angleRad;
        const a2 = ((i + 1) / arcSteps) * angleRad;
        doc.line(
          originX + arcR * Math.cos(a1),
          originY - arcR * Math.sin(a1),
          originX + arcR * Math.cos(a2),
          originY - arcR * Math.sin(a2),
        );
      }
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      writeText(
        `${calc.angleDeg.toFixed(1)} deg`,
        originX + arcR + 4,
        originY - arcR / 2 + 2,
      );

      // Floor / Top floor labels
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      writeText("Floor", sxD(0) - 18, syD(0) + 9);
      const topLbl = "Top floor";
      const topLblW = textW(topLbl);
      writeText(topLbl, sxD(calc.totalRun) + 6 - topLblW + topLblW, syD(totalRise) - 4);

      y = diagramTop + diagramH + 16;
    }

    // ========== INPUTS ==========
    sectionHeader("Design inputs");
    kv("Total rise (floor to floor)", `${totalRise.toFixed(3)}"`);
    kv("Preferred tread depth", `${treadDepth.toFixed(3)}"`);
    kv("Target riser height", `${riserHeight.toFixed(3)}"`);
    kv("Tread nosing (overhang)", `${nosing.toFixed(3)}"`);
    kv("Stringer stock", `${stock} (${STOCK_WIDTH[stock]}" nominal)`);
    y += 14;

    // ========== LAYOUT ==========
    sectionHeader("Computed layout");
    kv("Total risers", `${calc.totalRisers}`);
    kv("Total treads", `${calc.totalTreads}`);
    kv("Actual rise per step", `${calc.actualRise.toFixed(3)}"`);
    kv("Total run (incl. landings)", `${calc.totalRun.toFixed(3)}"`);
    kv("Stair angle", `${calc.angleDeg.toFixed(2)} degrees`);
    kv("Throat depth (min)", `${calc.throat.toFixed(3)}"`);
    kv(
      "Flights",
      calc.flights.length === 1
        ? "1 (no landings required)"
        : `${calc.flights.length} (${calc.numLandings} intermediate landing${calc.numLandings === 1 ? "" : "s"})`,
    );
    y += 14;

    // ========== FLIGHTS & LANDINGS (simple list) ==========
    if (calc.flights.length > 1) {
      sectionHeader("Flights and landings");
      calc.flights.forEach((f) => {
        newPageIfNeeded(20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...INK);
        writeText(`Flight ${f.index + 1}`, MARGIN, y);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...INK);
        const detail = `${f.numRisers} risers, ${f.numTreads} treads, ${f.rise.toFixed(2)}" rise, ${f.run.toFixed(2)}" run, ${f.stockLength} ft ${stock}`;
        writeText(detail, MARGIN + 72, y);
        y += 16;

        if (f.index < calc.flights.length - 1) {
          newPageIfNeeded(20);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(...INK);
          writeText(`Landing ${f.index + 1}`, MARGIN, y);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(...INK);
          const landingLine = `${calc.landingDepth}" deep platform at ${calc.landingHeights[f.index].toFixed(2)}" from floor`;
          writeText(landingLine, MARGIN + 72, y);
          y += 16;
        }
      });
      y += 14;
    }

    // ========== CODE COMPLIANCE ==========
    sectionHeader("Code compliance");
    compliance.forEach((c, idx) => {
      newPageIfNeeded(40);
      const tone = c.state === "pass" ? PASS : c.state === "warn" ? WARN : FAIL;
      const tag = c.state === "pass" ? "PASS" : c.state === "warn" ? "WARN" : "FAIL";

      // Top row: dot + label (left) and value (right)
      doc.setFillColor(...tone);
      doc.circle(MARGIN + 3, y - 3, 3, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      writeText(c.label, MARGIN + 14, y);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      const vw = textW(c.value);
      writeText(c.value, PAGE_W - MARGIN - vw, y);

      y += 13;

      // Bottom row: rule text (left) and PASS/WARN/FAIL (right)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      writeText(c.ruleText, MARGIN + 14, y);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...tone);
      const tagW = textW(tag);
      writeText(tag, PAGE_W - MARGIN - tagW, y);

      y += 12;

      if (idx < compliance.length - 1) {
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.25);
        doc.line(MARGIN, y, PAGE_W - MARGIN, y);
        y += 10;
      }
    });
    y += 18;

    // ========== CUT LIST ==========
    sectionHeader("Cut list");

    const writeCutLine = (label: string, text: string, tone: [number, number, number] = INK) => {
      newPageIfNeeded(18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...tone);
      writeText(label, MARGIN, y);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      writeText(text, MARGIN + 90, y);
      y += 16;
    };

    calc.flights.forEach((f) => {
      const label = calc.flights.length === 1 ? "Stringers" : `Flight ${f.index + 1}`;
      writeCutLine(
        label,
        `Cut 2 stringers from ${f.stockLength} ft ${stock} (${f.numRisers} risers / ${f.numTreads} treads)`,
      );
      if (f.index < calc.flights.length - 1) {
        writeCutLine(
          `Landing ${f.index + 1}`,
          `Frame ${calc.landingDepth}" deep platform at ${calc.landingHeights[f.index].toFixed(2)}" from floor`,
        );
      }
    });
    writeCutLine("Treads", `Mark ${calc.totalTreads} at ${treadDepth.toFixed(3)}" deep`);
    writeCutLine("Risers", `Mark ${calc.totalRisers} at ${calc.actualRise.toFixed(3)}" tall`);
    writeCutLine("Angle", `${calc.angleDeg.toFixed(1)} degrees from horizontal per flight`);
    writeCutLine("Throat", `Maintain at least ${calc.throat.toFixed(2)}" behind each notch cut`);

    // ========== FOOTER ==========
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      const footY = PAGE_H - 28;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      writeText(
        "Verify all dimensions on site before cutting.",
        MARGIN,
        footY,
      );
      const pageLabel = `Page ${p} of ${totalPages}`;
      const plW = textW(pageLabel);
      writeText(pageLabel, PAGE_W - MARGIN - plW, footY);
    }

    doc.save(`stairmath-spec-${todayIso}.pdf`);
  };

  const reset = () => {
    setTotalRise(DEFAULTS.totalRise);
    setTreadDepth(DEFAULTS.treadDepth);
    setRiserHeight(DEFAULTS.riserHeight);
    setNosing(DEFAULTS.nosing);
    setStock(DEFAULTS.stock);
  };

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 220, damping: 24 },
    },
  };

  const u = unitLabel(unit);

  return (
    <>
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />
      <div className="grain" />

      <motion.main
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 max-w-[1380px] mx-auto px-6 md:px-10 py-10 md:py-14"
      >
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-8 items-start">
          {/* LEFT COLUMN */}
          <motion.aside
            variants={item}
            className="lg:sticky lg:top-10 flex flex-col gap-6 order-2 lg:order-1"
          >
            <header className="flex flex-col gap-3 px-1">
              <h1 className="font-display text-[48px] leading-[1.02] text-white">
                Stair<em className="text-[#7dd3fc] not-italic font-display italic">Math</em>
              </h1>
              <p className="text-[14px] text-[var(--color-ink-muted)] max-w-[360px] leading-relaxed">
                Enter your floor-to-floor height. We compute a code-compliant
                layout and cut list in real time.
              </p>
            </header>

            <div className="flex items-center justify-between">
              <span className="text-[12px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                Units
              </span>
              <div className="segmented" role="tablist" aria-label="Units">
                <button
                  type="button"
                  role="tab"
                  aria-selected={unit === "imperial"}
                  className={unit === "imperial" ? "active" : ""}
                  onClick={() => setUnit("imperial")}
                >
                  Imperial
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={unit === "metric"}
                  className={unit === "metric" ? "active" : ""}
                  onClick={() => setUnit("metric")}
                >
                  Metric
                </button>
              </div>
            </div>

            <motion.section
              variants={item}
              className="glass interactive rounded-[20px] p-6 flex flex-col gap-5"
            >
              <h2 className="text-[13px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] font-medium">
                Design inputs
              </h2>

              <NumberInput
                id="totalRise"
                label="Total rise (floor to floor)"
                value={totalRise}
                min={12}
                step={0.125}
                unit={unit}
                displayUnit={u}
                onChange={setTotalRise}
              />

              <NumberInput
                id="treadDepth"
                label="Preferred tread depth"
                value={treadDepth}
                min={8}
                max={14}
                step={0.125}
                unit={unit}
                displayUnit={u}
                onChange={setTreadDepth}
              />

              <NumberInput
                id="riserHeight"
                label="Target riser height"
                value={riserHeight}
                min={4}
                max={9}
                step={0.125}
                unit={unit}
                displayUnit={u}
                onChange={setRiserHeight}
              />

              <NumberInput
                id="nosing"
                label="Tread nosing (overhang)"
                value={nosing}
                min={0}
                max={1.5}
                step={0.125}
                unit={unit}
                displayUnit={u}
                onChange={setNosing}
              />

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="stock"
                  className="text-[12px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] font-medium"
                >
                  Stringer stock
                </label>
                <select
                  id="stock"
                  className="glass-input appearance-none pr-10"
                  value={stock}
                  onChange={(e) => setStock(e.target.value as Stock)}
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'><path d='M1 1.5L6 6.5L11 1.5' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round'/></svg>\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 14px center",
                  }}
                >
                  <option value="2x10" className="bg-[#0a0e1a]">
                    2x10 (9.25″ nominal)
                  </option>
                  <option value="2x12" className="bg-[#0a0e1a]">
                    2x12 (11.25″ nominal)
                  </option>
                </select>
              </div>

              <button type="button" className="ghost-btn mt-1" onClick={reset}>
                Reset to defaults
              </button>
            </motion.section>
          </motion.aside>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-6 order-1 lg:order-2">
            <motion.section variants={item}>
              <StairSVG
                totalRise={totalRise}
                calc={calc}
                treadDepth={treadDepth}
                nosing={nosing}
                stockWidth={STOCK_WIDTH[stock]}
              />
            </motion.section>

            <motion.section
              variants={item}
              className="flex items-center justify-between gap-4 px-1"
            >
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                  Overall status
                </span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={allCompliant ? "pass" : "fail"}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className={`font-display text-[22px] mt-1 ${
                      allCompliant ? "text-[#7dd3fc]" : "text-[#fb7185]"
                    }`}
                  >
                    {allCompliant ? "Code compliant" : "Needs adjustment"}
                  </motion.span>
                </AnimatePresence>
              </div>
              <div className="flex items-center gap-3">
                {allCompliant ? (
                  <span
                    className="pill pill-pass"
                    style={{ padding: "8px 14px", fontSize: "13px" }}
                  >
                    <IconCheck /> IRC passing
                  </span>
                ) : fix ? (
                  <button
                    type="button"
                    onClick={applyAutoFix}
                    className="auto-fix-btn"
                    title={fix.notes.join(" · ")}
                  >
                    <IconWand />
                    Auto-fix
                  </button>
                ) : null}
              </div>
            </motion.section>

            <motion.section
              variants={item}
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
              <StatCard
                label="Steps"
                value={calc.totalRisers}
                unit="risers"
                decimals={0}
                sub={
                  calc.flights.length > 1
                    ? `${calc.flights.length} flights`
                    : undefined
                }
              />
              <StatCard
                label="Rise / step"
                value={calc.actualRise}
                unit="″"
                decimals={3}
              />
              <StatCard
                label="Total run"
                value={calc.totalRun}
                unit="″"
                decimals={2}
                sub={
                  calc.numLandings > 0
                    ? `+${calc.numLandings} landing${calc.numLandings === 1 ? "" : "s"}`
                    : undefined
                }
              />
              <StatCard
                label="Stringer stock"
                value={calc.maxStockLength}
                unit="ft"
                decimals={0}
                sub={
                  calc.flights.length > 1
                    ? `per flight`
                    : `hyp. ${calc.hypotenuse.toFixed(1)}″`
                }
              />
            </motion.section>

            {calc.numLandings > 0 && (
              <motion.section
                variants={item}
                className="glass interactive rounded-[20px] p-6 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] font-medium">
                    Intermediate landings
                  </h2>
                  <span className="text-[11px] text-[var(--color-ink-muted)]">
                    IRC R311.7.3 · auto-placed
                  </span>
                </div>
                <div className="text-[12px] text-[var(--color-ink-muted)] leading-relaxed">
                  Total rise exceeds the 151″ single-flight limit, so we split
                  it into {calc.flights.length} flights with{" "}
                  {calc.numLandings} platform
                  {calc.numLandings === 1 ? "" : "s"} between them.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {calc.landingHeights.map((h, i) => (
                    <div
                      key={`lp-${i}`}
                      className="rounded-[14px] border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                          Landing {i + 1}
                        </span>
                        <span className="text-[10px] text-[var(--color-ink-muted)] font-[var(--font-mono)]">
                          between flights {i + 1} & {i + 2}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-[26px] text-white tabular leading-none">
                          {h.toFixed(2)}
                        </span>
                        <span className="text-[11px] text-[var(--color-ink-muted)] font-[var(--font-mono)]">
                          ″ from floor
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-[var(--color-ink-muted)] font-[var(--font-mono)] pt-1 border-t border-white/5">
                        <span>
                          Depth{" "}
                          <span className="text-white tabular">
                            {calc.landingDepth}″
                          </span>
                        </span>
                        <span className="opacity-40">·</span>
                        <span>
                          Min width = stair width
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            <motion.section
              variants={item}
              className="glass interactive rounded-[20px] p-6 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] font-medium">
                  Code compliance
                </h2>
                <span className="text-[11px] text-[var(--color-ink-muted)]">
                  {compliance.filter((c) => c.state === "pass").length}/
                  {compliance.length} passing
                </span>
              </div>
              {compliance.map((c) => (
                <ComplianceRow c={c} key={c.key} />
              ))}
            </motion.section>

            <motion.section
              variants={item}
              className="glass interactive rounded-[20px] p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-[13px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] font-medium">
                    Cut list
                  </h2>
                  <span className="text-[11px] text-[var(--color-ink-muted)] font-[var(--font-mono)]">
                    {stock}
                    {calc.flights.length === 1
                      ? ` · ${calc.maxStockLength}ft`
                      : ` · ${calc.flights.length} flights`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={exportSpec}
                  className="export-btn"
                  aria-label="Export specification"
                >
                  <IconDownload />
                  Export spec
                </button>
              </div>
              <div className="font-[var(--font-mono)] text-[13px] leading-[1.9] text-[var(--color-ink)] bg-black/20 rounded-[12px] p-4 border border-white/5">
                {calc.flights.map((f) => (
                  <div key={`cut-f-${f.index}`}>
                    <span className="text-[#7dd3fc]">→</span>{" "}
                    {calc.flights.length === 1 ? (
                      <>Cut</>
                    ) : (
                      <>
                        Flight{" "}
                        <span className="tabular text-white">{f.index + 1}</span>: cut
                      </>
                    )}{" "}
                    <span className="tabular text-white">2</span> stringers from{" "}
                    <span className="tabular text-white">{f.stockLength}</span>ft{" "}
                    <span className="text-white">{stock}</span> ·{" "}
                    <span className="tabular text-white">{f.numRisers}</span> risers /{" "}
                    <span className="tabular text-white">{f.numTreads}</span> treads.
                  </div>
                ))}
                {calc.numLandings > 0 && (
                  <div>
                    <span className="text-[#7dd3fc]">→</span> Frame{" "}
                    <span className="tabular text-white">{calc.numLandings}</span>{" "}
                    landing
                    {calc.numLandings === 1 ? "" : "s"} at{" "}
                    <span className="tabular text-white">{calc.landingDepth}</span>″
                    deep, heights{" "}
                    <span className="tabular text-white">
                      {calc.landingHeights.map((h) => `${h.toFixed(2)}″`).join(", ")}
                    </span>{" "}
                    from floor.
                  </div>
                )}
                <div>
                  <span className="text-[#7dd3fc]">→</span> Mark all treads at{" "}
                  <span className="tabular text-white">
                    {treadDepth.toFixed(3)}
                  </span>
                  ″ deep, all risers at{" "}
                  <span className="tabular text-white">
                    {calc.actualRise.toFixed(3)}
                  </span>
                  ″ tall.
                </div>
                <div className="text-[var(--color-ink-muted)]">
                  <span className="text-[#7dd3fc]">→</span> Layout angle{" "}
                  <span className="tabular text-white">
                    {calc.angleDeg.toFixed(1)}
                  </span>
                  ° per flight. Throat depth{" "}
                  <span className="tabular text-white">
                    {calc.throat.toFixed(2)}
                  </span>
                  ″.
                </div>
              </div>
            </motion.section>

            <div className="text-center text-[11px] text-[var(--color-ink-muted)] pt-2">
              Values are rounded for display. Always verify on site.
            </div>
          </div>
        </div>
      </motion.main>
    </>
  );
}

function StatCard({
  label,
  value,
  unit,
  decimals,
  sub,
}: {
  label: string;
  value: number;
  unit: string;
  decimals: number;
  sub?: string;
}) {
  return (
    <motion.div className="glass interactive rounded-[20px] p-5 flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="font-display text-[32px] text-white leading-none tabular">
          <AnimatedNumber value={value} decimals={decimals} />
        </span>
        <span className="text-[12px] text-[var(--color-ink-muted)] font-[var(--font-mono)]">
          {unit}
        </span>
      </div>
      {sub && (
        <div className="text-[11px] text-[var(--color-ink-muted)] tabular">
          {sub}
        </div>
      )}
    </motion.div>
  );
}

function StairSVG({
  totalRise,
  calc,
  treadDepth,
  nosing,
  stockWidth,
}: {
  totalRise: number;
  calc: StairCalc;
  treadDepth: number;
  nosing: number;
  stockWidth: number;
}) {
  const { flights, angleDeg, totalRun, landingDepth } = calc;
  const VW = 820;
  const VH = 460;
  const margin = { top: 50, right: 120, bottom: 70, left: 90 };
  const plotW = VW - margin.left - margin.right;
  const plotH = VH - margin.top - margin.bottom;

  const drawRun = Math.max(totalRun, 1);
  const drawRise = Math.max(totalRise, 1);
  const scale = Math.min(plotW / drawRun, plotH / drawRise);

  const originX = margin.left;
  const originY = margin.top + plotH;

  const sx = (x: number) => originX + x * scale;
  const sy = (y: number) => originY - y * scale;

  const angleRad = (angleDeg * Math.PI) / 180;
  const perpX = Math.sin(angleRad) * stockWidth;
  const perpY = Math.cos(angleRad) * stockWidth;

  type FlightPaths = {
    stringerPath: string;
    treads: { x: number; y: number; num: number }[];
    risers: { x: number; y: number; h: number }[];
  };

  let cumStepNum = 0;
  const flightPaths: FlightPaths[] = flights.map((f) => {
    const fx = f.startX;
    const fy = f.startY;

    const topPts: { x: number; y: number }[] = [{ x: fx, y: fy }];
    for (let i = 0; i < f.numTreads; i++) {
      const baseX = fx + i * treadDepth;
      const riseY = fy + (i + 1) * calc.actualRise;
      topPts.push({ x: baseX, y: riseY });
      topPts.push({ x: baseX + treadDepth, y: riseY });
    }
    topPts.push({ x: fx + f.numTreads * treadDepth, y: fy + f.rise });

    const stringerPath =
      `M ${sx(topPts[0].x)} ${sy(topPts[0].y)} ` +
      topPts.slice(1).map((p) => `L ${sx(p.x)} ${sy(p.y)}`).join(" ") +
      ` L ${sx(fx + f.run + perpX)} ${sy(fy + f.rise - perpY)} ` +
      ` L ${sx(fx - perpX)} ${sy(fy - perpY)} Z`;

    const treads: { x: number; y: number; num: number }[] = [];
    const risers: { x: number; y: number; h: number }[] = [];
    for (let i = 0; i < f.numRisers; i++) {
      const y = fy + (i + 1) * calc.actualRise;
      risers.push({
        x: fx + Math.min(i, f.numTreads) * treadDepth,
        y: fy + i * calc.actualRise,
        h: calc.actualRise,
      });
      if (i < f.numTreads) {
        cumStepNum += 1;
        treads.push({ x: fx + i * treadDepth, y, num: cumStepNum });
      }
    }
    return { stringerPath, treads, risers };
  });

  // Angle arc (on the first flight at the bottom)
  const arcR = 55;
  const arcEndX = originX + arcR * Math.cos(angleRad);
  const arcEndY = originY - arcR * Math.sin(angleRad);
  const arcPath = `M ${originX + arcR} ${originY} A ${arcR} ${arcR} 0 0 0 ${arcEndX} ${arcEndY}`;

  return (
    <div className="glass interactive rounded-[24px] p-5 md:p-6 relative overflow-hidden">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-[13px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] font-medium">
          Side profile
        </h2>
        <div className="flex items-center gap-4 text-[11px] text-[var(--color-ink-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[2px] bg-[#7dd3fc]" /> Stringer
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[2px] bg-white/50" /> Tread / riser
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full h-auto"
        role="img"
        aria-label="Side profile of stair stringer"
      >
        <defs>
          <linearGradient id="stringerFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(125,211,252,0.28)" />
            <stop offset="100%" stopColor="rgba(125,211,252,0.08)" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <line
          x1={margin.left - 20}
          y1={originY}
          x2={originX + totalRun * scale + 40}
          y2={originY}
          stroke="rgba(255,255,255,0.12)"
          strokeDasharray="4 6"
        />
        <line
          x1={originX - 40}
          y1={sy(totalRise)}
          x2={originX + totalRun * scale + 20}
          y2={sy(totalRise)}
          stroke="rgba(255,255,255,0.12)"
          strokeDasharray="4 6"
        />

        {/* Landing platforms (between flights) */}
        {flights.slice(0, -1).map((f, i) => {
          const landingX0 = f.startX + f.run;
          const landingY = f.startY + f.rise;
          const platformThickness = Math.max(6, stockWidth * 0.9);
          const rectX = sx(landingX0);
          const rectY = sy(landingY);
          const rectW = landingDepth * scale;
          const rectH = platformThickness * scale;

          // Badge offset: below and to the RIGHT of the platform, with an
          // L-shaped leader that rises up and bends left to the platform.
          const badgeW = 120;
          const badgeH = 34;
          const badgeOffsetX = 70;
          const badgeOffsetY = rectH + 34;
          const badgeCenterX = rectX + rectW / 2 + badgeOffsetX;
          const badgeTop = rectY + badgeOffsetY;
          const badgeLeft = badgeCenterX - badgeW / 2;

          // L-leader: from top-center of badge, rise up, then left to the
          // platform's bottom-right corner.
          const leaderStartX = badgeCenterX;
          const leaderStartY = badgeTop;
          const leaderElbowX = badgeCenterX;
          const leaderElbowY = rectY + rectH - 2;
          const leaderEndX = rectX + rectW;
          const leaderEndY = rectY + rectH - 2;

          return (
            <g key={`landing-${i}`}>
              {/* Dashed elevation guide from left margin */}
              <line
                x1={margin.left - 30}
                y1={rectY}
                x2={rectX}
                y2={rectY}
                stroke="rgba(251,191,36,0.3)"
                strokeDasharray="3 5"
                strokeWidth={1}
              />

              {/* Platform slab */}
              <rect
                x={rectX}
                y={rectY}
                width={rectW}
                height={rectH}
                fill="rgba(251,191,36,0.22)"
                stroke="#fbbf24"
                strokeWidth={1.75}
                rx={2}
                ry={2}
              />
              <line
                x1={rectX + 4}
                y1={rectY + 0.5}
                x2={rectX + rectW - 4}
                y2={rectY + 0.5}
                stroke="rgba(255,255,255,0.5)"
                strokeWidth={1.25}
              />

              {/* Landing-depth dimension below */}
              <line
                x1={rectX}
                y1={rectY + rectH + 10}
                x2={rectX + rectW}
                y2={rectY + rectH + 10}
                stroke="#fbbf24"
                strokeWidth={1}
              />
              <line
                x1={rectX}
                y1={rectY + rectH + 6}
                x2={rectX}
                y2={rectY + rectH + 14}
                stroke="#fbbf24"
                strokeWidth={1}
              />
              <line
                x1={rectX + rectW}
                y1={rectY + rectH + 6}
                x2={rectX + rectW}
                y2={rectY + rectH + 14}
                stroke="#fbbf24"
                strokeWidth={1}
              />
              <text
                x={rectX + rectW / 2}
                y={rectY + rectH + 22}
                textAnchor="middle"
                fontSize="9.5"
                fill="#fbbf24"
                fontFamily="Geist Mono, monospace"
              >
                {landingDepth}″
              </text>

              {/* L-shaped leader: badge → down → right → platform */}
              <polyline
                points={`${leaderStartX},${leaderStartY} ${leaderElbowX},${leaderElbowY} ${leaderEndX},${leaderEndY}`}
                fill="none"
                stroke="rgba(251,191,36,0.6)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <circle cx={leaderEndX} cy={leaderEndY} r={2} fill="#fbbf24" />

              {/* Badge (above-left of platform) */}
              <rect
                x={badgeLeft}
                y={badgeTop}
                width={badgeW}
                height={badgeH}
                rx={badgeH / 2}
                ry={badgeH / 2}
                fill="rgba(10,14,26,0.94)"
                stroke="#fbbf24"
                strokeWidth={1.25}
              />
              <text
                x={badgeCenterX}
                y={badgeTop + 14}
                textAnchor="middle"
                fontSize="8.5"
                fill="#fbbf24"
                fontFamily="Geist, sans-serif"
                letterSpacing="1.2"
                fontWeight="600"
              >
                LANDING {i + 1}
              </text>
              <text
                x={badgeCenterX}
                y={badgeTop + 27}
                textAnchor="middle"
                fontSize="10.5"
                fill="#ffffff"
                fontFamily="Geist Mono, monospace"
                fontWeight="500"
              >
                {landingY.toFixed(1)}″ from floor
              </text>
            </g>
          );
        })}

        {flightPaths.map((fp, fi) => (
          <g key={`flight-${fi}`}>
            <motion.path
              d={fp.stringerPath}
              fill="url(#stringerFill)"
              stroke="#7dd3fc"
              strokeWidth={1.5}
              filter="url(#glow)"
              animate={{ d: fp.stringerPath }}
              transition={{ type: "spring", stiffness: 160, damping: 22 }}
            />
            {fp.treads.map((t, i) => (
              <g key={`t-${fi}-${i}`}>
                <line
                  x1={sx(t.x - nosing)}
                  y1={sy(t.y)}
                  x2={sx(t.x)}
                  y2={sy(t.y)}
                  stroke="rgba(125,211,252,0.55)"
                  strokeWidth={1.25}
                />
                <line
                  x1={sx(t.x)}
                  y1={sy(t.y)}
                  x2={sx(t.x + treadDepth)}
                  y2={sy(t.y)}
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={1.25}
                />
              </g>
            ))}
            {fp.risers.map((r, i) => (
              <line
                key={`r-${fi}-${i}`}
                x1={sx(r.x)}
                y1={sy(r.y)}
                x2={sx(r.x)}
                y2={sy(r.y + r.h)}
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={1.25}
              />
            ))}
            {fp.treads.map((t, i) => (
              <g key={`d-${fi}-${i}`}>
                <circle
                  cx={sx(t.x + treadDepth / 2)}
                  cy={sy(t.y) - 10}
                  r={9}
                  fill="rgba(10,14,26,0.85)"
                  stroke="rgba(125,211,252,0.4)"
                />
                <text
                  x={sx(t.x + treadDepth / 2)}
                  y={sy(t.y) - 6.5}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#94a3b8"
                  fontFamily="Geist Mono, monospace"
                >
                  {t.num}
                </text>
              </g>
            ))}
          </g>
        ))}

        {/* Total rise dimension */}
        <g>
          <line
            x1={margin.left - 40}
            y1={originY}
            x2={margin.left - 40}
            y2={sy(totalRise)}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={1}
          />
          <line
            x1={margin.left - 46}
            y1={originY}
            x2={margin.left - 34}
            y2={originY}
            stroke="rgba(255,255,255,0.3)"
          />
          <line
            x1={margin.left - 46}
            y1={sy(totalRise)}
            x2={margin.left - 34}
            y2={sy(totalRise)}
            stroke="rgba(255,255,255,0.3)"
          />
          <text
            x={margin.left - 50}
            y={(originY + sy(totalRise)) / 2}
            textAnchor="middle"
            fontSize="11"
            fill="#94a3b8"
            fontFamily="Geist, sans-serif"
            transform={`rotate(-90 ${margin.left - 50} ${(originY + sy(totalRise)) / 2})`}
          >
            Total rise: {totalRise.toFixed(2)}″
          </text>
        </g>

        {/* Total run dimension */}
        <g>
          <line
            x1={originX}
            y1={originY + 40}
            x2={originX + totalRun * scale}
            y2={originY + 40}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={1}
          />
          <line
            x1={originX}
            y1={originY + 34}
            x2={originX}
            y2={originY + 46}
            stroke="rgba(255,255,255,0.3)"
          />
          <line
            x1={originX + totalRun * scale}
            y1={originY + 34}
            x2={originX + totalRun * scale}
            y2={originY + 46}
            stroke="rgba(255,255,255,0.3)"
          />
          <text
            x={originX + (totalRun * scale) / 2}
            y={originY + 56}
            textAnchor="middle"
            fontSize="11"
            fill="#94a3b8"
            fontFamily="Geist, sans-serif"
          >
            Total run: {totalRun.toFixed(2)}″
            {calc.numLandings > 0
              ? ` (${calc.totalTreads} treads + ${calc.numLandings} × ${landingDepth}″ landing)`
              : ` (${calc.totalTreads} × ${treadDepth.toFixed(2)}″)`}
          </text>
        </g>

        {/* Angle arc */}
        <g>
          <path
            d={arcPath}
            stroke="#fbbf24"
            strokeWidth={1.25}
            fill="none"
            opacity={0.85}
          />
          <text
            x={originX + arcR + 14}
            y={originY - arcR / 2}
            fontSize="11"
            fill="#fbbf24"
            fontFamily="Geist Mono, monospace"
          >
            {angleDeg.toFixed(1)}°
          </text>
        </g>

        <text
          x={originX + totalRun * scale + 8}
          y={sy(totalRise) - 8}
          fontSize="10"
          fill="#94a3b8"
          fontFamily="Geist, sans-serif"
        >
          Top floor
        </text>
        <text
          x={margin.left - 12}
          y={originY + 14}
          fontSize="10"
          fill="#94a3b8"
          fontFamily="Geist, sans-serif"
          textAnchor="end"
        >
          Floor
        </text>

        <text
          x={VW - margin.right + 16}
          y={margin.top + 16}
          fontSize="11"
          fill="#7dd3fc"
          fontFamily="Geist Mono, monospace"
        >
          {calc.totalRisers} risers
        </text>
        <text
          x={VW - margin.right + 16}
          y={margin.top + 32}
          fontSize="11"
          fill="#94a3b8"
          fontFamily="Geist Mono, monospace"
        >
          {calc.totalTreads} treads
        </text>
        {calc.numLandings > 0 && (
          <text
            x={VW - margin.right + 16}
            y={margin.top + 48}
            fontSize="11"
            fill="#fbbf24"
            fontFamily="Geist Mono, monospace"
          >
            {calc.flights.length} flights
          </text>
        )}
      </svg>
    </div>
  );
}
