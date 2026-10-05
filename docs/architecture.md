# Architecture

## Actors

| Actor | Function | Signs |
|---|---|---|
| Owner | Defines payment rules and recovery actions | Yes |
| Funder | Deposits tokens into the vault | Yes |
| Authorized caller | Requests a due transfer | Yes |
| Recipient | Receives tokens | No |
| Agent | Selects an approved purchase in Stage 2 | Yes, as the authorized caller |

## Programs and accounts

| Element | Owner | Function |
|---|---|---|
| Bounded Payments program | Solana loader | Verifies rules and changes plan state |
| Payment Plan PDA | Bounded Payments program | Stores payment rules and counters |
| Vault ATA | Token Program | Holds the plan funds |
| Recipient ATA | Token Program | Receives funds |
| Token Program | Solana | Executes `transfer_checked` |
| Clock sysvar | Solana | Supplies the time for due and expiry checks |

## PDA

```text
Payment Plan PDA
seeds = ["plan", owner, plan_id]
```

The program stores the canonical bump in the payment plan.

## Minimal flow

```text
Owner -- create_plan --> Bounded Payments program --> Payment Plan PDA
Funder -- deposit ----> Bounded Payments program --> Vault ATA
Caller -- execute_transfer --> Bounded Payments program
                                      |
                                      +-- verify signer
                                      +-- verify due time
                                      +-- verify expiry
                                      +-- verify remaining limit
                                      +-- Token Program CPI: transfer_checked
                                      +-- update paid total and next due time

Vault ATA -- tokens --> Recipient ATA
```

## Atomic boundary

The `execute_transfer` instruction contains the checks, token transfer, paid-total update, and next-due-time update. If one operation fails, Solana rolls back all operations.

## Stage 2 extension

The approved-purchase flow adds an approved intent account. It does not replace the vault or payment checks.

```text
Owner -- approve intent --> Approved Intent PDA
Agent -- execute purchase --> program -- verify intent --> existing payment path
```

## Traceability

| Handler | Requirements | State change |
|---|---|---|
| `create_plan` | REQ-01 to REQ-07 | Creates one payment plan |
| `deposit` | REQ-08 | Increases the vault balance |
| `execute_transfer` | REQ-09 to REQ-16 | Pays one due transfer or changes nothing |
| `approve_purchase_intent` | REQ-17 to REQ-18 | Creates or changes one approved intent |
| `execute_purchase` | REQ-19 to REQ-23 | Pays one approved purchase or changes nothing |
