# Security Policy

Security is a first-class goal of **bool**: it is designed to be an
internet-facing, multi-user, self-hosted service, so the threat model is taken
seriously from day one.

> **Status:** pre-alpha. bool is **not yet ready to host in production.** Do not
> expose an instance to untrusted users until a tagged stable release exists.

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

Instead, report privately via GitHub's
[**Report a vulnerability**](https://github.com/dmfarcas/bool/security/advisories/new)
(Security → Advisories) so it can be triaged and fixed before disclosure. We aim
to acknowledge reports within a few days.

When reporting, please include:

- A description of the issue and its impact.
- Steps to reproduce (proof-of-concept if possible).
- Affected version / commit.

## Security posture

bool's design commits to, among other things:

- **Password hashing** with scrypt (argon2id pluggable) via Better Auth.
- **Secrets encrypted at rest** — IRC/SASL credentials sealed with AES-256-GCM.
- **Transport security** — TLS / `wss` for all client traffic.
- **Session-gated WebSocket** — no IRC traffic without an authenticated session.
- **Per-user isolation** — one user cannot see another's networks or history.
- **SSRF guard** on link-preview fetching.
- **No default credentials** — the first admin is bootstrapped explicitly.

Responsible disclosure is appreciated and contributors will be credited (with
their consent).
