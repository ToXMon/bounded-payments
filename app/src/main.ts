import "./buffer-polyfill";
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import idl from "./bounded_payments.json";
import { actionDisabled, canExecute, expectedRejection, formatAmount, formatTimestamp, proposalStatus, walletDescription } from "./model";
import "./style.css";

const PROGRAM_ID = new PublicKey("Hcgo55q8sQZW1cw6UBBErqZEhCYGjph7PKmK26rvkp2Z");
const MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const DEMO_WALLET = "AH6Bdc2XW2Xaq12tfjSt4WQvYN8fzs385yJFBbnprtyg";
const DEMO_PLAN = "FFKWiEKrmQ5cwbdqQLu2Mq9iY3SZMUvg3UU4tZUtMuwM";
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const text = (id: string, value: string) => { $(id).textContent = value; };
const inputs = { id: $("plan-id") as HTMLInputElement, recipient: $("recipient") as HTMLInputElement, caller: $("caller") as HTMLInputElement, due: $("first-due") as HTMLInputElement };
let wallet: PhantomProvider | undefined;
let program: Program<Idl> | undefined;
let planAddress: PublicKey | undefined;
let vaultAddress: PublicKey | undefined;
let recipientAddress: PublicKey | undefined;
let livePlan: any;
let planReadOnly = false;
let planRequest = 0;
let planLoading = false;
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
const updateWalletNote = () => text("wallet-note", walletDescription(wallet?.publicKey?.toBase58() ?? null, DEMO_WALLET));
function updateWalletUi() {
  const key = wallet?.publicKey;
  const button = $("connect") as HTMLButtonElement;
  button.disabled = !!key;
  button.textContent = key ? `Connected · ${key.toBase58().slice(0, 4)}…${key.toBase58().slice(-4)}` : "Connect Phantom";
  updateWalletNote();
  updateButtons();
}
async function copyAddress(value: string, resultId: string) {
  try { await navigator.clipboard.writeText(value); setResult(resultId, "Address copied.", "ok"); }
  catch { setResult(resultId, "Clipboard unavailable. Select and copy the address above.", "error"); }
}
const withBusy = async (button: HTMLButtonElement, resultId: string, fn: () => Promise<void>) => {
  if (busy) return;
  busy = true; button.disabled = true; updateButtons();
  try { await fn(); } catch (error) { setResult(resultId, displayError(error), "error"); }
  finally { busy = false; updateButtons(); }
};
function updateButtons() {
  const state = actionDisabled(!!wallet?.publicKey, !!planAddress, busy || planLoading, planReadOnly);
  $("create-plan").toggleAttribute("disabled", state.createPlan);
  $("fund-vault").toggleAttribute("disabled", state.fundVault);
  $("execute").toggleAttribute("disabled", state.execute);
  $("try-unauthorized").toggleAttribute("disabled", state.unauthorized);
  $("try-early").toggleAttribute("disabled", state.early);
  $("inspect").toggleAttribute("disabled", busy || planLoading);
  $("inspect-demo-plan").toggleAttribute("disabled", busy || planLoading);
}
function renderPlan(plan: any, address: PublicKey) {
  livePlan = plan;
  text("plan-state", `Live account · ${address.toBase58()}`);
  const fields: [string, string][] = [["Owner", plan.owner.toBase58()], ["Plan ID", plan.planId.toString()], ["Recipient account", plan.recipient.toBase58()], ["Authorized caller", plan.authorizedCaller.toBase58()], ["Payment", `${formatAmount(plan.amount.toString())} USDC`], ["Paid total", `${formatAmount(plan.paidTotal.toString())} USDC`], ["Total limit", `${formatAmount(plan.totalLimit.toString())} USDC`], ["Next due", formatTimestamp(plan.nextDueAt.toString())], ["Expiry", formatTimestamp(plan.expiry.toString())]];
  const list = $("plan-fields"); list.replaceChildren(...fields.map(([key, val]) => {
    const row = document.createElement("div"); const term = document.createElement("dt"); const value = document.createElement("dd");
    term.textContent = key; value.textContent = val; row.append(term, value); return row;
  }));
}
async function refreshBalances(request = planRequest) {
  const address = planAddress;
  const vaultAddressSnapshot = vaultAddress;
  const recipientAddressSnapshot = recipientAddress;
  if (!address || !vaultAddressSnapshot || !recipientAddressSnapshot) return;
  try {
    const [vault, recipient] = await Promise.all([getAccount(connection, vaultAddressSnapshot), getAccount(connection, recipientAddressSnapshot)]);
    if (request !== planRequest || planAddress !== address) return;
    text("vault-balance", `${formatAmount(vault.amount.toString())} USDC`);
    text("recipient-balance", `${formatAmount(recipient.amount.toString())} USDC`);
  } catch {
    if (request !== planRequest || planAddress !== address) return;
    text("vault-balance", "Account not found");
    text("recipient-balance", "Account not found");
  }
}
function clearPlan() {
  planAddress = undefined;
  vaultAddress = undefined;
  recipientAddress = undefined;
  livePlan = undefined;
  planReadOnly = false;
  text("plan-state", "No live plan loaded.");
  $("plan-fields").replaceChildren();
  text("vault-balance", "— USDC");
  text("recipient-balance", "— USDC");
  updateButtons();
}
function commitPlan(plan: any, address: PublicKey) {
  planAddress = address;
  vaultAddress = getAssociatedTokenAddressSync(MINT, address, true);
  recipientAddress = plan.recipient;
  planReadOnly = address.toBase58() === DEMO_PLAN;
  renderPlan(plan, address);
}
async function refreshPlan() {
  if (!planAddress) return;
  const address = planAddress;
  const request = ++planRequest;
  try {
    const plan = await (getProgram().account as any).paymentPlan.fetch(address);
    if (request !== planRequest) return;
    commitPlan(plan, address); await refreshBalances(request);
  } catch (error) {
    if (request !== planRequest) return;
    clearPlan();
    text("plan-state", `No live plan at ${address.toBase58()} · ${displayError(error)}`);
  }
}
async function makeTransaction(instructions: Transaction["instructions"]) {
  const tx = new Transaction().add(...instructions);
  tx.feePayer = wallet!.publicKey!;
  tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  const signed = await wallet!.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  const confirmation = await connection.confirmTransaction(sig, "confirmed");
  if (confirmation.value.err) throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  return sig;
}
const link = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const setTransactionResult = (id: string, prefix: string, sig: string) => {
  const node = $(id); node.replaceChildren(document.createTextNode(`${prefix} `));
  const anchor = document.createElement("a");
  anchor.href = link(sig); anchor.target = "_blank"; anchor.rel = "noreferrer"; anchor.textContent = "View transaction ↗";
  node.append(anchor); node.className = "result ok";
};

