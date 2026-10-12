# Bounded Payments

Bounded Payments is a Solana proof of concept for delegated payments.

An owner defines payment rules and funds a vault. The program moves funds only when a payment satisfies those rules.

## Problem

People want software to make routine payments for them. They do not want to give software unrestricted access to their money. Manual approval for every payment removes much of the value of delegation.

## POC

The team will build two use cases in order:

1. **Recurring transfer:** The program pays one fixed recipient when an authorized caller submits a due transfer.
2. **Approved purchase:** An agent selects an item from an owner-approved list. The program pays the approved merchant within the payment limit.

Use case 2 depends on a complete and tested use case 1. The agent, passkey wallet, scheduler, and merchant integration stay outside the on-chain trust boundary.

## Success criteria

- The owner can define a recipient, amount, interval, and payment count; the program derives the total limit and expiry.
- The owner can fund a vault without granting the caller control of the vault.
- An authorized caller can execute a due transfer.
- The program rejects an early, excessive, expired, or unauthorized transfer.
- A failed instruction changes no balance or program state.
- The approved-purchase demo reuses the same bounded payment path.

## Documents

- [Product direction](docs/product-direction.md)
- [Atomic requirements](docs/requirements.md)
- [Architecture](docs/architecture.md)
- [Glossary](GLOSSARY.md)
- [Contribution workflow](CONTRIBUTING.md)
- [Stage 1 scope and funding decision](docs/adr/0002-two-handlers-derived-limits.md)

## Devnet demo

The guided client lives in `app/`. Without a connected wallet, it stays read-only. It detects an already-connected Phantom wallet and can connect a pre-funded devnet wallet for signing.

The demo displays the default devnet wallet and provides a copy action and Circle's devnet USDC faucet. Visitors can inspect the published plan without entering its address.

With a connected wallet, the client can create a fixed plan, fund its vault with a plain SPL Token transfer, and execute a due transfer. The client can also read balances and plan state and run the REQ-20 and REQ-21 rejection checks. The published plan is read-only. The x402 envelope is a proposal only; it is not Stage 1 functionality.

Run it locally:

```sh
cd app
npm ci
npm run dev
```

## Project status

The Stage 1 devnet client is implemented. On-chain program source has not started in this repository.

## FigJam

The team uses the [Bounded Payments FigJam board](https://www.figma.com/board/KwP7iyzbZcchf04sb6pWZx/dapp-diagrams--Copy-) for workshops and diagrams. The repository is the source of truth for approved requirements and decisions.
