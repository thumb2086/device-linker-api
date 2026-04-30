import { z } from "zod";

export const ApiResponseEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().nullable().optional(),
  requestId: z.string(),
  timestamp: z.number(),
});

export type ApiResponseEnvelope = z.infer<typeof ApiResponseEnvelopeSchema>;

export function createApiEnvelope<T>(data: T, requestId: string, success = true, error: string | null = null): ApiResponseEnvelope {
  return {
    success,
    data,
    error,
    requestId,
    timestamp: Date.now(),
  };
}
