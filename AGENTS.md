# Agent instructions

Read `GLOSSARY.md`, `docs/requirements.md`, and the relevant ADR before you change code or documents.

## Scope

Build Stage 1 before Stage 2. Stage 1 contains `create_plan`, `deposit`, and `execute_transfer`. Do not add roadmap features without an accepted ADR.

## Traceability

Map each code change and test to one or more requirement identifiers. If a requested behavior has no requirement, update the requirements in a separate change first.

## Solana rules

- Use Anchor 0.31 or later.
- Use `TokenInterface` and `transfer_checked`.
- Verify each signer, account owner, PDA seed, canonical bump, mint, and token authority.
- Use checked arithmetic.
- Use the Clock sysvar for time checks.
- Accept only known program IDs for CPI.
- Add a negative test for each rejection requirement.

## Writing

Use direct technical English. Use one name for one item. Keep descriptive sentences at 25 words or fewer when practical.

For document changes, apply:

- `https://github.com/petergyang/no-ai-slop`
- `https://github.com/0xpili/simplified-technical-english`

Preserve team quotations as quotations. Do not rewrite them as approved decisions.
