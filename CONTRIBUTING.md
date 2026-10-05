# Contributing

Three people will build this project through short branches and pull requests.

## Source of truth

Use these sources in this order:

1. Accepted requirements in `docs/requirements.md`.
2. Accepted decisions in `docs/adr/`.
3. Terms in `GLOSSARY.md`.
4. FigJam for drafts and workshops.
5. Discord for discussion only.

Move each accepted Discord or FigJam decision into the repository.

## Work items

Create one GitHub issue for each change. State:

- The requirement identifiers.
- The accounts or client modules that change.
- The acceptance tests.
- The owner.

## Branches

Create branches from `main`:

- `program/<issue>-<name>` for Anchor work.
- `client/<issue>-<name>` for client work.
- `test/<issue>-<name>` for test work.
- `docs/<issue>-<name>` for requirements and diagrams.

Keep each branch small. Do not mix program, client, and unrelated document changes.

## Pull requests

- Link the issue.
- List the requirement identifiers.
- Add or update tests for each changed requirement.
- Request one teammate review.
- Resolve review comments before merge.
- Use squash merge to keep one commit per work item.

## Ownership proposal

Assign one primary owner and one reviewer for each area:

| Area | Primary owner | Reviewer |
|---|---|---|
| Program and account model | Assign in kickoff | Assign in kickoff |
| Tests and security cases | Assign in kickoff | Assign in kickoff |
| Client and demo | Assign in kickoff | Assign in kickoff |
| Requirements and diagrams | Rotate | One teammate |

No contributor owns an area alone. Each area requires review from another teammate.

## Definition of done

A change is complete when:

- The code maps to an accepted requirement.
- Positive and negative tests pass.
- The account and signer checks are explicit.
- The documents use the terms in `GLOSSARY.md`.
- One teammate approves the pull request.
- CI passes.

## Writing rules

Use direct technical English. Use one term for one concept. Keep sentences short. State the actor and action. Remove generic claims and dramatic contrasts.

Apply the `no-ai-slop` rules from `petergyang/no-ai-slop` and the Simplified Technical English rules from `0xpili/simplified-technical-english` when you change project documents.
