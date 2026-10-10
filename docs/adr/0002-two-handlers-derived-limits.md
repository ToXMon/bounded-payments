# ADR 0002: Two handlers, derived limits, and `TokenInterface`

- Status: Accepted
- Date: 2026-10-09
- Supersedes: ADR 0001, Consequences, first bullet

## Context

ADR 0001 fixed Stage 1 at three handlers: `create_plan`, `deposit`, and `execute_transfer`.
The Deliverable 2 design pass then found three problems with that scope.

1. `deposit` changes no program state. A plain SPL Token transfer to the vault does the same job, and an
   exchange withdrawal to the vault address already uses that path. The AI red-team recorded this as
   finding F5 and the team accepted it.
2. The owner no longer supplies `total_limit` and `expiry` directly. The owner supplies `amount`,
   `interval`, and `payment_count`. The program derives the other two, so a plan cannot carry a limit and
   an expiry that disagree with the payment schedule. The old fit check would have rejected combinations
   the derived fields simply cannot produce.
3. `AGENTS.md` requires `TokenInterface`. The first draft of the architecture document named the classic
   SPL Token Program only.

## Decision

Stage 1 has two instruction handlers: `create_plan` and `execute_transfer`.

Funding the vault is not a program use case. Any wallet or exchange sends devnet USDC to the vault token
account with a plain SPL Token transfer. The Token Program enforces the mint. The program keeps no
requirement, handler, or state for funding.

The owner supplies `plan_id`, `amount`, `interval`, `payment_count`, an optional `first_due_at`, the
recipient token account, and the authorized caller key. The program computes `total_limit` and `expiry`.

Both handlers use Anchor's `TokenInterface` for the mint and every token account, and
`transfer_checked` for every transfer. The pinned mint stays the classic devnet USDC mint.
`TokenInterface` accepts that mint today and accepts a Token-2022 mint later, so the Token-2022 move
stays a roadmap item with no handler change.

## Consequences

- `AGENTS.md` and the Stage 1 scope sentence change to two handlers. See `AGENTS.md` section "Scope".
- `docs/requirements.md` is numbered REQ-01 to REQ-30 and drops the funding requirement.
- `docs/product-direction.md` states that the program derives `total_limit` and `expiry`.
- Tokens left in the vault after `expiry` stay locked. `close_plan` on the roadmap is the recovery path.
  ADR 0001 did not name one.
- The owner keeps no way to pull funds back inside Stage 1. That is the point of an immutable plan, and
  it is limitation L3.
- Stage 1 loses a program-controlled deposit path, so the client must show the vault balance as the only
  proof that funding landed.

## Rejected alternatives

Restore `deposit` to keep ADR 0001 unchanged. Rejected: a handler that changes no program state adds
rent, a test path, and a review surface for nothing. ADR 0001's other consequences stand.

Name the classic Token Program directly and record a deviation from `AGENTS.md`. Rejected:
`TokenInterface` costs one account type and keeps the project rule intact.
