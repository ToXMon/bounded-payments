export const proposalStatus = "PROPOSAL ONLY · NOT IMPLEMENTED STAGE 1 FUNCTIONALITY";

export function walletDescription(connectedAddress: string | null, demoAddress: string): string {
  if (!connectedAddress) return "READ-ONLY · no wallet connected. Connect the demo wallet in Phantom to sign.";
  return connectedAddress === demoAddress
    ? "CONNECTED · the default demo wallet is connected in Phantom."
    : "CONNECTED · this wallet is not the default demo wallet.";
}

export function canExecute(nextDueAt: string, now: number): boolean {
  return BigInt(Math.floor(now)) >= BigInt(nextDueAt);
}

export function formatAmount(raw: string): string {
  const cents = (BigInt(raw) + 5_000n) / 10_000n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export function formatTimestamp(raw: string): string {
  const milliseconds = BigInt(raw) * 1_000n;
  const maximum = 8_640_000_000_000_000n;
  if (milliseconds < -maximum || milliseconds > maximum) return `${raw} seconds`;
  return new Date(Number(milliseconds)).toLocaleString();
}

export function actionDisabled(connected: boolean, hasPlan: boolean, busy: boolean, readOnly = false) {
  return {
    createPlan: !connected || busy,
    fundVault: !connected || !hasPlan || busy || readOnly,
    execute: !connected || !hasPlan || busy || readOnly,
    unauthorized: !connected || !hasPlan || busy || readOnly,
    early: !connected || !hasPlan || busy || readOnly,
  };
}

export function expectedRejection(error: unknown, code: "Unauthorized" | "TransferNotDue"): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const logs = typeof error === "object" && error !== null && "logs" in error && Array.isArray(error.logs)
    ? error.logs.map(String).join("\n")
    : "";
  const text = `${message}\n${logs}`;
  const decimalCode = code === "Unauthorized" ? "6007" : "6008";
  const hexCode = code === "Unauthorized" ? "0x1777" : "0x1778";
  return text.includes(code) || text.includes(decimalCode) || text.includes(hexCode);
}

