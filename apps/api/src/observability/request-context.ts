import { AsyncLocalStorage } from "async_hooks";

/**
 * Per-request context carried implicitly through the async call tree, so any
 * layer (services, the exception filter, the error reporter) can attach the
 * request id / user id to a log line without threading them through every call.
 */
export interface RequestStore {
  requestId: string;
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

/** The current request's store, or undefined outside an HTTP request (e.g. jobs). */
export function currentRequest(): RequestStore | undefined {
  return requestContext.getStore();
}
