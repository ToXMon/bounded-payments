export function canExecute(nextDueAt: number, now: number): boolean {
  return now >= nextDueAt;
}

export function formatAmount(raw: string): string {
  return (Number(raw) / 1_000_000).toFixed(2);
}

export function expectedRejection(error: unknown, code: "Unauthorized" | "TransferNotDue"): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(code) || message.includes(code === "Unauthorized" ? "6007" : "6008");
}

