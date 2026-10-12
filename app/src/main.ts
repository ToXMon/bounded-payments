import "./buffer-polyfill";
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import idl from "./bounded_payments.json";
import { canExecute, expectedRejection, formatAmount } from "./model";
import "./style.css";

const PROGRAM_ID = new PublicKey("Hcgo55q8sQZW1cw6UBBErqZEhCYGjph7PKmK26rvkp2Z");
const MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const text = (id: string, value: string) => { $(id).textContent = value; };
const inputs = { id: $("plan-id") as HTMLInputElement, recipient: $("recipient") as HTMLInputElement, caller: $("caller") as HTMLInputElement, due: $("first-due") as HTMLInputElement };
let wallet: PhantomProvider | undefined;
let program: Program<Idl> | undefined;
let planAddress: PublicKey | undefined;
let vaultAddress: PublicKey | undefined;
let recipientAddress: PublicKey | undefined;
let recipientOwner: PublicKey | undefined;
let livePlan: any;
let busy = false;

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect(): Promise<{ publicKey: PublicKey }>;
  signTransaction(tx: Transaction): Promise<Transaction>;
  signAllTransactions(txs: Transaction[]): Promise<Transaction[]>;
  on(event: string, callback: (...args: any[]) => void): void;
}
declare global { interface Window { solana?: PhantomProvider } }

const provider = () => new AnchorProvider(connection, {
  publicKey: wallet?.publicKey ?? PublicKey.default,
  signTransaction: (tx: Transaction) => wallet ? wallet.signTransaction(tx) : Promise.reject(new Error("Connect Phantom to sign.")),
  signAllTransactions: (txs: Transaction[]) => wallet ? wallet.signAllTransactions(txs) : Promise.reject(new Error("Connect Phantom to sign.")),
} as any, { commitment: "confirmed", preflightCommitment: "confirmed" });
const getProgram = () => program ??= new Program(idl as Idl, provider());
const planPda = (owner: PublicKey, id: string) => PublicKey.findProgramAddressSync([new TextEncoder().encode("plan"), owner.toBuffer(), Uint8Array.from(new BN(id).toArray("le", 8))], PROGRAM_ID)[0];
const displayError = (error: unknown) => error instanceof Error ? error.message.replace(/^Error: /, "") : String(error);
const setResult = (id: string, message: string, state: "ok" | "error" | "info" = "info") => {
  const node = $(id); node.textContent = message; node.className = `result ${state}`;
};
const withBusy = async (button: HTMLButtonElement, resultId: string, fn: () => Promise<void>) => {
  if (busy) return;
  busy = true; button.disabled = true;
  try { await fn(); } catch (error) { setResult(resultId, displayError(error), "error"); }
  finally { busy = false; updateButtons(); }
};
function updateButtons() {
  const connected = !!wallet?.publicKey;
  $("create-plan").toggleAttribute("disabled", !connected || busy);
  $("fund-vault").toggleAttribute("disabled", !connected || !planAddress || busy);
  $("execute").toggleAttribute("disabled", !connected || !planAddress || busy);
  $("try-unauthorized").toggleAttribute("disabled", !connected || !planAddress || busy);
  $("try-early").toggleAttribute("disabled", !connected || !planAddress || busy);
}
function renderPlan(plan: any, address: PublicKey) {
  livePlan = plan;
  text("plan-state", `Live account · ${address.toBase58()}`);
  const fields: [string, string][] = [["Owner", plan.owner.toBase58()], ["Plan ID", plan.planId.toString()], ["Recipient account", plan.recipient.toBase58()], ["Authorized caller", plan.authorizedCaller.toBase58()], ["Payment", `${formatAmount(plan.amount.toString())} USDC`], ["Paid total", `${formatAmount(plan.paidTotal.toString())} USDC`], ["Total limit", `${formatAmount(plan.totalLimit.toString())} USDC`], ["Next due", new Date(plan.nextDueAt.toNumber() * 1000).toLocaleString()], ["Expiry", new Date(plan.expiry.toNumber() * 1000).toLocaleString()]];
  const list = $("plan-fields"); list.replaceChildren(...fields.map(([key, val]) => {
    const row = document.createElement("div"); const term = document.createElement("dt"); const value = document.createElement("dd");
    term.textContent = key; value.textContent = val; row.append(term, value); return row;
  }));
}
async function refreshBalances() {
  if (!planAddress || !vaultAddress || !recipientAddress) return;
  try {
    const [vault, recipient] = await Promise.all([getAccount(connection, vaultAddress), getAccount(connection, recipientAddress)]);
    text("vault-balance", `${formatAmount(vault.amount.toString())} USDC`);
    text("recipient-balance", `${formatAmount(recipient.amount.toString())} USDC`);
  } catch { text("vault-balance", "Account not found"); }
}
async function refreshPlan() {
  if (!planAddress) return;
  try { renderPlan(await (getProgram().account as any).paymentPlan.fetch(planAddress), planAddress); await refreshBalances(); }
  catch (error) { text("plan-state", `No live plan at ${planAddress.toBase58()} · ${displayError(error)}`); }
}
async function makeTransaction(instructions: Transaction["instructions"]) {
  const tx = new Transaction().add(...instructions);
  tx.feePayer = wallet!.publicKey!;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  const signed = await wallet!.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}
const link = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

