# Atomic requirements

Each requirement contains one testable action. Each state transition maps to one Anchor instruction handler.

## Stage 1: recurring transfer

### Create a payment plan

- **REQ-01:** The program must create one payment plan for one owner and one plan identifier.
- **REQ-02:** The program must store one recipient in the payment plan.
- **REQ-03:** The program must store one transfer amount in the payment plan.
- **REQ-04:** The program must store one transfer interval in the payment plan.
- **REQ-05:** The program must store one total payment limit in the payment plan.
- **REQ-06:** The program must store one expiry time in the payment plan.
- **REQ-07:** The program must store one authorized caller in the payment plan.

Handler: `create_plan`

### Fund the vault

- **REQ-08:** The program must transfer tokens from the funder token account to the plan vault.

Handler: `deposit`

### Execute a due transfer

- **REQ-09:** The program must accept a transfer request only from the stored authorized caller.
- **REQ-10:** The program must reject a transfer request before the next due time.
- **REQ-11:** The program must reject a transfer request after the plan expiry time.
- **REQ-12:** The program must reject a transfer that exceeds the remaining total limit.
- **REQ-13:** The program must transfer the stored amount from the vault to the stored recipient token account.
- **REQ-14:** The program must add the transfer amount to the paid total.
- **REQ-15:** The program must set the next due time after a successful transfer.
- **REQ-16:** The transaction must preserve all balances and plan state when any check or token transfer fails.

Handler: `execute_transfer`

## Stage 2: approved purchase

These requirements stay provisional until Stage 1 passes its tests.

- **REQ-17:** The owner must sign each change to the approved item list.
- **REQ-18:** The client must create a canonical hash for each approved purchase intent.
- **REQ-19:** The program must reject a purchase intent that the payment plan does not approve.
- **REQ-20:** The program must reject a purchase amount above the plan payment limit.
- **REQ-21:** The program must transfer tokens only to the merchant stored for the approved intent.
- **REQ-22:** The program must mark a successful purchase intent as used.
- **REQ-23:** A failed purchase must preserve all balances and program state.

Provisional handlers: `approve_purchase_intent`, `execute_purchase`

## Required negative tests

- Wrong owner for plan creation.
- Wrong authorized caller for transfer execution.
- Wrong recipient token account.
- Transfer before the next due time.
- Transfer after expiry.
- Transfer above the remaining total limit.
- Vault with insufficient funds.
- Reuse of a completed purchase intent.
- Merchant substitution for an approved purchase.
