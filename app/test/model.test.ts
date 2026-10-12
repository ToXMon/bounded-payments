import assert from "node:assert/strict";
import test from "node:test";
import { canExecute, expectedRejection, formatAmount } from "../src/model.ts";
import { readFile } from "node:fs/promises";

test("REQ-21: early attempts fail the due-time check and due attempts pass", () => {
  assert.equal(canExecute(200, 199.9), false);
  assert.equal(canExecute(200, 200), true);
});

test("only the matching on-chain error counts as a rejection", () => {
  assert.equal(expectedRejection(new Error("Error Number: 6007"), "Unauthorized"), true);
  assert.equal(expectedRejection(new Error("Error Number: 6008"), "TransferNotDue"), true);
  assert.equal(expectedRejection(new Error("failed to fetch"), "TransferNotDue"), false);
});

test("live token display uses six-decimal USDC units", () => {
  assert.equal(formatAmount("3000000"), "3.00");
  assert.equal(formatAmount("1"), "0.00");
});

test("read-only page keeps recorded evidence and proposal clearly labeled", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /Read-only mode/);
  assert.match(html, /RECORDED FALLBACK/);
  assert.match(html, /PROPOSAL ONLY · NOT IMPLEMENTED STAGE 1 FUNCTIONALITY/);
  assert.match(html, /Test unauthorized caller/);
  assert.match(html, /Test early transfer/);
});
