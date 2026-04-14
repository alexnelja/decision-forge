import type {
  Question, Prediction, Resolution, CalibrationReport
} from "@decision-forge/core";

export type QuestionRow = {
  id: string;
  text: string;
  createdAt: string;
  resolveBy: string;
  resolutionCriteria: string | null;
  scenarioId: string | null;
  tags: string[];
  latestProbability: number | null;
  latestMadeAt: string | null;
  outcome: 0 | 1 | null;
  resolvedAt: string | null;
  resolved: boolean;
};

export const forecastApi = {
  ask: (q: Question, p: Prediction) =>
    window.api.forecast.ask({ question: q, prediction: p }),
  predict: (p: Prediction) => window.api.forecast.predict(p),
  resolve: (r: Resolution) => window.api.forecast.resolve(r),
  list: () => window.api.forecast.list() as Promise<QuestionRow[]>,
  calibration: () => window.api.forecast.calibration() as Promise<CalibrationReport>
};

export function isoNow(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}
