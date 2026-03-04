const authErrorMap: Record<string, string> = {
  "Invalid login credentials": "Неверная почта или пароль.",
  "Email not confirmed": "Подтвердите почту, затем повторите вход.",
  "User already registered": "Пользователь с такой почтой уже зарегистрирован.",
  "email rate limit exceeded": "Слишком много попыток регистрации подряд. Подождите немного и повторите снова.",
  "Password should be at least 6 characters": "Пароль должен содержать не менее 6 символов.",
  "Signup requires a valid password": "Укажите корректный пароль для регистрации.",
  "fetch failed": "Не удается связаться с Supabase. Проверьте интернет или доступность проекта и повторите попытку.",
  SUPABASE_UNAVAILABLE: "Не удается связаться с Supabase. Проверьте интернет или доступность проекта и повторите попытку."
};

export function translateAuthError(message: string) {
  return authErrorMap[message] || message;
}
