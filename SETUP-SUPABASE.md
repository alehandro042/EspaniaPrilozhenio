# Сохранение прогресса в Supabase (бесплатно)

Делается один раз владельцем приложения, примерно 10 минут. Одногруппники просто входят через Google или по почте.

1. Откройте https://supabase.com → **Start your project** → **Continue with GitHub**.
2. **New project**: Name `espanola`, Database Password → **Generate a password** (сохраните), Region → **Central EU (Frankfurt)** → **Create new project**. Подождите 1–2 минуты.
3. Слева **SQL Editor** → **New query** → вставьте код ниже → **Run**.

```sql
create table if not exists public.progress (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.progress enable row level security;
create policy "own progress read" on public.progress for select using (auth.uid() = user_id);
create policy "own progress insert" on public.progress for insert with check (auth.uid() = user_id);
create policy "own progress update" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.progress to authenticated;
```

4. **Authentication → URL Configuration**: Site URL = `https://alehandro042.github.io/EspaniaPrilozhenio/`, в **Redirect URLs** добавьте тот же адрес.
5. Вход по почте кодом: **Authentication → Emails** → шаблоны **Magic Link** и **Confirm signup** → добавьте строку `Код для входа: {{ .Token }}` → Save.
   Бесплатная почта Supabase отправляет всего несколько писем в час, поэтому одногруппникам удобнее входить через Google.
6. Вход через Google: **Authentication → Sign In / Providers → Google** → включить. Вставьте Client ID и Client Secret
   (Google Cloud → Google Auth Platform → Clients → ваш клиент → Client secret). Скопируйте **Callback URL** со страницы Supabase и добавьте его
   в Google Cloud → Clients → ваш клиент → **Authorized redirect URIs** → Save. В Google Auth Platform → Branding → Authorized domains добавьте `ВАШПРОЕКТ.supabase.co`.
7. **Project Settings → API Keys** (или кнопка **Connect** вверху): скопируйте **Project URL** и **Publishable key** (`sb_publishable_…`, или старый `anon` key)
   и впишите их в `config.js` (`supabaseUrl`, `supabaseKey`) — или пришлите Claude. Эти два значения не секретные: доступ к данным закрыт правилами из шага 3.

Секретный ключ (`service_role` / `sb_secret_…`) и пароль базы никуда не вставляйте и никому не присылайте.
