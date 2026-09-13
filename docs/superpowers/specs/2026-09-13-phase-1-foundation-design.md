# Phase 1 Foundation Design

## Goal

Build the safe multi-user foundation for an internal Facebook One Card bulk-publishing application. The user experience should resemble the relevant FewFeed workflow: an internal website user signs in, connects one Facebook account, sees the Fanpages that account is allowed to manage, and later can select many Fanpages for bulk One Card publishing.

Phase 1 stops before bulk/public publishing. Its purpose is to establish authentication, Meta connection, asset synchronization, and the proven One Card preparation pipeline without any code path that can create or activate advertising campaigns.

## Confirmed Product Model

The terminology used operationally by the team is simplified, but the application will model Meta objects correctly internally.

- One website user is created by the administrator from the terminal.
- There is no public registration page or public registration endpoint.
- One website user connects exactly one Facebook/Meta account in Phase 1.
- That Facebook account may manage many Facebook Pages/Fanpages.
- The application presents only the Pages available to that connected account and authorized for that website user.
- Ad Accounts are technical resources used for One Card creation, not the primary object the user is managing.
- The product's main eventual function is selecting many Fanpages and publishing the same One Card post in bulk.

## Safety Boundary

The One Card backend must not contain operations for creating Campaigns, Ad Sets, or Ads, setting advertising budgets, or activating advertising delivery.

The proven One Card preparation path is strictly:

1. validate/access the target Page;
2. upload the image through the selected/assigned Ad Account `/adimages` endpoint;
3. create an Ad Creative using `object_story_spec.link_data` through `/adcreatives`;
4. poll the Creative for `effective_object_story_id` immediately and then up to 15 total attempts, waiting 4 seconds between missing results;
5. stop after obtaining the story ID during Phase 1.

This flow creates Meta image/creative assets but does not create a Campaign, Ad Set, active Ad, advertising budget, or public Page post by itself.

## Authentication

### Website authentication

Users sign in with email and password. Passwords are stored only as secure password hashes. Sessions are server-managed and protected with secure, HTTP-only cookies.

There is no self-service registration. A terminal command/script is the only Phase 1 mechanism for creating a website user. Duplicate emails must be rejected and the creation command must never log the plaintext password after creation.

### Meta authentication

The dashboard exposes a `Connect Meta` action using official Meta OAuth. The application requests only permissions required for the Pages/Marketing API workflow. OAuth state must be validated to prevent request forgery.

Raw Meta access tokens must never be rendered into the browser UI, application logs, error pages, or normal API responses. The server stores the connected account's token protected at rest using an application encryption key. Meta API calls are server-side.

Phase 1 deliberately does not reproduce FewFeed's browser-session token extraction, cookie interception, `fb_dtsg`, `jazoest`, or internal Facebook GraphQL behavior.

## Data Model

### User

Stores the internal website identity: ID, normalized unique email, password hash, active/disabled state, timestamps.

### Session

Stores a hashed opaque session token, owning user, expiry, and timestamps. A disabled user cannot use an existing session.

### MetaConnection

Exactly one per User in Phase 1. Stores Meta user ID, display name where available, encrypted access token, token metadata/expiry where available, connection status, last synchronization time, and timestamps.

### BusinessManager

Stores Business Manager/business records visible through the connected Meta account where available. These records are informational/synchronization data rather than the website user's login identity.

### FacebookPage

Stores Page ID, Page name, relationship to the owning website user/Meta connection, relevant business relationship where determinable, active/access status, and synchronization timestamps.

### AdAccount

Stores Ad Account ID/account ID, name, account status, relevant business relationship where determinable, and synchronization timestamps. Phase 1 may designate one Ad Account as the user's default One Card technical account. Only one default may exist per user.

The UI should keep Ad Account complexity secondary. It is a technical dependency for One Card creation, while Fanpages remain the main publishing targets.

### OneCardPreparation

Stores a Phase 1 preparation attempt: user, Page, Ad Account, image hash/asset identifier, Creative ID, `effective_object_story_id`, status, sanitized error information, attempt count, and timestamps. It must not contain campaign/ad-set/ad IDs because Phase 1 never creates those objects.

