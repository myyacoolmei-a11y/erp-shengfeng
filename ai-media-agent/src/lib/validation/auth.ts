const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

export interface AuthFormValues {
  email: string;
  password: string;
}

export interface AuthFormErrors {
  email?: string;
  password?: string;
}

/**
 * 驗證 Email／密碼欄位，回傳欄位對應的錯誤訊息。
 * 若回傳空物件，代表驗證通過。
 */
export function validateAuthForm({ email, password }: AuthFormValues): AuthFormErrors {
  const errors: AuthFormErrors = {};

  if (!email.trim()) {
    errors.email = "請輸入 Email";
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = "Email 格式不正確";
  }

  if (!password) {
    errors.password = "請輸入密碼";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `密碼至少需要 ${MIN_PASSWORD_LENGTH} 個字元`;
  }

  return errors;
}
