export function unwrapGameEnvelope<T>(payload: any): T {
  return (payload?.data?.data ?? payload?.data ?? payload) as T;
}

export function extractGameError(payload: any): string {
  if (typeof payload?.error === "string" && payload.error) return payload.error;
  if (typeof payload?.error?.message === "string" && payload.error.message) return payload.error.message;
  if (typeof payload?.data?.error?.message === "string" && payload.data.error.message) return payload.data.error.message;
  if (typeof payload?.data?.message === "string" && payload.data.message) return payload.data.message;
  return "Request failed";
}