## Authorization and Tenant Isolation

Every server operation derives the current User from the authenticated session. Client-supplied user IDs are never trusted for authorization.

Every MetaConnection, Page, Ad Account, and OneCardPreparation lookup must be scoped to the current user. A user cannot access another user's Meta connection or Meta assets by changing an ID in a request.

A Page or Ad Account supplied to an action must be verified as belonging to the current user's synchronized data before any Meta API call occurs.

## Meta Synchronization

After OAuth succeeds, the server synchronizes the connected account's accessible Meta resources. The dashboard should show the connected Facebook identity and Fanpages, with a manual `Sync Meta` action.

Where Meta exposes Business Manager and Ad Account relationships through the granted permissions, those are synchronized as supporting data. Pages are the primary user-facing list.

Synchronization uses upsert semantics: refresh names/status/relationships without creating duplicates. Resources no longer returned by Meta are marked unavailable/stale rather than immediately deleted, preserving history.

## Phase 1 UI

### Login

A minimal email/password login form. No `Register`, `Sign up`, or account-creation link is present.

### Dashboard

Shows connection status and a `Connect Meta` button when disconnected. Once connected, it shows the connected Facebook identity, last sync time, `Sync Meta`, a searchable Page list, and a secondary Ad Account/default technical account section.

### One Card preparation screen

A development/controlled screen may use synchronized Page and default Ad Account selections to run the already-proven preparation flow. It accepts cover image, primary text, destination URL, display URL/caption, card title, and description. It reports image upload, Creative ID, polling attempts, and resulting `effective_object_story_id`.

It must be clearly labeled preparation/testing in Phase 1 and must not expose a Publish button.

## One Card Service Boundary

The Meta integration is split into explicit server-side operations rather than a generic arbitrary Graph proxy. The allowed Phase 1 operations are limited to the endpoints required for OAuth/resource synchronization plus:

- Page validation/read;
- Ad Account image upload;
- Ad Creative creation for One Card;
- Ad Creative read for `effective_object_story_id`.

There is no generic `fetch any Graph URL` API exposed to the client.

The One Card service accepts validated domain objects/IDs owned by the current user, constructs Meta endpoint paths internally, sanitizes Meta errors, and never returns access tokens.

## Error Handling

Authentication failures return the user to login without exposing internals. OAuth failures show a reconnect action. Synchronization failures preserve previously synchronized data and record a safe error/status rather than deleting assets.

One Card preparation records per-attempt status. A missing `effective_object_story_id` after 15 attempts is a timeout/failure, not a reason to automatically create another Creative. Automatic retries that could duplicate Meta assets are avoided unless explicitly designed later.

## Testing

Phase 1 requires automated tests for password hashing/verification, terminal user creation validation, session creation/expiry/disabled-user behavior, OAuth state validation, token encryption/decryption without token logging, tenant isolation, synchronization upserts/stale marking, default Ad Account uniqueness, and the One Card polling policy.

Meta HTTP calls should be mocked in automated tests. A controlled manual integration test may use the known test Page/Ad Account, but credentials are supplied only through environment variables and never committed.

## Phase 1 Success Criteria

Phase 1 is complete when an admin can create a user from the terminal; that user can log in but cannot self-register; the user can connect exactly one Meta account through official OAuth; accessible Fanpages and supporting Ad Accounts can be synchronized and viewed without cross-user leakage; a default technical Ad Account can be selected/assigned; and the controlled One Card preparation flow can reproduce image upload -> Creative creation -> polling -> `effective_object_story_id` using synchronized assets.

No Campaign, Ad Set, Ad, advertising budget, active advertising delivery, internal Facebook GraphQL publish, scheduled publish, public Page publish, or bulk publish is implemented in Phase 1.

## Later Phases

After this foundation is stable, the next phase will implement one controlled public One Card publish and verify the resulting Page behavior. Only after that publish adapter is proven will bulk selection, per-Page job/result tracking, retries, scheduling, and production bulk publishing be added.