$("connect").addEventListener("click", async () => {
  const button = $("connect") as HTMLButtonElement;
  try {
    const phantom = window.solana;
    if (!phantom?.isPhantom) throw new Error("Phantom was not found. You can continue in read-only mode.");
    const { publicKey } = await phantom.connect(); wallet = phantom;
    inputs.caller.value ||= publicKey.toBase58();
    inputs.recipient.value ||= publicKey.toBase58();
    program = new Program(idl as Idl, provider());
    button.textContent = `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`;
    button.disabled = true;
    text("wallet-note", "Connected to Phantom · Use a pre-funded devnet wallet. Transactions require your approval.");
    text("rpc-state", "Public Solana devnet RPC · live reads"); updateButtons();
  } catch (error) { setResult("create-result", displayError(error), "error"); }
});
window.solana?.on("accountChanged", (key) => { wallet = key && window.solana ? window.solana : undefined; updateButtons(); });

$("create-plan").addEventListener("click", () => withBusy($("create-plan") as HTMLButtonElement, "create-result", async () => {
  if (!wallet?.publicKey) throw new Error("Connect Phantom first.");
  const id = inputs.id.value.trim();
  if (!/^\d+$/.test(id) || BigInt(id) < 1n || BigInt(id) > (1n << 64n) - 1n) throw new Error("Plan ID must be a positive u64.");
  recipientOwner = new PublicKey(inputs.recipient.value.trim() || wallet.publicKey.toBase58());
  const caller = new PublicKey(inputs.caller.value.trim() || wallet.publicKey.toBase58());
  recipientAddress = getAssociatedTokenAddressSync(MINT, recipientOwner);
  planAddress = planPda(wallet.publicKey, id); vaultAddress = getAssociatedTokenAddressSync(MINT, planAddress, true);
  const now = Math.floor(Date.now() / 1000);
  const due = inputs.due.value ? Math.floor(new Date(inputs.due.value).getTime() / 1000) : null;
  if (due !== null && (!Number.isSafeInteger(due) || due < now)) throw new Error("First due time must be in the future or left blank.");
  const ix = await getProgram().methods.createPlan(new BN(id), new BN(1_000_000), new BN(60), new BN(3), due === null ? null : new BN(due), caller)
    .accounts({ owner: wallet.publicKey, plan: planAddress, mint: MINT, recipient: recipientAddress, vault: vaultAddress, tokenProgram: TOKEN_PROGRAM_ID }).instruction();
  const ata = createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, recipientAddress, recipientOwner, MINT);
  const sig = await makeTransaction([ata, ix]);
  setResult("create-result", `Plan created · ${link(sig)}`, "ok"); await refreshPlan();
}));

$("fund-vault").addEventListener("click", () => withBusy($("fund-vault") as HTMLButtonElement, "fund-result", async () => {
  if (!wallet?.publicKey || !vaultAddress) throw new Error("Create or inspect a plan first.");
  const source = getAssociatedTokenAddressSync(MINT, wallet.publicKey);
  const sig = await makeTransaction([createTransferCheckedInstruction(source, MINT, vaultAddress, wallet.publicKey, 3_000_000n, 6)]);
  setResult("fund-result", `USDC sent to vault · ${link(sig)}`, "ok"); await refreshBalances();
}));

async function execute() {
  if (!wallet?.publicKey || !planAddress || !livePlan) throw new Error("Load a live plan before submitting.");
  const ix = await getProgram().methods.executeTransfer().accounts({ authorizedCaller: wallet.publicKey, plan: planAddress, mint: MINT, vault: vaultAddress!, recipient: livePlan.recipient, tokenProgram: TOKEN_PROGRAM_ID }).instruction();
  const sig = await makeTransaction([ix]); return sig;
}
$("execute").addEventListener("click", () => withBusy($("execute") as HTMLButtonElement, "execute-result", async () => {
  const sig = await execute(); setResult("execute-result", `Transfer finalized · ${link(sig)}`, "ok"); await refreshPlan();
}));
$("try-unauthorized").addEventListener("click", () => withBusy($("try-unauthorized") as HTMLButtonElement, "unauthorized-result", async () => {
  if (!livePlan) await refreshPlan();
  if (livePlan?.authorizedCaller.equals(wallet!.publicKey!)) throw new Error("This wallet is the authorized caller. Connect another wallet to test REQ-20.");
  try { await execute(); setResult("unauthorized-result", "Unexpected success: verify the deployed program and plan.", "error"); }
  catch (error) {
    if (!expectedRejection(error, "Unauthorized")) throw error;
    setResult("unauthorized-result", `Rejected as expected · REQ-20 · ${displayError(error)}`, "ok"); await refreshPlan();
  }
}));
$("try-early").addEventListener("click", () => withBusy($("try-early") as HTMLButtonElement, "early-result", async () => {
  if (!livePlan) await refreshPlan();
  if (!livePlan) throw new Error("Load a live plan first.");
  if (canExecute(livePlan.nextDueAt.toNumber(), Date.now() / 1000)) throw new Error("This plan is already due. Create another plan with a future due time to test REQ-21.");
  try { await execute(); setResult("early-result", "Unexpected success: verify the deployed program and plan.", "error"); }
  catch (error) {
    if (!expectedRejection(error, "TransferNotDue")) throw error;
    setResult("early-result", `Rejected as expected · REQ-21 · ${displayError(error)}`, "ok"); await refreshPlan();
  }
}));

$("inspect").addEventListener("click", async () => {
  try {
    const address = new PublicKey(($("inspect-address") as HTMLInputElement).value.trim());
    planAddress = address;
    const plan = await (getProgram().account as any).paymentPlan.fetch(address);
    vaultAddress = getAssociatedTokenAddressSync(MINT, address, true);
    recipientAddress = plan.recipient;
    renderPlan(plan, address); await refreshBalances();
    setResult("inspect-result", "Live plan state loaded from devnet.", "ok"); updateButtons();
  } catch (error) { setResult("inspect-result", `Live read failed · ${displayError(error)}`, "error"); }
});

text("rpc-state", "Public Solana devnet RPC · read-only until wallet connects");
updateButtons();
