# Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the internal multi-user foundation for Fewfeed Clone: admin-created website users, secure login/session handling, one official Meta OAuth connection per user, synchronized Fanpages and supporting Ad Accounts, a selectable default technical Ad Account, and a controlled One Card preparation flow that stops after obtaining `effective_object_story_id`.

**Architecture:** Keep all authentication, Meta credentials, synchronization, and One Card calls server-side in Next.js. Use Prisma/MySQL for tenant-scoped persistence, an opaque server session cookie for website authentication, AES-256-GCM for Meta access-token encryption, explicit allowlisted Meta service functions instead of a generic Graph proxy, and a test-only/controlled One Card preparation screen with no publish operation. The existing extension spike remains research evidence only and is not used by production Phase 1.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.2.8, TypeScript 5, Tailwind CSS 4, Prisma 7.10.0, MySQL, Node `crypto`, `bcryptjs`, `vitest`, `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-13-phase-1-foundation-design.md`

## Global Constraints

- There is no public registration page and no public registration endpoint.
- Website users are created only through an administrator terminal command.
- One website user can have exactly one `MetaConnection` in Phase 1.
- Fanpages are the primary user-facing Meta assets; Ad Accounts are supporting technical resources for One Card preparation.
- Every server-side asset lookup is scoped to the current authenticated website user.
- Raw Meta access tokens must never be returned to the browser, written to application logs, or included in normal error responses.
- Meta tokens are encrypted at rest with AES-256-GCM using a 32-byte application encryption key supplied through environment variables.
- Phase 1 must not contain any operation that creates Campaigns, Ad Sets, Ads, advertising budgets, or active advertising delivery.
- Phase 1 must not contain internal Facebook GraphQL publishing, scheduled publishing, public Page publishing, or bulk publishing.
- One Card preparation is limited to: Page validation/read -> `/adimages` -> `/adcreatives` -> poll `effective_object_story_id` immediately and up to 15 total attempts with 4-second waits -> stop.
- Missing `effective_object_story_id` after 15 attempts is a failure/timeout; do not automatically create another Creative.
- Meta HTTP calls are mocked in automated tests. Real credentials are supplied only through environment variables for controlled manual integration testing.
- Follow `AGENTS.md`: before writing Next.js code, read the relevant local Next.js 16 documentation under `node_modules/next/dist/docs/` and follow its current API conventions.

---

## File Structure

Create or modify the following focused units.

```text
prisma/schema.prisma                         Persistent Phase 1 models and indexes
lib/db.ts                                   Prisma singleton/client access
lib/auth/password.ts                        Password hash/verify
lib/auth/session.ts                         Opaque session creation/read/delete
lib/auth/require-user.ts                    Current-user/authorization helper
lib/security/secrets.ts                     AES-256-GCM encryption/decryption
lib/meta/config.ts                          Meta API version, OAuth scopes, env validation
lib/meta/client.ts                          Allowlisted server-side Meta HTTP helper
lib/meta/oauth.ts                           OAuth URL/state/code exchange
lib/meta/sync.ts                            Upsert/stale-mark Pages, businesses, Ad Accounts
lib/meta/one-card.ts                        Upload image/create creative/poll story ID
lib/meta/errors.ts                          Safe Meta error mapping
app/login/page.tsx                          Login screen
app/login/actions.ts                        Login server action
app/logout/route.ts                         Session termination
app/dashboard/page.tsx                      Authenticated dashboard
app/dashboard/actions.ts                    Sync/default-Ad-Account actions
app/api/meta/connect/route.ts               Start OAuth
app/api/meta/callback/route.ts              Validate state, exchange token, sync
app/one-card/prepare/page.tsx                Controlled preparation UI
app/api/one-card/prepare/route.ts            Tenant-scoped multipart preparation endpoint
scripts/create-user.ts                      Admin-only terminal user creation
scripts/test-one-card-polling.mjs            Keep/commit proven manual polling experiment if present locally
vitest.config.ts                            Test runner configuration
lib/**/*.test.ts                            Unit/service tests
app/**/*.test.ts                            Route/action tests where useful
.env.example                                Required non-secret environment variable names
README.md                                   Local setup and safe test instructions
package.json                                Scripts/dependencies
```

Do not place Meta access tokens in Client Components, browser storage, URL query strings, logs, or rendered HTML.

---

### Task 1: Testing, dependencies, and Prisma data model

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `prisma/schema.prisma`
- Create: `vitest.config.ts`
- Create: `lib/db.ts`
- Create: `.env.example`
- Test: `lib/db.test.ts`