$("connect").addEventListener("click", async () => {
  try {
    const phantom = window.solana;
    if (!phantom?.isPhantom) throw new Error("Phantom was not found. You can continue in read-only mode.");
    const { publicKey } = await phantom.connect(); wallet = phantom;
    inputs.caller.value ||= publicKey.toBase58();
    inputs.recipient.value ||= publicKey.toBase58();
    program = new Program(idl as Idl, provider());
    updateWalletUi();
    text("rpc-state", "Public Solana devnet RPC · live reads");
  } catch (error) { setResult("create-result", displayError(error), "error"); }
});
window.solana?.on("accountChanged", (key) => {
  wallet = key && window.solana ? window.solana : undefined; program = undefined;
  updateWalletUi();
});

$("create-plan").addEventListener("click", () => withBusy($("create-plan") as HTMLButtonElement, "create-result", async () => {
  if (planLoading) throw new Error("Wait for plan inspection to finish.");
  if (!wallet?.publicKey) throw new Error("Connect Phantom first.");
  const id = inputs.id.value.trim();
  if (!/^\d+$/.test(id) || BigInt(id) < 1n || BigInt(id) > (1n << 64n) - 1n) throw new Error("Plan ID must be a positive u64.");
  const recipientOwner = new PublicKey(inputs.recipient.value.trim() || wallet.publicKey.toBase58());
  const caller = new PublicKey(inputs.caller.value.trim() || wallet.publicKey.toBase58());
  const recipient = getAssociatedTokenAddressSync(MINT, recipientOwner);
  const address = planPda(wallet.publicKey, id);
  const vault = getAssociatedTokenAddressSync(MINT, address, true);
  const now = Math.floor(Date.now() / 1000);
  const due = inputs.due.value ? Math.floor(new Date(inputs.due.value).getTime() / 1000) : null;
  if (due !== null && (!Number.isSafeInteger(due) || due < now)) throw new Error("First due time must be in the future or left blank.");
  const ix = await getProgram().methods.createPlan(new BN(id), new BN(1_000_000), new BN(60), new BN(3), due === null ? null : new BN(due), caller)
    .accounts({ owner: wallet.publicKey, plan: address, mint: MINT, recipient, vault, tokenProgram: TOKEN_PROGRAM_ID }).instruction();
  const ata = createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, recipient, recipientOwner, MINT);
  const sig = await makeTransaction([ata, ix]);
  planRequest += 1;
  planAddress = address; vaultAddress = vault; recipientAddress = recipient; livePlan = undefined; planReadOnly = address.toBase58() === DEMO_PLAN; updateButtons();
  setTransactionResult("create-result", "Plan created ·", sig);
  text("created-plan-address", address.toBase58()); $("created-plan").removeAttribute("hidden");
  await refreshPlan();
}));

