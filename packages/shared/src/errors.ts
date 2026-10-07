export interface ApiError {
  error: string;
  message: string;
}

export const ErrorCodes = {
  BAD_REQUEST: "bad_request",
  INTERNAL_ERROR: "internal_error",
  INVALID_INPUT: "invalid_input",
  INVALID_ROOM: "invalid_room",
  INVALID_STATE: "invalid_state",
  NOT_AUTHORIZED: "not_authorized",
  PAUSED: "paused",
  RATE_LIMITED: "rate_limited",
  SESSION_EXPIRED: "session_expired",
  SESSION_REPLACED: "session_replaced",
  TOKEN_EXPIRED: "token_expired",
  UNAVAILABLE: "unavailable",
  WEBHOOK_INVALID: "webhook_invalid",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
