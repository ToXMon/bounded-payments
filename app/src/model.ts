export const proposalStatus = "PROPOSAL ONLY · NOT IMPLEMENTED STAGE 1 FUNCTIONALITY";

export function canExecute(nextDueAt: number, now: number): boolean {
  return now >= nextDueAt;
}

export function formatAmount(raw: string): string {
  return (Number(raw) / 1_000_000).toFixed(2);
}

export function actionDisabled(connected: boolean, hasPlan: boolean, busy: boolean) {
  return {
    createPlan: !connected || busy,
    fundVault: !connected || !hasPlan || busy,
    execute: !connected || !hasPlan || busy,
    unauthorized: !connected || !hasPlan || busy,
    early: !connected || !hasPlan || busy,
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