**Interfaces:**
- Produces Prisma models: `User`, `Session`, `MetaConnection`, `BusinessManager`, `FacebookPage`, `AdAccount`, `OneCardPreparation`.
- Produces `db` singleton used by all later tasks.
- Adds scripts `test`, `test:watch`, `user:create`.

- [ ] **Step 1: Read the installed Next.js and Prisma guidance before changing framework/database code**

Run locally from the repo root:

```powershell
Get-Content .\AGENTS.md
Get-ChildItem .\node_modules\next\dist\docs -Recurse -File | Select-Object -First 30 FullName
npx prisma --version
```

Expected: Next.js 16.3.5 and Prisma 7.10.x are installed; implementation follows the installed documentation rather than older Next.js conventions.

- [ ] **Step 2: Install the minimal Phase 1 development/runtime dependencies**

Run:

```powershell
npm install bcryptjs
npm install -D vitest tsx @types/bcryptjs
```

Add scripts to `package.json`:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "user:create": "tsx scripts/create-user.ts"
}
```

Do not add a generic Meta SDK unless later implementation evidence proves it is required.

- [ ] **Step 3: Define the Phase 1 Prisma schema**

Use these model semantics exactly; adapt Prisma 7 syntax only where the installed Prisma documentation requires it:

```prisma
enum MetaConnectionStatus {
  CONNECTED
  REAUTH_REQUIRED
  ERROR
}

enum AssetAccessStatus {
  AVAILABLE
  STALE
}

enum OneCardPreparationStatus {
  PENDING
  UPLOADING_IMAGE
  CREATING_CREATIVE
  POLLING_STORY
  SUCCEEDED
  FAILED
}

model User {
  id                  String               @id @default(cuid())
  email               String               @unique
  passwordHash        String
  isActive            Boolean              @default(true)
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  sessions            Session[]
  metaConnection      MetaConnection?
  pages               FacebookPage[]
  adAccounts          AdAccount[]
  preparations        OneCardPreparation[]
}

