export class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(entity, issues) {
    super("validation_failed", `Invalid ${entity}`, { entity, issues });
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export function asAppError(error, code = "unexpected_error") {
  if (error instanceof AppError) return error;
  return new AppError(code, error instanceof Error ? error.message : String(error));
}
