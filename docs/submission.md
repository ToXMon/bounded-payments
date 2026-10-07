# Deliverable 2: Architecture diagram and requirements

Owner: WalquerX
Reviewers: Wijnaldum, Toto
Status: Draft

How to work on this file:

- Write directly in each section. The sections match the assignment rubric.
- Pre-filled text comes from `docs/requirements.md`, `docs/architecture.md`, and `docs/adr/0001`. Change it if you disagree, and say why in the PR.
- Lines that start with `TODO` need your input.
- Keep Stage 1 to `create_plan`, `deposit`, and `execute_transfer`. Put everything else in the roadmap section.
- If you must decide an open question to move forward, decide it and mark it `PROPOSED`.
- When the team approves the PR, we export this file to Google Docs for Classroom.

## 1. Problem statement

People want software to make routine payments for them. They do not want to grant unrestricted access to their money. Manual approval for every payment removes much of the value of delegation.

TODO: Add one concrete scenario from the team discussion (cat food, monthly book, allowance).

## 2. MVP use cases

The assignment allows 1 to 3 use cases. One use case equals one atomic state transition and one Anchor instruction handler.

| Use case | State transition | Handler | Signer |
|---|---|---|---|
| UC-1 Create a payment plan | One Payment Plan PDA exists with the payment rules | `create_plan` | Owner |
| UC-2 Fund the vault | Vault balance increases | `deposit` | Funder |
| UC-3 Execute a due transfer | Vault balance decreases, recipient balance increases, `paid_total` and `next_due_at` update, or nothing changes | `execute_transfer` | Authorized caller |

## 3. Actors

| Category | Actor | Signs | Role |
|---|---|---|---|
| Direct | Owner | Yes | Creates the plan and defines the rules |
| Direct | Funder | Yes | Deposits tokens |
| Direct | Authorized caller | Yes | Submits a due transfer |
| Beneficiary | Recipient | No | Receives tokens |
| Administrator | None in the transfer path | - | - |
| Third party | Token Program, Associated Token Program, System Program, Clock sysvar | No | Settlement and time |
| Stakeholder | Agent (Stage 2) | Yes, as the authorized caller | Selects an approved purchase |

TODO: Confirm the stakeholder row with the team. Remove it if the assignment wants Stage 1 actors only.

## 4. Atomic requirements

Copy of `docs/requirements.md` Stage 1. Edit there first, then update here.

### `create_plan`

- REQ-01: The program must create one payment plan for one owner and one plan identifier.
- REQ-02: The program must store one recipient in the payment plan.
- REQ-03: The program must store one transfer amount in the payment plan.
- REQ-04: The program must store one transfer interval in the payment plan.
- REQ-05: The program must store one total payment limit in the payment plan.
- REQ-06: The program must store one expiry time in the payment plan.
- REQ-07: The program must store one authorized caller in the payment plan.

### `deposit`

- REQ-08: The program must transfer tokens from the funder token account to the plan vault.

### `execute_transfer`

- REQ-09: The program must accept a transfer request only from the stored authorized caller.
- REQ-10: The program must reject a transfer request before the next due time.
- REQ-11: The program must reject a transfer request after the plan expiry time.
- REQ-12: The program must reject a transfer that exceeds the remaining total limit.
- REQ-13: The program must transfer the stored amount from the vault to the stored recipient token account.
- REQ-14: The program must add the transfer amount to the paid total.
- REQ-15: The program must set the next due time after a successful transfer.
- REQ-16: The transaction must preserve all balances and plan state when any check or token transfer fails.

## 5. Overview diagram

TODO: Insert the diagram image or link. Every arrow needs a number, the handler name, and the REQ ids.

Arrow list to draw:

1. Owner -> Program: `create_plan` (REQ-01 to REQ-07)
2. Funder -> Program: `deposit` (REQ-08)
3. Authorized caller -> Program: `execute_transfer` (REQ-09 to REQ-16)
4. Program -> Payment Plan PDA: read rules, update `paid_total` and `next_due_at`
5. Program -> Vault ATA: PDA signs `transfer_checked`
6. Vault ATA -> Recipient ATA: tokens

## 6. Flow diagrams

One flow per handler. Draw each decision and the error path.

### `create_plan`

Owner signs -> program derives the PDA from `["plan", owner, plan_id]` -> program writes the rules -> done.

TODO: Decide if the program must check `amount <= total_limit` and `expiry > now` at creation. Mark the decision `PROPOSED`.

### `deposit`

Funder signs -> `transfer_checked` from the funder token account to the Vault ATA -> done.

### `execute_transfer`

1. `caller == authorized_caller`? No -> fail (REQ-09).
2. `now >= next_due_at`? No -> fail (REQ-10).
3. `now <= expiry`? No -> fail (REQ-11).
4. `paid_total + amount <= total_limit`? No -> fail (REQ-12).
5. `transfer_checked` Vault ATA -> Recipient ATA (REQ-13).
6. `paid_total += amount` (REQ-14).
7. Set `next_due_at` (REQ-15).

Failure outcome: the transaction fails, no tokens move, no state persists (REQ-16).

## 7. On-chain requirements matrix

| Element | Type | Owner | Seeds or fields | Requirements |
|---|---|---|---|---|
| Bounded Payments program | Program | Loader | - | All |
| Payment Plan | PDA | Bounded Payments program | `["plan", owner, plan_id]`; `owner`, `recipient`, `amount`, `interval`, `total_limit`, `paid_total`, `next_due_at`, `expiry`, `authorized_caller`, `bump` | REQ-01 to REQ-07, REQ-14, REQ-15 |
| Vault ATA | Token account | Token Program | authority = Payment Plan PDA | REQ-08, REQ-13 |
| Recipient ATA | Token account | Token Program | owner = recipient | REQ-13 |
| Token Program or Token-2022 | External program | Solana | `transfer_checked` | REQ-08, REQ-13 |
| Associated Token Program | External program | Solana | vault creation | REQ-01 |
| System Program | External program | Solana | account creation | REQ-01 |
| Clock sysvar | Sysvar | Solana | `unix_timestamp` | REQ-10, REQ-11, REQ-15 |

## 8. Negative tests

- Wrong owner for plan creation.
- Wrong authorized caller for transfer execution.
- Wrong recipient token account.
- Transfer before the next due time.
- Transfer after expiry.
- Transfer above the remaining total limit.
- Vault with insufficient funds.

## 9. Open decisions

Mark each one `OPEN` or `PROPOSED` with your proposal.

1. OPEN: Who can act as the authorized caller: the owner, any caller, or one stored service key?
2. OPEN: Does a late transfer skip missed intervals or catch up one interval at a time?
3. OPEN: Which token does the POC use?
4. OPEN: Can the owner change an active plan, or must the owner close and replace it?

## 10. Roadmap (not in the POC)

- Stage 2 approved purchase: `approve_purchase_intent`, `execute_purchase` (REQ-17 to REQ-23).
- Threshold confirmation by the owner.
- Passkey wallet for owner signing.
- Multiple recipients, pause and resume, key rotation, rolling windows, receipt indexer.

## 11. Individual reflections

Each member writes one paragraph: contribution, one AI suggestion they rejected, and why.

- WalquerX: TODO
- Wijnaldum: TODO
- Toto: TODO
