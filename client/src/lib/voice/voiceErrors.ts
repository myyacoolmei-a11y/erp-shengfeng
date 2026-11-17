import { ApiError } from "../../../../shared/api-client/custom-fetch.ts";
import { VOICE_ERROR_PAYLOAD_TOO_LARGE } from "./voiceConstants.ts";

export function mapVoiceApiError(err: unknown): Error {
  if (err instanceof ApiError) {
    if (err.status === 413) {
      return new Error(VOICE_ERROR_PAYLOAD_TOO_LARGE);
    }

    const data = err.data as { error?: string; message?: string } | null;
    const serverMsg = data?.error ?? data?.message;
    if (serverMsg && !serverMsg.startsWith("HTTP ")) {
      return new Error(serverMsg);
    }

    return new Error("語音處理失敗，請重試");
  }

  if (err instanceof Error) {
    if (/413|payload too large/i.test(err.message)) {
      return new Error(VOICE_ERROR_PAYLOAD_TOO_LARGE);
    }
    return err;
  }

  return new Error("語音處理失敗，請重試");
}
