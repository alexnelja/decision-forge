import { z } from "zod";
export const NegoConfigSchema = z.unknown();
export type NegoConfig = z.infer<typeof NegoConfigSchema>;
