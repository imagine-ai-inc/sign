/** Public API error. `code` is stable and machine readable; `message` is for humans. */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: Record<string, unknown>,
    public headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}
