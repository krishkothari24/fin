export interface ApiError {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
  path: string;
}

export class ApiRequestError extends Error {
  readonly body: ApiError;

  constructor(body: ApiError) {
    super(Array.isArray(body.message) ? body.message.join(", ") : body.message);
    this.name = "ApiRequestError";
    this.body = body;
  }
}
