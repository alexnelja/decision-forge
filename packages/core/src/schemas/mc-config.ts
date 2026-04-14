import { z } from "zod";
export const MCConfigSchema = z.unknown();
export type MCConfig = z.infer<typeof MCConfigSchema>;
