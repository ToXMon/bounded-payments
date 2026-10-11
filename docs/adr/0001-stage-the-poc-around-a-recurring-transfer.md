# ADR 0001: Stage the POC around a recurring transfer

- Status: Accepted
- Date: 2026-10-05

## Context

The team considered agent spending controls, recurring purchases, fixed transfers, passkey wallets, savings yield, and merchant rewards.

The capstone needs a small on-chain state transition that the team can build and test. An agent purchase adds item selection, merchant data, and client integration before the payment rules work.

## Decision

Build the recurring transfer first. Add one approved-purchase flow only after the recurring transfer passes its tests.

Keep the agent and passkey wallet outside the Stage 1 program boundary.

## Consequences

- The first program needs three handlers: `create_plan`, `deposit`, and `execute_transfer`.
  Superseded for the handler count by ADR 0002. The staging decision stands.
- The team can divide program, client, and test work around one stable account model.
- The first demo can work without an AI agent.
- The second demo can show an agent-selected purchase without granting the agent vault authority.
- The team will not claim that the program executes by itself. An off-chain caller must submit each transaction.
