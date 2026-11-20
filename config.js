// Настройки приложения. Заполняется один раз владельцем приложения.
// googleClientId — OAuth Client ID (тип «Веб-приложение») из Google Cloud Console,
// см. файл SETUP-GOOGLE.md. Пока пусто, вход через Google можно настроить в профиле.
window.ESPANOLA_CONFIG = {
  googleClientId: "1080895113663-a2qp8aereilmlnb120ooi710ti62lspg.apps.googleusercontent.com",
  geminiModel: "gemini-flash-latest",
  // Supabase (бесплатная база для прогресса): Project URL и publishable/anon key, см. SETUP-SUPABASE.md
  supabaseUrl: "",
  supabaseKey: "",
  // Адрес Cloudflare Worker-посредника (worker/ai-proxy.js): DeepSeek для всех без ключа. См. SETUP-AI-PROXY.md
  aiProxyUrl: "https://espanola-ai.kiskissmur39.workers.dev"
};
