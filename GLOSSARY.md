# Glossary

## Approved purchase

A payment for an item that appears on an owner-approved list. The merchant and payment amount must satisfy the payment rules.

## Authorized caller

A signer that can request a transfer. The caller cannot change the payment rules or withdraw vault funds.

## Owner

The person or organization that creates the payment plan, defines the payment rules, and controls recovery actions.

## Payment plan

The program-owned state that defines one bounded payment relationship.

## Payment rules

The recipient, amount, interval, total limit, expiry, and authorized caller for a payment plan.

## Recipient

The account that receives funds. The recipient does not sign the transfer instruction.

## Recurring transfer

A transfer with a fixed recipient and amount. An authorized caller can request the transfer after each interval.

## Trigger

An off-chain event that causes an authorized caller to submit an instruction. The program verifies all on-chain conditions.

## Vault

A token account that holds funds for one payment plan. The payment plan PDA controls the vault.
