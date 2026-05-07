export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, 'NOT_FOUND', 404, { entity, id })
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, context)
    this.name = 'ValidationError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403)
    this.name = 'ForbiddenError'
  }
}

export class ExtractionError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'EXTRACTION_ERROR', 500, context)
    this.name = 'ExtractionError'
  }
}

export class ProviderError extends AppError {
  constructor(provider: string, message: string, context?: Record<string, unknown>) {
    super(message, 'PROVIDER_ERROR', 502, { provider, ...context })
    this.name = 'ProviderError'
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
