import { useCallback, useEffect, useState } from "react";
import type { CalibrationReport } from "@decision-forge/core";
import { ModuleFrame } from "../components/ModuleFrame";
import { forecastApi, type QuestionRow } from "../lib/forecast-api";
import { AskForm } from "./forecast/AskForm";
import { QuestionList } from "./forecast/QuestionList";
import { ResolveDialog } from "./forecast/ResolveDialog";
import { Calibration } from "./forecast/Calibration";
import { SeedButton } from "./forecast/SeedButton";

export default function Forecast() {
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [report, setReport] = useState<CalibrationReport | null>(null);
  const [resolving, setResolving] = useState<QuestionRow | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [list, cal] = await Promise.all([
      forecastApi.list(),
      forecastApi.calibration()
    ]);
    setRows(list);
    setReport(cal);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoaded(true));
  }, [refresh]);

  const resolvedCount = rows.filter((r) => r.resolved).length;
  const openCount = rows.length - resolvedCount;

  return (
    <ModuleFrame
      section="§ III"
      kicker="Calibration"
      title="Forecast Journal"
      accent="var(--sec-forecast)"
      lede="A ledger of your predictions at the moment they still cost something to make. The Brier score, in time, tells you whether your confidence was earned or borrowed."
      marginalia={
        <div className="space-y-6">
          <div>
            <div className="eyebrow mb-2">Entries</div>
            <div className="mt-1 font-mono text-[26px] text-ink tabular-nums">
              {rows.length}
            </div>
            <div className="meta mt-1">
              {openCount} OPEN · {resolvedCount} RESOLVED
            </div>
          </div>
          <div className="rule" />
          {loaded && rows.length === 0 && (
            <>
              <div>
                <div className="eyebrow mb-2">Try it</div>
                <p className="font-mono text-[11px] leading-[1.6] text-ink-dim mb-3">
                  Ten pre-written predictions with mixed outcomes. Gives the calibration plot something to render.
                </p>
                <SeedButton onSeeded={refresh} />
              </div>
              <div className="rule" />
            </>
          )}
          <div>
            <div className="eyebrow mb-2">On calibration</div>
            <p className="font-mono text-[11px] leading-[1.6] text-ink-dim">
              A well-calibrated forecaster says "70%" on the days where, counted, 70% of things happen.
            </p>
          </div>
        </div>
      }
    >
      <AskForm onAsked={refresh} />
      <Calibration report={report} />
      <div className="rule mt-6 mb-6" />
      <QuestionList rows={rows} onResolve={setResolving} />

      {resolving && (
        <ResolveDialog
          question={resolving}
          onClose={() => setResolving(null)}
          onResolved={refresh}
        />
      )}
    </ModuleFrame>
  );
}
