import { z } from "zod";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
const uuid = z.string().uuid();
const prob = z.number().min(0).max(1);

export const QuestionSchema = z.object({
  id: uuid,
  text: z.string().min(1),
  createdAt: iso,
  resolveBy: iso,
  resolutionCriteria: z.string().optional(),
  scenarioId: uuid.optional(),
  tags: z.array(z.string()).default([])
});
export type Question = z.infer<typeof QuestionSchema>;

export const PredictionSchema = z.object({
  id: uuid,
  questionId: uuid,
  probability: prob,
  madeAt: iso,
  rationale: z.string().optional(),
  confidence: z.enum(["low", "medium", "high"]).optional()
});
export type Prediction = z.infer<typeof PredictionSchema>;

export const ResolutionSchema = z.object({
  questionId: uuid,
  outcome: z.union([z.literal(0), z.literal(1)]),
  resolvedAt: iso,
  notes: z.string().optional()
});
export type Resolution = z.infer<typeof ResolutionSchema>;

export const CalibrationBucketSchema = z.object({
  predicted: prob,
  actual: prob,
  n: z.number().int().nonnegative()
});
export type CalibrationBucket = z.infer<typeof CalibrationBucketSchema>;

export const CalibrationReportSchema = z.object({
  count: z.number().int().nonnegative(),
  brier: z.number().min(0).max(1),
  buckets: z.array(CalibrationBucketSchema)
});
export type CalibrationReport = z.infer<typeof CalibrationReportSchema>;

export const ForecastLinkSchema = z.unknown();
export type ForecastLink = z.infer<typeof ForecastLinkSchema>;
