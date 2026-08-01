import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env["JWT_SECRET"] || "dev-jwt-secret-change-before-deploying";

/** 短效簽章，讓 <img> / 下載連結不必帶 Authorization header；不暴露任何儲存金鑰。 */
export interface SubsidyFilePayload {
  typ: "subsidy_file";
  workOrderId: number;
  userId: number;
}

export const SUBSIDY_FILE_TOKEN_TTL_SECONDS = 30 * 60;

export function signSubsidyFileToken(workOrderId: number, userId: number): string {
  return jwt.sign(
    { typ: "subsidy_file", workOrderId, userId } satisfies SubsidyFilePayload,
    JWT_SECRET,
    { expiresIn: SUBSIDY_FILE_TOKEN_TTL_SECONDS },
  );
}

export function verifySubsidyFileToken(
  token: string,
): { workOrderId: number; userId: number } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as Partial<SubsidyFilePayload>;
    if (payload.typ !== "subsidy_file") return null;
    const workOrderId = Number(payload.workOrderId);
    const userId = Number(payload.userId);
    if (!Number.isFinite(workOrderId) || workOrderId <= 0) return null;
    if (!Number.isFinite(userId) || userId <= 0) return null;
    return { workOrderId, userId };
  } catch {
    return null;
  }
}
