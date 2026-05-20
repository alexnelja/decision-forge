import { z } from "zod";

export const NegoIssueSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(["continuous", "discrete"]),
    range: z.tuple([z.number(), z.number()]).optional(),
    options: z.array(z.string().min(1)).min(1).optional(),
    yourWeight: z.number().min(0).max(1)
  })
  .refine(
    (i) => (i.type === "continuous" ? Array.isArray(i.range) : true),
    { message: "continuous issues require a range" }
  )
  .refine(
    (i) => (i.type === "discrete" ? Array.isArray(i.options) && i.options.length > 0 : true),
    { message: "discrete issues require at least one option" }
  );
export type NegoIssue = z.infer<typeof NegoIssueSchema>;

export const NegoPersonaStyleSchema = z.enum([
  "hardball",
  "collaborative",
  "risk-averse",
  "analytical",
  "emotional"
]);

export const NegoPersonaSchema = z.object({
  style: NegoPersonaStyleSchema,
  patience: z.number().min(0).max(1),
  deceptiveness: z.number().min(0).max(1),
  model: z.enum(["gemini-2.5-pro", "gemini-2.5-flash"]),
  customPrompt: z.string().optional()
});
export type NegoPersona = z.infer<typeof NegoPersonaSchema>;

const UtilityLeafSchema = z.object({
  issue: z.string().min(1),
  weight: z.number().min(0).max(1),
  shape: z.enum(["linear", "concave"]).optional()
});

export const BatnaMCRefSchema = z.object({
  refMCVar: z.string().min(1),
  percentile: z.number().int().min(1).max(99).default(50)
});
export type BatnaMCRef = z.infer<typeof BatnaMCRefSchema>;

export const NegoSeatPrivateSchema = z.object({
  batna: z.union([z.number(), BatnaMCRefSchema]),
  reservationPrice: z.number(),
  utilityFn: z.array(UtilityLeafSchema).min(1),
  info: z.string().default("")
});

export const NegoSeatSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    controlledBy: z.enum(["you", "ai"]),
    private: NegoSeatPrivateSchema,
    persona: NegoPersonaSchema.optional()
  })
  .refine((s) => (s.controlledBy === "ai" ? !!s.persona : true), {
    message: "AI seats require a persona"
  });
export type NegoSeat = z.infer<typeof NegoSeatSchema>;

export const NegoConfigSchema = z.object({
  issues: z.array(NegoIssueSchema).min(1),
  seats: z.array(NegoSeatSchema).min(2).max(6),
  maxRounds: z.number().int().min(1).max(50).default(10),
  discountFactor: z.number().min(0).max(1).default(0.95),
  acceptanceThreshold: z.number().min(0).max(1).default(0.05),
  walkAway: z.boolean().default(true)
});
export type NegoConfig = z.infer<typeof NegoConfigSchema>;

/* ————————————————————————————————————————————
 * Runtime event types — shared with renderer for the transcript
 * ———————————————————————————————————————————— */

export const NegoOfferSchema = z.object({
  seatId: z.string(),
  roundIndex: z.number().int().nonnegative(),
  terms: z.record(z.union([z.number(), z.string()])),
  rationale: z.string().optional()
});
export type NegoOffer = z.infer<typeof NegoOfferSchema>;

export const NegoActionSchema = z.union([
  z.object({ kind: z.literal("offer"), offer: NegoOfferSchema }),
  z.object({ kind: z.literal("accept"), seatId: z.string(), offerRef: z.string() }),
  z.object({ kind: z.literal("reject"), seatId: z.string(), offerRef: z.string() }),
  z.object({ kind: z.literal("walk"), seatId: z.string() }),
  z.object({
    kind: z.literal("ask_question"),
    seatId: z.string(),
    question: z.string()
  })
]);
export type NegoAction = z.infer<typeof NegoActionSchema>;

export const NegoTranscriptEntrySchema = z.object({
  at: z.string(),
  action: NegoActionSchema,
  speech: z.string().optional()
});
export type NegoTranscriptEntry = z.infer<typeof NegoTranscriptEntrySchema>;

export const NegoSessionStateSchema = z.object({
  id: z.string(),
  config: NegoConfigSchema,
  mcSamples: z.record(z.number()).default({}),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  outcome: z
    .enum(["active", "deal", "walked", "rounds-exhausted"])
    .default("active"),
  dealTerms: z.record(z.union([z.number(), z.string()])).nullable(),
  transcript: z.array(NegoTranscriptEntrySchema),
  currentSeatId: z.string(),
  roundIndex: z.number().int().nonnegative()
});
export type NegoSessionState = z.infer<typeof NegoSessionStateSchema>;
