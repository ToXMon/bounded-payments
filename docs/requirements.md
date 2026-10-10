# Atomic requirements

Each requirement contains one testable action. Each state transition maps to one Anchor instruction handler.
Stage 1 is the recurring transfer, per ADR 0001 and ADR 0002.

The four terms come from `GLOSSARY.md`: payment plan, payment rules, vault, authorized caller.

## Stage 1: recurring transfer

### Create a payment plan

Handler: `create_plan`. Signer: the owner, who also pays rent for the plan and the vault.

Inputs: `plan_id: u64`, `amount: u64`, `interval: i64`, `payment_count: u64`,
`first_due_at: Option<i64>`, `authorized_caller: Pubkey`, recipient token account.

| REQ | The program must | Test |
| --- | --- | --- |
| REQ-01 | Create one payment plan PDA with seeds `["plan", owner, plan_id]`. | Read plan. The address derives from those seeds with the canonical bump. |
| REQ-02 | Store the owner. | Read plan. |
| REQ-03 | Reject a mint that is not the devnet USDC mint. | Other mint fails. |
| REQ-04 | Store the recipient token account. | Read plan. |
| REQ-05 | Store the amount. | Read plan. |
| REQ-06 | Store the interval in seconds. | Read plan. |
| REQ-07 | Compute and store `total_limit = amount × payment_count`. | 10 × 3 stores 30. |
| REQ-08 | Compute and store `expiry = next_due_at + payment_count × interval`. | Due 100, interval 10, count 3 stores 130. No due date given, `now` 100, interval 10, count 3 stores 130. |
| REQ-09 | Store the authorized caller. | Read plan. |
| REQ-10 | Set `next_due_at` to `first_due_at`, or to `now` when the owner gives no value. | Both cases. |
| REQ-11 | Set `paid_total` to 0. | Read plan. |
| REQ-12 | Create the vault token account with the payment plan PDA as authority. | Vault authority is the plan PDA. |
| REQ-13 | Reject an amount of 0. | Fails. |
| REQ-14 | Reject an interval of 0 or less. | 0 and −1 fail. |
| REQ-15 | Reject a payment count of 0. | Fails. |
| REQ-16 | Reject a given `first_due_at` earlier than `now`. | Past value fails. |
| REQ-17 | Reject a recipient token account whose mint is not the devnet USDC mint. | Other mint fails. |
| REQ-18 | Reject the zero key as the authorized caller. | Fails. |
| REQ-19 | Reject any arithmetic overflow in the computed fields. | Very large count or interval fails on checked math, not a panic. |
| REQ-30 | Reject `create_plan` when the payment plan PDA for these seeds already exists. | Same owner and `plan_id` twice fails. The first plan is unchanged. |

REQ-30 is numbered last so the `execute_transfer` range below keeps its ids. It belongs to `create_plan`.

Funding the vault is not a program requirement. Any wallet or exchange sends devnet USDC to the vault
with a plain SPL Token transfer, and the Token Program enforces the mint. Funding grants no authority
(ADR 0002).

### Execute a due transfer

Handler: `execute_transfer`. Signer: the stored authorized caller.

| REQ | The program must | Test |
| --- | --- | --- |
| REQ-20 | Accept a transfer request only from the stored authorized caller. | Wrong key fails. |
| REQ-21 | Reject a request before the next due time. | `now < next_due_at` fails. |
| REQ-22 | Reject a request after the plan expiry time. | `now > expiry` fails. |
| REQ-23 | Reject a transfer above the remaining total limit. | `paid_total + amount > total_limit` fails. |
| REQ-24 | Reject a recipient token account that is not the stored recipient. | Other account fails. |
| REQ-25 | Transfer the stored amount from the vault to the stored recipient with `transfer_checked`, signed by the plan PDA. | Balances change by the amount. Vault short of funds fails with the Token Program error. |
| REQ-26 | Add the transfer amount to the paid total. | Read plan. |
| REQ-27 | Set `next_due_at` to the first scheduled time after `now`. | Due 100, interval 10, `now` 125 stores 130. `now` 100 exactly stores 110. |
| REQ-28 | Reject any arithmetic overflow in the update. | Fails on checked math. |
| REQ-29 | Preserve all balances and plan state when any check or transfer fails. | After each failure above, balances and plan are unchanged. |

## Required negative tests

One per rejection requirement, as `AGENTS.md` requires.

| Test | REQ |
| --- | --- |
| Wrong mint. | REQ-03 |
| Recipient account holds the wrong mint. | REQ-17 |
| Same owner and `plan_id` twice. | REQ-30 |
| Amount of 0. | REQ-13 |
| Interval of 0, and interval of −1. | REQ-14 |
| Payment count of 0. | REQ-15 |
| `first_due_at` in the past. | REQ-16 |
| Zero key as authorized caller. | REQ-18 |
| Overflow at creation. | REQ-19 |
| Wrong authorized caller. | REQ-20 |
| Transfer before the next due time. | REQ-21 |
| Transfer after expiry. | REQ-22 |
| Transfer above the remaining limit. | REQ-23 |
| Wrong recipient account. | REQ-24 |
| Vault with insufficient funds. | REQ-25 |
| Overflow in the update. | REQ-28 |

No requirement rejects a different owner. The owner is a PDA seed, so a second owner with the same `plan_id` creates a second plan, and that is correct behavior. The rejection case is the same owner and `plan_id` twice (REQ-30).

## Stage 2: approved purchase

These requirements stay provisional until Stage 1 passes its tests. They are numbered from REQ-40 so
they cannot collide with the Stage 1 set, which now runs to REQ-30. This matches
`docs/architecture.md:106`.

- **REQ-40:** The owner must sign each change to the approved item list.
- **REQ-41:** The client must create a canonical hash for each approved purchase intent.
- **REQ-42:** The program must reject a purchase intent that the payment plan does not approve.
- **REQ-43:** The program must reject a purchase amount above the plan payment limit.
- **REQ-44:** The program must transfer tokens only to the merchant stored for the approved intent.
- **REQ-45:** The program must mark a successful purchase intent as used.
- **REQ-46:** A failed purchase must preserve all balances and program state.

Provisional handlers: `approve_purchase_intent`, `execute_purchase`.
