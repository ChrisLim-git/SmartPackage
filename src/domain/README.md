# domain

Entities, value objects, policies and the ports they declare.

**Imports nothing** — no other layer, no framework, no `new Date()`, no `Math.random()`, no `crypto.randomUUID()`. Time, ids and pickup codes arrive through ports. Enforced by `boundaries/dependencies` and `boundaries/external` in `eslint.config.mjs`.