$("fund-vault").addEventListener("click", () => withBusy($("fund-vault") as HTMLButtonElement, "fund-result", async () => {
  if (planLoading) throw new Error("Wait for plan inspection to finish.");
  if (!wallet?.publicKey || !vaultAddress) throw new Error("Create or inspect a plan first.");
  if (planReadOnly) throw new Error("The published demo plan is read-only.");
  const source = getAssociatedTokenAddressSync(MINT, wallet.publicKey);
  const sig = await makeTransaction([createTransferCheckedInstruction(source, MINT, vaultAddress, wallet.publicKey, 3_000_000n, 6)]);
  setTransactionResult("fund-result", "USDC sent to vault ·", sig); await refreshBalances();
}));

async function execute() {
  if (planLoading) throw new Error("Wait for plan inspection to finish.");
  if (planReadOnly) throw new Error("The published demo plan is read-only.");
  if (!wallet?.publicKey || !planAddress || !livePlan) throw new Error("Load a live plan before submitting.");
  const ix = await getProgram().methods.executeTransfer().accounts({ authorizedCaller: wallet.publicKey, plan: planAddress, mint: MINT, vault: vaultAddress!, recipient: livePlan.recipient, tokenProgram: TOKEN_PROGRAM_ID }).instruction();
  const sig = await makeTransaction([ix]); return sig;
}
$("execute").addEventListener("click", () => withBusy($("execute") as HTMLButtonElement, "execute-result", async () => {
  const sig = await execute(); setTransactionResult("execute-result", "Transfer confirmed ·", sig); await refreshPlan();
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
  if (canExecute(livePlan.nextDueAt.toString(), Date.now() / 1000)) throw new Error("This plan is already due. Create another plan with a future due time to test REQ-21.");
  try { await execute(); setResult("early-result", "Unexpected success: verify the deployed program and plan.", "error"); }
  catch (error) {
    if (!expectedRejection(error, "TransferNotDue")) throw error;
    setResult("early-result", `Rejected as expected · REQ-21 · ${displayError(error)}`, "ok"); await refreshPlan();
  }
}));

async function inspectPlan(value: string, resultId = "inspect-result") {
  if (busy || planLoading) return;
  planLoading = true;
  const request = ++planRequest;
  clearPlan();
  try {
    const address = new PublicKey(value.trim());
    const plan = await (getProgram().account as any).paymentPlan.fetch(address);
    if (request !== planRequest) return;
    commitPlan(plan, address); await refreshBalances(request);
    if (request !== planRequest) return;
    setResult(resultId, "Live plan state loaded from devnet.", "ok"); updateButtons();
    $("live-plan").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (request !== planRequest) return;
    clearPlan();
    setResult(resultId, `Live read failed · ${displayError(error)}`, "error");
  } finally {
    if (request === planRequest) {
      planLoading = false;
      updateButtons();
    }
  }
}
$("inspect").addEventListener("click", () => inspectPlan(($("inspect-address") as HTMLInputElement).value));
$("inspect-demo-plan").addEventListener("click", () => inspectPlan(DEMO_PLAN, "demo-plan-result"));
$("copy-demo-wallet").addEventListener("click", () => copyAddress(DEMO_WALLET, "wallet-copy-result"));

if (window.solana?.isPhantom && window.solana.publicKey) wallet = window.solana;
text("proposal-status", proposalStatus);
updateWalletUi();
text("rpc-state", wallet ? "Public Solana devnet RPC · live reads" : "Public Solana devnet RPC · read-only until wallet connects");
