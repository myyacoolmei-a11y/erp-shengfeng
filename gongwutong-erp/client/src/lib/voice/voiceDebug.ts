/** Voice pipeline debug logging — always on in MVP for field troubleshooting. */
const PREFIX = "[voice]";

export function voiceLog(stage: string, detail?: Record<string, unknown>) {
  if (detail !== undefined) {
    console.log(PREFIX, stage, detail);
  } else {
    console.log(PREFIX, stage);
  }
}

export function voiceWarn(stage: string, detail?: Record<string, unknown>) {
  if (detail !== undefined) {
    console.warn(PREFIX, stage, detail);
  } else {
    console.warn(PREFIX, stage);
  }
}

export function voiceError(stage: string, detail?: Record<string, unknown>) {
  if (detail !== undefined) {
    console.error(PREFIX, stage, detail);
  } else {
    console.error(PREFIX, stage);
  }
}
