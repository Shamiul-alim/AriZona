# "Continue with Google" — setup guide

This is the only step that cannot be completed without you: Google will not
issue OAuth credentials to anyone but the account owner. Everything else (the
backend strategy, the account-linking rules, the buttons on both auth pages) is
already implemented and waiting for these two values.

Until they are set, `GOOGLE_OAUTH_ENABLED` stays `false`, the API reports
`{"google": false}` on `GET /api/auth/providers`, the Google buttons stay
hidden, and `/api/auth/google` returns 404. Nothing is broken — the feature is
simply switched off.

---

## 1. Create the OAuth client in Google Cloud Console

1. Sign in at <https://console.cloud.google.com/> with **your own** Google
   account (the one that should own the site's login integration).
2. Create a project — top-left project picker → **New project**. Name it
   something like `AniZora`. Select it once created.
3. Go to **APIs & Services → OAuth consent screen**.
   - User type: **External**, then **Create**.
   - App name: `AniZora` (this is what users see on the Google consent screen).
   - User support email: your email.
   - Developer contact email: your email.
   - **Scopes**: you do not need to add any manually. The site requests only
     `openid`, `email` and `profile`, which are non-sensitive.
   - **Test users**: while the app is in *Testing* status, only accounts listed
     here can sign in. Add any Google address you want to test with.
   - Save and continue to the end.
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - Name: `AniZora web`
   - **Authorized JavaScript origins** — add exactly:
     ```
     http://localhost:3000
     ```
   - **Authorized redirect URIs** — add exactly:
     ```
     http://localhost:4000/api/auth/google/callback
     ```
   - Click **Create**.
5. Google shows a **Client ID** and a **Client secret**. Copy both.

> The redirect URI points at port **4000** (the API), not 3000. The browser is
> sent to Google by the API, Google returns to the API, the API sets the session
> cookie and only then redirects to the site on port 3000. A redirect URI on
> port 3000 will fail with `redirect_uri_mismatch`.

---

## 2. Put the values in your local `.env`

Edit `E:\tofayel_project\.env` (never `.env.example`, and never commit `.env`):

```dotenv
GOOGLE_OAUTH_ENABLED=true
GOOGLE_OAUTH_CLIENT_ID=<the Client ID from step 5>
GOOGLE_OAUTH_CLIENT_SECRET=<the Client secret from step 5>
GOOGLE_OAUTH_CALLBACK_URL=http://localhost:4000/api/auth/google/callback
```

Then restart the API so it picks them up:

```bash
docker compose up -d backend
```

Verify it is live:

```bash
curl http://localhost:4000/api/auth/providers
# expected: {"google":true}
```

The **Continue with Google** button now appears on `/auth/login` and
`/auth/register`.

---

## 3. Going live on a real domain

When the site moves to a domain, add the production URLs **alongside** the
local ones in the same OAuth client (both can coexist):

- Authorized JavaScript origin: `https://your-domain.com`
- Authorized redirect URI: `https://api.your-domain.com/api/auth/google/callback`

and update `.env` accordingly (`GOOGLE_OAUTH_CALLBACK_URL`, plus `SITE_URL`,
`CORS_ORIGINS` and `BACKEND_PUBLIC_URL`). Over HTTPS the session cookie is
automatically issued with `Secure` and `SameSite=None`.

Before the public launch, submit the consent screen for verification
(**OAuth consent screen → Publish app**), otherwise only your listed test users
can sign in.

---

## 4. How accounts are handled (already implemented)

| Situation | What happens |
|---|---|
| New Google user | A `USER` account is created with the Google email, a derived unique username, and the Google display name/avatar if provided. The email is marked verified. |
| Returning Google user | Matched by the stored `googleId` and signed straight in. |
| Existing password account, **same verified email** | The Google identity is **linked** to that existing account. No duplicate is created, and the existing role is preserved. |
| Existing account whose email Google has **not** verified | Refused, with a message telling the person to sign in with their password. The link is not made — an unverified email is not proof of ownership. |
| Email already linked to a **different** Google account | Refused. |
| Suspended or banned account | Refused, exactly as with password login. |

**Roles:** a Google sign-in never grants or changes a role. New accounts are
always `USER`. An account that already has `ADMIN`/`SUPER_ADMIN` keeps it — the
role comes from the database, never from the email address.

**Security notes:**
- The OAuth `state` parameter is stored in a short-lived, httpOnly cookie and
  compared in constant time, which blocks login-CSRF.
- No token is ever placed in a URL. The callback sets the httpOnly refresh
  cookie and redirects to `/auth/callback`, which exchanges it for a session.
- The client secret lives only in `.env` (gitignored) and is never sent to the
  browser.

---

## 5. Testing it once configured

1. Open <http://localhost:3000/auth/register> → **Sign up with Google** →
   choose a Google account → you land back signed in as a normal user.
2. Sign out, then <http://localhost:3000/auth/login> → **Continue with Google**
   → you are signed into the *same* account (check `/profile`; no duplicate).
3. Confirm the role is `USER`:
   ```bash
   docker compose exec postgres psql -U anizora -d anizora \
     -c "select email, username, role, \"googleId\" is not null as linked from users order by \"createdAt\" desc limit 3;"
   ```

If Google returns `redirect_uri_mismatch`, the redirect URI in the console does
not match `GOOGLE_OAUTH_CALLBACK_URL` character for character — including the
scheme, the port and the `/api` prefix.
