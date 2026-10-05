# Product direction

## Team decision

The team selected a human control problem:

> People want software to make routine payments for them, but they do not want to grant unrestricted access or approve every payment.

The team will prove the payment controls before it adds agent selection or wallet UX.

## Why this direction

The discussion produced three related ideas:

- An owner wants automatic recurring purchases or transfers.
- An owner wants an agent to act without unrestricted treasury access.
- A passkey wallet can reduce sign-in and approval friction.

The recurring transfer gives the team the smallest useful state transition. It tests custody, authority, time rules, limits, and failure behavior. The approved-purchase demo then tests whether an agent can use the same payment path.

A passkey wallet changes how the owner signs. It does not change the payment rules. The team can add it after the program works.

## POC sequence

### Stage 1: recurring transfer

An owner creates a payment plan for one recipient. The owner sets the amount, interval, total limit, and expiry. The owner funds the vault. An authorized caller submits a transfer after the interval.

### Stage 2: approved purchase

The owner maintains a list of approved items or purchase intents. An agent selects one approved item. The client resolves the merchant and amount. The program pays only when the request satisfies the payment rules.

## Trust boundary

The Solana program trusts only account data, signer proofs, and verified program IDs. It does not trust:

- Agent prompts.
- A scheduler.
- A web application.
- A passkey service.
- A merchant description.

The program rejects requests that fail its account, authority, time, amount, or limit checks.

## Out of scope for Stage 1

- Automatic on-chain execution without a submitted transaction.
- Offline payments.
- Yield routing.
- Token swaps or DCA.
- Natural-language intent parsing.
- Multiple recipients.
- Human approval above a threshold.
- Passkey wallet integration.
- Merchant loyalty rewards.

## Open decisions

The team must resolve these points before program code starts:

1. Who can act as the authorized caller: the owner, any caller, or one service key?
2. Does a late transfer skip missed intervals or catch up one interval at a time?
3. Which token will the POC use?
4. Can the owner change an active payment plan, or must the owner close and replace it?
5. What exact data represents an approved item in Stage 2?
