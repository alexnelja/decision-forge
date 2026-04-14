import { z } from "zod";
export const ForecastLinkSchema = z.unknown();
export type ForecastLink = z.infer<typeof ForecastLinkSchema>;
