import type { CalibrationReport } from "@decision-forge/core";

export function Calibration({ report }: { report: CalibrationReport | null }) {
  if (!report || report.count === 0) {
    return (
      <div className="py-6">
        <div className="eyebrow mb-2">Calibration</div>
        <p
          className="font-display text-[15px] text-ink-dim max-w-[60ch]"
          style={{ fontVariationSettings: '"opsz" 16, "wght" 360' }}
        >
          No resolved questions yet. Resolve a prediction and the Brier score
          will appear here, with one dot on the diagonal for every decile.
        </p>
      </div>
    );
  }

  const color =
    report.brier < 0.2 ? "var(--sec-forecast)" : "var(--ink)";

  // SVG: 0,0 bottom-left → 1,1 top-right. Plot area 200 × 200.
  const W = 200;
  const H = 200;
  const pad = 20;
  const px = (p: number) => pad + p * (W - 2 * pad);
  const py = (p: number) => H - pad - p * (H - 2 * pad);

  return (
    <div className="py-6 grid grid-cols-[260px_1fr] gap-10 items-start">
      <div>
        <div className="eyebrow mb-2">Brier</div>
        <div
          className="font-display leading-none tabular-nums"
          style={{
            color,
            fontVariationSettings: '"opsz" 144, "wght" 300',
            fontSize: 72
          }}
        >
          {report.brier.toFixed(3)}
        </div>
        <div className="meta mt-3">
          {report.count} RESOLVED · LOWER IS BETTER
        </div>
      </div>

      <div>
        <div className="eyebrow mb-3">Reliability plot</div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-[260px] h-[260px]"
          aria-label="calibration plot"
        >
          {/* Axis frame */}
          <rect
            x={pad}
            y={pad}
            width={W - 2 * pad}
            height={H - 2 * pad}
            fill="none"
            stroke="var(--rule)"
            strokeWidth={1}
          />
          {/* Perfect-calibration diagonal */}
          <line
            x1={px(0)}
            y1={py(0)}
            x2={px(1)}
            y2={py(1)}
            stroke="var(--ink-faint)"
            strokeDasharray="2 3"
            strokeWidth={0.75}
          />
          {/* Bucket dots */}
          {report.buckets.map((b, i) => (
            <g key={i}>
              <circle
                cx={px(b.predicted)}
                cy={py(b.actual)}
                r={Math.max(2, Math.min(8, Math.sqrt(b.n) * 2))}
                fill="var(--sec-forecast)"
                opacity={0.85}
              />
            </g>
          ))}
          {/* Axis labels */}
          <text x={pad} y={H - 4} fontSize={8} fill="var(--ink-faint)" fontFamily="var(--font-mono)">
            0
          </text>
          <text x={W - pad - 6} y={H - 4} fontSize={8} fill="var(--ink-faint)" fontFamily="var(--font-mono)">
            1
          </text>
          <text x={4} y={py(1) + 3} fontSize={8} fill="var(--ink-faint)" fontFamily="var(--font-mono)">
            1
          </text>
          <text x={4} y={py(0) + 3} fontSize={8} fill="var(--ink-faint)" fontFamily="var(--font-mono)">
            0
          </text>
          <text
            x={W / 2}
            y={H - 4}
            fontSize={7}
            fill="var(--ink-dim)"
            fontFamily="var(--font-sans)"
            textAnchor="middle"
          >
            predicted
          </text>
        </svg>
      </div>
    </div>
  );
}