model Session {
  id          String   @id @default(cuid())
  tokenHash   String   @unique
  userId      String
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  lastSeenAt  DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

model MetaConnection {
  id                    String               @id @default(cuid())
  userId                String               @unique
  metaUserId            String
  metaDisplayName       String?
  encryptedAccessToken  String               @db.Text
  tokenExpiresAt        DateTime?
  status                MetaConnectionStatus @default(CONNECTED)
  lastSyncAt            DateTime?
  lastErrorCode         String?
  createdAt             DateTime             @default(now())
  updatedAt             DateTime             @updatedAt
  user                  User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  businesses            BusinessManager[]
  pages                 FacebookPage[]
  adAccounts            AdAccount[]
}

model BusinessManager {
  id                  String            @id @default(cuid())
  userId              String
  metaConnectionId    String
  businessId          String
  name                String
  accessStatus        AssetAccessStatus @default(AVAILABLE)
  lastSeenAt          DateTime          @default(now())
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  connection          MetaConnection    @relation(fields: [metaConnectionId], references: [id], onDelete: Cascade)

  @@unique([userId, businessId])
  @@index([metaConnectionId])
}

model FacebookPage {
  id                  String            @id @default(cuid())
  userId              String
  metaConnectionId    String
  pageId              String
  name                String
  businessId          String?
  accessStatus        AssetAccessStatus @default(AVAILABLE)
  lastSeenAt          DateTime          @default(now())
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  user                User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  connection          MetaConnection    @relation(fields: [metaConnectionId], references: [id], onDelete: Cascade)
  preparations        OneCardPreparation[]

  @@unique([userId, pageId])
  @@index([metaConnectionId])
  @@index([userId, accessStatus])
}

model AdAccount {
  id                  String            @id @default(cuid())
  userId              String
  metaConnectionId    String
  accountId           String
  graphId             String
  name                String
  accountStatus       Int?
  businessId          String?
  accessStatus        AssetAccessStatus @default(AVAILABLE)
  isDefaultOneCard    Boolean           @default(false)
  lastSeenAt          DateTime          @default(now())
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  user                User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  connection          MetaConnection    @relation(fields: [metaConnectionId], references: [id], onDelete: Cascade)
  preparations        OneCardPreparation[]

  @@unique([userId, accountId])
  @@index([metaConnectionId])
  @@index([userId, accessStatus])
}

model OneCardPreparation {
  id                      String                   @id @default(cuid())
  userId                  String
  facebookPageId          String
  adAccountId             String
  imageHash               String?
  imageAssetUrl           String?                  @db.Text
  creativeId              String?
  effectiveObjectStoryId  String?
  status                  OneCardPreparationStatus @default(PENDING)
  pollAttempts            Int                      @default(0)
  safeErrorCode           String?
  safeErrorMessage        String?                  @db.Text
  createdAt               DateTime                 @default(now())
  updatedAt               DateTime                 @updatedAt
  user                    User                     @relation(fields: [userId], references: [id], onDelete: Cascade)
  page                    FacebookPage             @relation(fields: [facebookPageId], references: [id])
  adAccount               AdAccount                @relation(fields: [adAccountId], references: [id])

  @@index([userId, createdAt])
  @@index([facebookPageId])
  @@index([adAccountId])
}
```

Do not add Campaign, AdSet, Ad, budget, publish, schedule, or GraphQL models.

- [ ] **Step 4: Add a Prisma singleton**

`lib/db.ts` should expose exactly:

```ts
export const db: PrismaClient;
```

Use the Prisma 7 client import style generated by this repository. Cache the client on `globalThis` in development so hot reload does not create excess connections.

- [ ] **Step 5: Add test configuration and a smoke test**

`vitest.config.ts` must run Node-environment tests and resolve the repo `@/` alias if the TypeScript config uses it.

Write `lib/db.test.ts` as a no-network smoke test that imports `db` and verifies the module exports a client object without connecting to Meta.

- [ ] **Step 6: Generate Prisma client and validate schema**

Run:

```powershell
npx prisma format
npx prisma validate
npx prisma generate
npm test
```

Expected: schema validation passes and tests pass.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json prisma/schema.prisma vitest.config.ts lib/db.ts lib/db.test.ts .env.example
git commit -m "feat: add phase 1 data foundation"
```

---

### Task 2: Password hashing, sessions, and terminal-only user creation

**Files:**
- Create: `lib/auth/password.ts`
- Create: `lib/auth/session.ts`
- Create: `lib/auth/require-user.ts`
- Create: `lib/auth/password.test.ts`
- Create: `lib/auth/session.test.ts`
- Create: `scripts/create-user.ts`
- Modify: `README.md`

**Interfaces:**
- Produces `hashPassword(password: string): Promise<string>`.
- Produces `verifyPassword(password: string, hash: string): Promise<boolean>`.
- Produces `createSession(userId: string): Promise<void>` which sets an HTTP-only cookie.
- Produces `getCurrentUser(): Promise<User | null>`.
- Produces `requireUser(): Promise<User>`.
- Produces `destroySession(): Promise<void>`.

- [ ] **Step 1: Write failing password tests**

Cover:

```ts
it('hashes without preserving plaintext')
it('verifies the correct password')
it('rejects the wrong password')
it('rejects passwords shorter than 12 characters for admin-created users')
```

Use bcrypt cost 12.

- [ ] **Step 2: Implement password helpers and run tests**

Core implementation contract:

```ts
export async function hashPassword(password: string) {
  if (password.length < 12) throw new Error('PASSWORD_TOO_SHORT');
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
```

Run:

```powershell
npx vitest run lib/auth/password.test.ts
```

- [ ] **Step 3: Write failing session tests**

Test token generation/storage semantics without exposing raw session values:

```ts
it('stores only sha256(sessionToken) in the database')
it('rejects an expired session')
it('rejects a session for a disabled user')
it('returns the owning user for a valid session')
```

Session duration: 7 days. Cookie name: `ff_session`. Cookie flags: `httpOnly: true`, `sameSite: 'lax'`, `secure: process.env.NODE_ENV === 'production'`, `path: '/'`.

- [ ] **Step 4: Implement session helpers**

Generate 32 random bytes, encode as base64url, store only SHA-256 in `Session.tokenHash`, and put the raw opaque token only in the HTTP-only cookie.

`getCurrentUser()` must query Session plus User and return `null` if expired or `user.isActive === false`.

- [ ] **Step 5: Implement terminal-only user creation**

`scripts/create-user.ts` accepts:

```text
npm run user:create -- --email user@example.com
```

Behavior:

```text
- normalize email with trim().toLowerCase()
- reject missing/invalid email
- read password from NEW_USER_PASSWORD environment variable
- require at least 12 characters
- reject duplicate email
- hash password
- create active User
- print only: Created user: user@example.com
- never print the plaintext password or password hash
```

If `NEW_USER_PASSWORD` is missing, exit non-zero with:

```text
Set NEW_USER_PASSWORD before running this command.
```

Document a PowerShell-safe example in `README.md` using a temporary environment variable and removal afterward.

- [ ] **Step 6: Run tests and a local create-user smoke test against the developer database**

```powershell
npm test
npm run user:create -- --email test-internal@example.com
```

Expected: user created once; second invocation fails cleanly as duplicate.

- [ ] **Step 7: Commit**

```powershell
git add lib/auth scripts/create-user.ts README.md
git commit -m "feat: add internal user authentication core"
```

---

### Task 3: Login/logout UI with no registration path

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/login/actions.ts`
- Create: `app/logout/route.ts`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Test: `app/login/actions.test.ts`

**Interfaces:**
- Login action accepts only `email` and `password`.
- Successful login calls `createSession(user.id)` and redirects to `/dashboard`.
- `/` redirects authenticated users to `/dashboard` and unauthenticated users to `/login`.

- [ ] **Step 1: Read Next.js 16 docs for Server Actions, cookies, redirects, and Route Handlers**

Use the local docs under `node_modules/next/dist/docs/` and record no external dependency on deprecated APIs.

- [ ] **Step 2: Write failing login-action tests**

Cover:

```ts
it('normalizes email before lookup')
it('rejects unknown email with a generic invalid-credentials message')
it('rejects wrong password with the same generic message')
it('rejects disabled users')
it('creates a session for valid credentials')
```

Do not reveal whether an email exists.

- [ ] **Step 3: Implement login action**

Action result type:

```ts
type LoginState = { error?: 'INVALID_CREDENTIALS' | 'ACCOUNT_DISABLED' };
```

No registration action, route, page, link, or API may be added.

- [ ] **Step 4: Build minimal internal login UI**

Required copy:

```text
Fewfeed Clone
Internal Access
Email
Password
Login
```

Do not render `Register`, `Sign up`, or `Create account` anywhere.

- [ ] **Step 5: Implement logout and root redirect**

`POST /logout` destroys the session and redirects to `/login`. Root `/` performs authentication-aware redirect only.

- [ ] **Step 6: Update metadata**

Set application metadata to:

```ts
{
  title: 'Fewfeed Clone',
  description: 'Internal Facebook One Card operations'
}
```

- [ ] **Step 7: Verify**

```powershell
npm test
npm run lint
npm run build
```

Expected: build succeeds; there is no registration path.

- [ ] **Step 8: Commit**

```powershell
git add app lib/auth
 git commit -m "feat: add internal login flow"
```

---

### Task 4: Secret encryption and Meta OAuth connection

**Files:**
- Create: `lib/security/secrets.ts`
- Create: `lib/security/secrets.test.ts`
- Create: `lib/meta/config.ts`
- Create: `lib/meta/errors.ts`
- Create: `lib/meta/client.ts`
- Create: `lib/meta/oauth.ts`
- Create: `lib/meta/oauth.test.ts`
- Create: `app/api/meta/connect/route.ts`
- Create: `app/api/meta/callback/route.ts`
- Modify: `.env.example`

**Interfaces:**
- `encryptSecret(plaintext: string): string`
- `decryptSecret(envelope: string): string`
- `metaFetch<T>(path: string, init: MetaRequestInit): Promise<T>` where callers supply an allowlisted path built by server code, never browser input.
- `createOAuthState(userId: string): Promise<string>` / `consumeOAuthState(state: string, expectedUserId: string): Promise<boolean>`.
- `buildMetaOAuthUrl(state: string): URL`.
- `exchangeCodeForAccessToken(code: string): Promise<{ accessToken: string; expiresAt: Date | null }>`.

- [ ] **Step 1: Write failing AES-GCM tests**

Test:

```ts
it('round-trips a secret')
it('uses randomized IVs so identical plaintext encrypts differently')
it('fails closed on a modified ciphertext')
it('rejects an encryption key that is not exactly 32 bytes after base64 decoding')
```

Envelope format:

```text
v1.<base64url(iv)>.<base64url(ciphertext)>.<base64url(authTag)>
```

Environment variable: `META_TOKEN_ENCRYPTION_KEY` containing base64 for exactly 32 random bytes.

- [ ] **Step 2: Implement secret encryption and run tests**

Use Node `createCipheriv('aes-256-gcm', ...)` and `createDecipheriv` only. Never log plaintext or envelopes.

- [ ] **Step 3: Define Meta configuration**

Use environment variables:

```text
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=http://localhost:3000/api/meta/callback
META_GRAPH_VERSION=v25.0
META_TOKEN_ENCRYPTION_KEY=
```

Phase 1 OAuth scopes:

```ts
[
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'ads_management',
  'ads_read',
  'business_management',
]
```

Keep `META_GRAPH_VERSION` configurable, defaulting to `v25.0` only when environment configuration is omitted in development.

- [ ] **Step 4: Write failing OAuth-state tests**

Use a short-lived signed/encrypted state value bound to the current website user. Test:

```ts
it('accepts a fresh state for the same website user')
it('rejects a state bound to another user')
it('rejects a modified state')
it('rejects an expired state')
```

Maximum OAuth state age: 10 minutes.

- [ ] **Step 5: Implement OAuth start route**

`GET /api/meta/connect` must:

```text
1. require authenticated website user
2. refuse if user already has a connected MetaConnection unless reconnect mode is explicit
3. generate state bound to website user
4. redirect to official Meta OAuth dialog
```

- [ ] **Step 6: Implement OAuth callback**

`GET /api/meta/callback` must:

```text
1. require current website session
2. validate state before exchanging code
3. exchange code server-side
4. call /me?fields=id,name
5. encrypt access token before database storage
6. upsert the one MetaConnection for the current website user
7. never render token/code/app secret
8. redirect to /dashboard?meta=connected on success
9. redirect to /dashboard?meta=error on safe failure
```

No browser-session scraping, `fb_dtsg`, `jazoest`, cookies from facebook.com, or internal GraphQL.

- [ ] **Step 7: Verify and commit**

```powershell
npm test
npm run lint
npm run build
git add lib/security lib/meta app/api/meta .env.example
git commit -m "feat: add secure Meta OAuth connection"
```

---

### Task 5: Tenant-scoped Meta asset synchronization

**Files:**
- Create: `lib/meta/sync.ts`
- Create: `lib/meta/sync.test.ts`
- Create: `app/api/meta/sync/route.ts`

**Interfaces:**
- `syncMetaAssets(userId: string): Promise<SyncSummary>`.
- `SyncSummary = { pages: number; adAccounts: number; businesses: number; syncedAt: Date }`.

- [ ] **Step 1: Write failing synchronization tests**

Mock Meta HTTP responses and Prisma repository calls. Cover:

```ts
it('decrypts only the current user MetaConnection token')
it('upserts /me/accounts pages by [userId,pageId]')
it('upserts /me/adaccounts by [userId,accountId]')
it('upserts /me/businesses when returned')
it('updates names and statuses on repeated sync')
it('marks previously known missing assets STALE instead of deleting them')
it('does not alter another user assets')
it('preserves old data when Meta sync fails')
```

- [ ] **Step 2: Implement page synchronization**

Fetch all pages with pagination from:

```text
/me/accounts?fields=id,name,tasks
```

Pages returned this run become `AVAILABLE` with refreshed `lastSeenAt`; previously known pages not returned become `STALE` only after the complete page fetch succeeds.

- [ ] **Step 3: Implement Ad Account synchronization**

Fetch with pagination from:

```text
/me/adaccounts?fields=id,account_id,name,account_status,business{id,name}
```

Normalize:

```text
id         -> graphId (usually act_<accountId>)
account_id -> accountId
name       -> name
account_status -> accountStatus
business.id -> businessId when present
```

Do not create or update Campaigns, Ad Sets, or Ads.

- [ ] **Step 4: Implement Business Manager informational synchronization**

Fetch:

```text
/me/businesses?fields=id,name
```

Failure of this supporting endpoint must not erase successfully synchronized Pages/Ad Accounts. Record a safe connection error only when the overall required sync cannot complete.

- [ ] **Step 5: Add manual sync route**

`POST /api/meta/sync` requires an authenticated user, ignores any client-supplied user ID, calls `syncMetaAssets(currentUser.id)`, and redirects back to `/dashboard` or returns a safe JSON result when invoked by fetch.

- [ ] **Step 6: Verify and commit**

```powershell
npx vitest run lib/meta/sync.test.ts
npm test
npm run lint
npm run build
git add lib/meta/sync.ts lib/meta/sync.test.ts app/api/meta/sync/route.ts
git commit -m "feat: synchronize tenant Meta assets"
```

---

### Task 6: Dashboard, Fanpage list, and default technical Ad Account

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `app/dashboard/actions.ts`
- Create: `app/dashboard/default-ad-account-form.tsx`
- Create: `app/dashboard/page-list.tsx`
- Test: `app/dashboard/actions.test.ts`

**Interfaces:**
- `setDefaultAdAccount(adAccountDbId: string)` scopes lookup to current user.
- Exactly one available Ad Account per user can be `isDefaultOneCard=true`; setting a new default clears the old one inside one DB transaction.

- [ ] **Step 1: Write failing tenant-isolation/default-account tests**

Cover:

```ts
it('cannot select another user ad account as default')
it('clears the previous default in the same user tenant')
it('does not change another user default')
it('rejects stale ad accounts as new defaults')
```

- [ ] **Step 2: Implement authenticated dashboard data loading**

Dashboard displays:

```text
Connected Facebook identity
Connection status
Last sync time
Connect Meta / Reconnect Meta
Sync Meta
Searchable Fanpage list
Fanpage count
Ad Account technical section
Current default One Card Ad Account
Link to One Card Preparation
Logout
```

Pages are the dominant UI section. Ad Account details remain secondary.

- [ ] **Step 3: Implement default-account action transaction**

Transaction semantics:

```ts
await db.$transaction([
  db.adAccount.updateMany({ where: { userId }, data: { isDefaultOneCard: false } }),
  db.adAccount.update({ where: { id: ownedAvailableId }, data: { isDefaultOneCard: true } }),
]);
```

Do the ownership/status lookup before the transaction; never trust a raw account ID from the browser without tenant verification.

- [ ] **Step 4: Add client-side Page search only for already-authorized server-loaded rows**

Search Page name/Page ID locally in a small Client Component. Do not send Meta tokens to the component.

- [ ] **Step 5: Verify and commit**

```powershell
npm test
npm run lint
npm run build
git add app/dashboard
git commit -m "feat: add Meta asset dashboard"
```

---

### Task 7: Server-side One Card preparation service

**Files:**
- Create: `lib/meta/one-card.ts`
- Create: `lib/meta/one-card.test.ts`
- Modify: `lib/meta/client.ts`

**Interfaces:**

```ts
export type PrepareOneCardInput = {
  userId: string;
  facebookPageDbId: string;
  adAccountDbId: string;
  image: { bytes: Uint8Array; mimeType: 'image/png' | 'image/jpeg' };
  message: string;
  destinationUrl: string;
  caption: string;
  title: string;
  description: string;
};

export type PrepareOneCardResult = {
  preparationId: string;
  creativeId: string;
  effectiveObjectStoryId: string;
  attempts: number;
};

export async function prepareOneCard(input: PrepareOneCardInput): Promise<PrepareOneCardResult>;
```

- [ ] **Step 1: Port the proven polling policy into tests first**

Mock `fetch` and fake sleep. Test exact behavior:

```ts
it('validates Page ownership before any Meta write')
it('validates Ad Account ownership before any Meta write')
it('rejects stale Page/Ad Account')
it('rejects image types other than PNG/JPEG')
it('rejects images larger than 5 MiB')
it('uploads image to /act_<accountId>/adimages')
it('creates one creative through /act_<accountId>/adcreatives')
it('uses object_story_spec.link_data with the selected Page')
it('polls immediately before the first 4-second wait')
it('returns on attempt 6 when story ID appears on attempt 6')
it('performs at most 15 reads')
it('waits exactly 4 seconds only between missing attempts')
it('does not create a second creative after timeout')
it('never calls campaign, adset, ad, budget, publish, scheduled-post, or GraphQL endpoints')
```

- [ ] **Step 2: Implement strict input validation**

Requirements:

```text
Page and AdAccount DB IDs must belong to input.userId
Page/AdAccount accessStatus must be AVAILABLE
Destination URL must be HTTPS
Image max 5 MiB, MIME image/png or image/jpeg
message max 5000 chars
title/caption/description max 500 chars each
```

Use the current user's encrypted Meta token; decrypt only immediately before server-side Meta requests.

- [ ] **Step 3: Implement image upload**

Allowed endpoint only:

```text
POST /act_<accountId>/adimages
```

Capture returned image hash and image URL when available. Persist status `UPLOADING_IMAGE` and then advance safely.

- [ ] **Step 4: Implement creative creation**

Allowed endpoint only:

```text
POST /act_<accountId>/adcreatives
```

Construct `object_story_spec.link_data` server-side:

```json
{
  "object_story_spec": {
    "page_id": "<pageId>",
    "link_data": {
      "message": "<primary text>",
      "link": "<destination URL>",
      "caption": "<display URL>",
      "name": "<title>",
      "description": "<description>",
      "image_hash": "<uploaded image hash>",
      "multi_share_optimized": true,
      "multi_share_end_card": true
    }
  }
}
```

Do not add Campaign, Ad Set, Ad, budget, or delivery fields.

- [ ] **Step 5: Implement exact polling behavior**

Allowed read endpoint only:

```text
GET /<creativeId>?fields=id,effective_object_story_id
```

Algorithm:

```ts
for (let attempt = 1; attempt <= 15; attempt += 1) {
  const creative = await readCreative(creativeId);
  if (isValidStoryId(creative.effective_object_story_id)) {
    return success(attempt);
  }
  if (attempt < 15) await sleep(4000);
}
throw new SafeMetaError('POLL_TIMEOUT');
```

Valid story format for Phase 1:

```regex
/^\d{1,30}_\d{1,30}$/
```

- [ ] **Step 6: Persist audit-safe preparation state**

Persist Creative ID, image hash/URL, attempts, story ID, and safe error code/message. Never persist the raw access token inside `OneCardPreparation`.

If network completion is uncertain after a write, fail closed and do not automatically retry the write.

- [ ] **Step 7: Verify the service security boundary**

Search the implementation before commit:

```powershell
Select-String -Path .\lib\meta\*.ts -Pattern 'campaigns|adsets|/ads\b|budget|scheduled_publish|graphql' -CaseSensitive:$false
```

Expected: no executable Meta write path for those operations. Comments/tests mentioning forbidden terms are acceptable only when asserting absence.

- [ ] **Step 8: Run tests and commit**

```powershell
npx vitest run lib/meta/one-card.test.ts
npm test
npm run lint
npm run build
git add lib/meta
git commit -m "feat: add safe One Card preparation service"
```

---

### Task 8: Controlled One Card preparation screen and endpoint

**Files:**
- Create: `app/one-card/prepare/page.tsx`
- Create: `app/one-card/prepare/prepare-form.tsx`
- Create: `app/api/one-card/prepare/route.ts`
- Test: `app/api/one-card/prepare/route.test.ts`

**Interfaces:**
- Route accepts multipart form data but derives `userId` from authenticated session.
- Browser submits DB IDs for Page and Ad Account; server re-verifies tenant ownership.
- Response contains only safe status/result fields, never credentials.

- [ ] **Step 1: Write failing endpoint authorization tests**

Cover:

```ts
it('returns 401 without website session')
it('returns 403 for another user Page')
it('returns 403 for another user Ad Account')
it('does not accept a client supplied userId')
it('returns creativeId/storyId/attempts on success')
it('returns safe error codes without raw Meta response/token')
```

- [ ] **Step 2: Build controlled preparation page**

Required visible label:

```text
One Card Preparation — Phase 1 Test
This creates Meta image/creative assets and stops after story ID. It does not publish a Page post or run an ad.
```

Fields:

```text
Fanpage
Technical Ad Account (default preselected)
Cover Image
Primary Text
Destination URL
Display URL
Card Title
Description
PREPARE ONE CARD
```

Do not render `Publish`, `Schedule`, `Bulk Publish`, campaign controls, budget controls, or ad status controls.

- [ ] **Step 3: Implement multipart route**

On success return:

```json
{
  "ok": true,
  "creativeId": "...",
  "effectiveObjectStoryId": "...",
  "attempts": 6
}
```

On safe failure return only an allowlisted code such as:

```text
INVALID_INPUT
ACCESS_DENIED
UPLOAD_FAILED
CREATIVE_FAILED
READ_FAILED
POLL_TIMEOUT
NETWORK_ERROR
```

Do not echo raw Meta response bodies to the browser.

- [ ] **Step 4: Verify UI and build**

```powershell
npm test
npm run lint
npm run build
```

Manually verify while logged in that no Register or Publish control appears.

- [ ] **Step 5: Commit**

```powershell
git add app/one-card app/api/one-card
git commit -m "feat: add controlled One Card preparation UI"
```

---

### Task 9: Commit the proven standalone polling experiment and remove Phase 1 dependence on the extension spike

**Files:**
- Create if still only local: `scripts/test-one-card-polling.mjs`
- Modify: `docs/one-card-spike-1.md`
- Modify: `README.md`
- Do not delete research files unless explicitly requested.

**Interfaces:**
- Standalone script remains a manual diagnostic only.
- Production Phase 1 does not import from `extension/` and does not require the browser extension.

- [ ] **Step 1: Verify the local proven polling script before adding it**

The script must use only:

```text
GET /<PAGE_ID>?fields=id,name
POST /act_<AD_ACCOUNT_ID>/adimages
POST /act_<AD_ACCOUNT_ID>/adcreatives
GET /<CREATIVE_ID>?fields=id,effective_object_story_id
```

It must obtain credentials only from environment variables, sanitize errors, poll max 15 times with 4-second waits, and contain no publishing/campaign/ad creation.

- [ ] **Step 2: Add documentation of the proven result without credentials**

Record that the controlled test succeeded with the sequence:

```text
Page validated
Image uploaded
Creative created
Story ID appeared after polling
```

Do not commit test tokens, cookies, app secrets, `fb_dtsg`, `jazoest`, or other session secrets.

- [ ] **Step 3: Mark extension spike as research-only**

Document that `extension/` and `app/dev/one-card-spike/` are not part of the Phase 1 production path. Do not remove them yet because they are useful research evidence.

- [ ] **Step 4: Commit**

```powershell
git add scripts/test-one-card-polling.mjs docs/one-card-spike-1.md README.md
git commit -m "docs: preserve proven One Card polling test"
```

If `scripts/test-one-card-polling.mjs` is not present locally, do not invent a replacement from memory during this task; preserve the already-tested file when available.

---

### Task 10: Phase 1 end-to-end verification and security review

**Files:**
- Modify only files required by failures found during verification.
- Update: `README.md`

**Interfaces:**
- Produces a Phase 1 build ready for one controlled internal user and one controlled Meta connection.

- [ ] **Step 1: Run complete automated verification**

```powershell
npm test
npm run lint
npm run build
npx prisma validate
```

All commands must pass before claiming Phase 1 complete.

- [ ] **Step 2: Run static secret/safety checks**

```powershell
Select-String -Path .\app\**\*.ts,.\app\**\*.tsx,.\lib\**\*.ts -Pattern 'access_token|META_APP_SECRET|fb_dtsg|jazoest|graphql' -CaseSensitive:$false
Select-String -Path .\app\**\*.ts,.\lib\**\*.ts -Pattern 'campaigns|adsets|scheduled_publish_time|daily_budget|lifetime_budget' -CaseSensitive:$false
```

Review every match. Accept only legitimate server-side OAuth/token handling and negative tests/docs; reject any browser token rendering, internal GraphQL, campaign/adset/budget write path, or public publish path.

- [ ] **Step 3: Controlled local user flow**

Using a non-production internal account and test Meta credentials:

```text
1. Admin creates website user from terminal.
2. User opens /login and signs in.
3. No registration UI exists.
4. User clicks Connect Meta and completes official OAuth.
5. Dashboard shows connected Meta identity.
6. Sync Meta loads accessible Fanpages and Ad Accounts.
7. User selects a default technical Ad Account.
8. User opens One Card Preparation.
9. User selects one test Fanpage and uploads one test image.
10. Preparation reaches effective_object_story_id.
11. No Page Publish button exists and no public post is intentionally triggered.
12. No Campaign, Ad Set, or Ad is created by this application flow.
```

- [ ] **Step 4: Tenant-isolation smoke test**

Create a second internal website user. Confirm user B cannot access user A Page/AdAccount/MetaConnection by editing form IDs or request payloads.

- [ ] **Step 5: Final README operational instructions**

Document:

```text
Environment setup
Database migration/generate commands
Admin user creation
Login
Meta OAuth configuration and callback URL
Sync Meta
Set default technical Ad Account
Run One Card Preparation
What Phase 1 explicitly does NOT do
How to rotate Meta credentials without committing them
```

- [ ] **Step 6: Final commit**

```powershell
git add .
git commit -m "feat: complete phase 1 foundation"
```

Do not make this final commit if tests/build fail or if verification finds a Campaign/Ad Set/Ad/budget/publish code path.

---

## Plan Self-Review

### Spec coverage

This plan covers every Phase 1 success criterion: terminal-only user creation, login without registration, one official Meta OAuth connection per user, encrypted tokens, synchronized Pages/Ad Accounts/businesses, tenant isolation, default technical Ad Account, and the proven image-upload -> creative-create -> polling -> story-ID flow. Public publishing and bulk publishing are deliberately excluded.

### Placeholder scan

There are no `TBD`, `TODO`, generic “add tests”, or unspecified implementation placeholders. Where framework syntax may differ because this repo uses Next.js 16/Prisma 7, the plan explicitly requires using the locally installed docs before implementation rather than guessing older APIs.

### Type consistency

The plan uses one website `User`, one optional `MetaConnection`, tenant-keyed `FacebookPage`/`AdAccount`, and `OneCardPreparation` throughout. The One Card service receives database IDs plus the authenticated `userId`, performs ownership verification before Meta writes, and returns only `preparationId`, `creativeId`, `effectiveObjectStoryId`, and `attempts`.