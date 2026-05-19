---
title: Authentication / OIDC
description: Can't sign in, sign-in loop, claims missing.
order: 2
---

# Authentication / OIDC

## "Sign in" loops back to the login page

The OIDC handshake succeeded but the Users service didn't accept the token, or the cookie/session isn't being set.

Check:

- **Browser console / network tab.** Look for the `ResolveUser` call. A 401 means the platform doesn't trust the token; a 200 followed by another login loop means the cookie isn't sticking.
- **OIDC issuer mismatch.** The IdP issues `iss=https://login.example.com/`, but your platform is configured with `iss=https://login.example.com` (no trailing slash). Slash mismatches cause the token to be rejected. Set them identically.
- **Audience.** Configure the OIDC client so its token's `aud` matches what the Users service expects (typically the client ID).
- **Clock skew.** If the platform's clock is more than a few seconds off from the IdP's, JWT validation fails. Use NTP.

## "Invalid token" errors

Means the access token failed JWT validation server-side. Common causes:

- **Wrong signing key.** The IdP rotated its JWKS but the Users service has a cached old key. Most JWKS clients refresh on `kid` miss; if not, restart the Users deployment.
- **Token expired between client and server.** ID tokens have short TTLs. Refresh the page or use refresh tokens.
- **Algorithm mismatch.** Some IdPs use `ES256`; if your Users service is configured for `RS256` only, validation fails.

## User created but `username` is wrong

The username is derived from the OIDC user info — typically `preferred_username` falling back to email-local-part. If your IdP returns a non-friendly `preferred_username` (a UUID, for example), the platform uses that.

Workaround:

- Change the user's `username` directly via the Users service. The Users service exposes `UpdateMe` or via the admin endpoint.
- Change the IdP to populate `preferred_username` with what you want.

## Username collisions

The platform appends a numeric suffix on collision (`alice-2`). If you want a specific username for a new user, claim it before they sign in — provision the user manually via Gateway and set the desired username.

## Missing claims

The Users service requests `openid`, `profile`, `email` scopes during sign-in. If your IdP doesn't return these, profile fields end up empty.

- Confirm the scopes are listed in the OIDC client registration.
- Confirm the IdP's UserInfo endpoint returns the claims (sometimes you have to enable them on the client).

## Sign-in works but no organization access

The user authenticated but has no organization. By design, new users have no access until invited to (or creating) an organization.

- Tell them to use the **Create Organization** option in the Console's context switcher.
- Or invite them: [Administer → Members](../administer/members.md).

## Cluster admin role missing after first install

See [Self-host install → First admin](../self-host-install/first-admin.md). The bootstrap binds the OIDC subject set in `ADMIN_OIDC_SUBJECT` (default `admin@agyn.io`); if your real IdP issues a different `sub` for you, you won't be cluster admin until you re-apply the `apps` stack with the correct value.

## API token authentication fails

```sh
curl -H "Authorization: Bearer agyn_..." https://gateway.agyn.example.com/api/...
```

Returns 401:

- **Token revoked.** Check Use → API tokens in the Console.
- **Token expired.** Tokens can have expirations.
- **Wrong format.** Tokens must start with `agyn_`. Anything else is rejected before lookup.

## Sessions don't persist

The Console and Chat apps store sessions in browser localStorage. If sessions vanish on every reload:

- **Browser storage cleared.** Private/incognito sessions clear on close.
- **Cross-domain cookies.** If you're using subdomains (`chat.example.com`, `console.example.com`) for the Chat and Console apps but the OIDC callback is on `example.com`, cookies might not propagate. Configure the IdP and the apps to use the same domain or set CORS correctly.

## Related

- [Operate → Identity](../operate/identity.md)
- [Self-host install → First admin](../self-host-install/first-admin.md)
- [Use → API tokens](../use/api-tokens.md)
