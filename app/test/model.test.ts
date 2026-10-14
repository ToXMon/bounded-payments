import assert from "node:assert/strict";
import test from "node:test";
import { actionDisabled, canExecute, expectedRejection, formatAmount, formatTimestamp, proposalStatus, walletDescription } from "../src/model.ts";

test("REQ-21: early attempts fail the due-time check and due attempts pass", () => {
  assert.equal(canExecute("200", 199.9), false);
  assert.equal(canExecute("200", 200), true);
});

test("only the matching on-chain error counts as a rejection", () => {
  assert.equal(expectedRejection({ logs: ["Program failed: custom program error: 0x1777"] }, "Unauthorized"), true);
  assert.equal(expectedRejection({ logs: ["Program failed: custom program error: 0x1778"] }, "TransferNotDue"), true);
  assert.equal(expectedRejection(new Error("failed to fetch"), "TransferNotDue"), false);
});

test("live token display uses six-decimal USDC units", () => {
  assert.equal(formatAmount("3000000"), "3.00");
  assert.equal(formatAmount("1"), "0.00");
  assert.equal(formatAmount("18446744073709551615"), "18446744073709.55");
  assert.equal(formatTimestamp("9007199254740992"), "9007199254740992 seconds");
});

test("read-only controls stay disabled until a wallet and plan are available", () => {
  assert.deepEqual(actionDisabled(false, false, false), {
    createPlan: true,
    fundVault: true,
    execute: true,
    unauthorized: true,
    early: true,
  });
  assert.equal(actionDisabled(true, false, false).createPlan, false);
  assert.equal(actionDisabled(true, false, false).execute, true);
  assert.equal(actionDisabled(true, true, false).execute, false);
  assert.equal(actionDisabled(true, true, false, true).fundVault, true);
  assert.equal(actionDisabled(true, true, false, true).execute, true);
});

test("REQ-52: wallet status distinguishes read-only, the demo wallet, and another connected wallet", () => {
  assert.match(walletDescription(null, "demo"), /^READ-ONLY/);
  assert.match(walletDescription("demo", "demo"), /default demo wallet is connected/);
  assert.match(walletDescription("other", "demo"), /not the default demo wallet/);
});

test("the next experiment remains explicitly outside Stage 1", () => {
  assert.equal(proposalStatus, "PROPOSAL ONLY · NOT IMPLEMENTED STAGE 1 FUNCTIONALITY");
});
