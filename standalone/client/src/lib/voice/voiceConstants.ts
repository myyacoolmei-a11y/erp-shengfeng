/** Maximum single recording length for field use (noisy environments). */
export const VOICE_MAX_RECORDING_MS = 15_000;

/** Reject oversized blobs before base64 upload (~15s mobile Safari at high bitrate). */
export const VOICE_MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export const VOICE_ERROR_TOO_LONG = "錄音太長，請重新錄製";
export const VOICE_ERROR_PAYLOAD_TOO_LARGE = "錄音太長或檔案太大，請控制在15秒內";
