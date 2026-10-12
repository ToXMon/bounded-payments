import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { createAssociatedTokenAccountInstruction, createTransferCheckedInstruction, getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const USDC = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const OTHER_MINT = new PublicKey("So11111111111111111111111111111111111111112");

describe("bounded-payments: Stage 1", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program: any = anchor.workspace.BoundedPayments;
  const owner = (provider.wallet as anchor.Wallet).payer;
  const caller = anchor.web3.Keypair.generate();
  const recipientOwner = anchor.web3.Keypair.generate();
  let recipient: PublicKey;
  let nextId = Date.now();

  const planAddress = (id: number) => PublicKey.findProgramAddressSync(
    [Buffer.from("plan"), owner.publicKey.toBuffer(), new anchor.BN(id).toArrayLike(Buffer, "le", 8)],
    program.programId,
  )[0];

  async function rejects(promise: Promise<unknown>) {
    try { await promise; } catch { return; }
    throw new Error("expected transaction to fail");
  }

  async function waitForTokenAccount(address: PublicKey) {
    for (let attempt = 0; ; attempt++) {
      try { return await getAccount(provider.connection, address); }
      catch (error) {
        if (attempt === 9) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async function fetchPlan(id: number) {
    for (let attempt = 0; ; attempt++) {
      try { return await program.account.paymentPlan.fetch(planAddress(id), "confirmed"); }
      catch (error) {
        if (attempt === 9) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async function create(overrides: Record<string, unknown> = {}, id = nextId++) {
    return program.methods.createPlan(
      new anchor.BN(id), new anchor.BN(10), new anchor.BN(60), new anchor.BN(3), null, caller.publicKey,
    ).accounts({
      owner: owner.publicKey,
      plan: planAddress(id),
      mint: USDC,
      recipient,
      vault: getAssociatedTokenAddressSync(USDC, planAddress(id), true),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      ...overrides,
    }).rpc();
  }

  before(async () => {
    recipient = getAssociatedTokenAddressSync(USDC, recipientOwner.publicKey);
    const ix = createAssociatedTokenAccountInstruction(
      owner.publicKey, recipient, recipientOwner.publicKey, USDC,
    );
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));
    await waitForTokenAccount(recipient);
  });

  it("REQ-01..12 and REQ-25..27: creates a plan and, when funded, executes a transfer", async function () {
    const id = nextId++;
    await create({}, id);
    const plan = await fetchPlan(id);
    expect(plan.owner.equals(owner.publicKey)).to.equal(true);
    expect(plan.planId.toNumber()).to.equal(id);
    expect(plan.recipient.equals(recipient)).to.equal(true);
    expect(plan.amount.toNumber()).to.equal(10);
    expect(plan.interval.toNumber()).to.equal(60);
    expect(plan.totalLimit.toNumber()).to.equal(30);
    expect(plan.paidTotal.toNumber()).to.equal(0);
    expect(plan.authorizedCaller.equals(caller.publicKey)).to.equal(true);
    expect(plan.bump).to.equal(PublicKey.findProgramAddressSync(
      [Buffer.from("plan"), owner.publicKey.toBuffer(), new anchor.BN(id).toArrayLike(Buffer, "le", 8)], program.programId,
    )[1]);
    expect(plan.expiry.toNumber()).to.equal(plan.nextDueAt.toNumber() + 180);
    const vaultAddress = getAssociatedTokenAddressSync(USDC, planAddress(id), true);
    const vault = await getAccount(provider.connection, vaultAddress);
    expect(vault.owner.equals(planAddress(id))).to.equal(true);
    const source = getAssociatedTokenAddressSync(USDC, owner.publicKey);
    let sourceBefore;
    try { sourceBefore = await getAccount(provider.connection, source); }
    catch { this.skip(); return; } // Devnet has no test USDC in the configured payer wallet.
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(
      createTransferCheckedInstruction(source, USDC, vaultAddress, owner.publicKey, 10n, 6, [], TOKEN_PROGRAM_ID),
    ));
    const recipientBefore = await getAccount(provider.connection, recipient);
    await program.methods.executeTransfer().accounts({ authorizedCaller: caller.publicKey, plan: planAddress(id), mint: USDC,
      vault: vaultAddress, recipient, tokenProgram: TOKEN_PROGRAM_ID }).signers([caller]).rpc();
    const recipientAfter = await getAccount(provider.connection, recipient);
    const vaultAfter = await getAccount(provider.connection, vaultAddress);
    const paid = await fetchPlan(id);
    expect(recipientAfter.amount - recipientBefore.amount).to.equal(10n); // REQ-25
    expect(sourceBefore.amount - (await getAccount(provider.connection, source)).amount).to.equal(10n); // plain SPL funding
    expect(vaultAfter.amount).to.equal(0n);
    expect(paid.paidTotal.toNumber()).to.equal(10); // REQ-26
    expect(paid.nextDueAt.gt(plan.nextDueAt)).to.equal(true); // REQ-27
  });

  it("REQ-03 and REQ-17: rejects a non-USDC mint and a non-USDC recipient", async () => {
    const otherOwner = anchor.web3.Keypair.generate();
    const otherRecipient = getAssociatedTokenAddressSync(OTHER_MINT, otherOwner.publicKey);
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(owner.publicKey, otherRecipient, otherOwner.publicKey, OTHER_MINT),
    ));
    const args = (id: number) => [new anchor.BN(id), new anchor.BN(10), new anchor.BN(60), new anchor.BN(3), null, caller.publicKey] as const;
    const wrongMintId = nextId++;
    await rejects(program.methods.createPlan(...args(wrongMintId)).accounts({ owner: owner.publicKey, plan: planAddress(wrongMintId),
      mint: OTHER_MINT, recipient: otherRecipient, vault: getAssociatedTokenAddressSync(OTHER_MINT, planAddress(wrongMintId), true),
      tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      systemProgram: SystemProgram.programId }).rpc()); // REQ-03
    const wrongRecipientId = nextId++;
    await rejects(program.methods.createPlan(...args(wrongRecipientId)).accounts({ owner: owner.publicKey, plan: planAddress(wrongRecipientId),
      mint: USDC, recipient: otherRecipient, vault: getAssociatedTokenAddressSync(USDC, planAddress(wrongRecipientId), true),
      tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      systemProgram: SystemProgram.programId }).rpc()); // REQ-17
  });

  it("REQ-13..19: rejects invalid creation inputs", async () => {
    const fail = async (args: [anchor.BN, anchor.BN, anchor.BN, anchor.BN, anchor.BN | null, PublicKey]) => {
      const id = nextId++;
      await rejects(program.methods.createPlan(...args).accounts({
        owner: owner.publicKey,
        plan: planAddress(id),
        mint: USDC,
        recipient,
        vault: getAssociatedTokenAddressSync(USDC, planAddress(id), true),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc());
    };
    const standard = [new anchor.BN(0), new anchor.BN(10), new anchor.BN(60), new anchor.BN(3), null, caller.publicKey] as const;
    await fail([standard[0], new anchor.BN(0), standard[2], standard[3], null, caller.publicKey]); // REQ-13
    await fail([standard[0], standard[1], new anchor.BN(0), standard[3], null, caller.publicKey]); // REQ-14
    await fail([standard[0], standard[1], new anchor.BN(-1), standard[3], null, caller.publicKey]); // REQ-14
    await fail([standard[0], standard[1], standard[2], new anchor.BN(0), null, caller.publicKey]); // REQ-15
    await fail([standard[0], standard[1], standard[2], standard[3], new anchor.BN(1), caller.publicKey]); // REQ-16
    await fail([standard[0], standard[1], standard[2], standard[3], null, PublicKey.default]); // REQ-18
    await fail([standard[0], new anchor.BN("18446744073709551615"), standard[2], standard[3], null, caller.publicKey]); // REQ-19
  });

  it("REQ-30: rejects duplicate plan seeds without changing the original", async () => {
    const id = nextId++;
    await create({}, id);
    const before = await fetchPlan(id);
    await rejects(create({}, id));
    const after = await fetchPlan(id);
    expect(after.amount.eq(before.amount)).to.equal(true);
  });

  it("REQ-22: rejects a transfer after expiry", async () => {
    const id = nextId++;
    await program.methods.createPlan(new anchor.BN(id), new anchor.BN(10), new anchor.BN(1), new anchor.BN(1), null, caller.publicKey)
      .accounts({ owner: owner.publicKey, plan: planAddress(id), mint: USDC, recipient,
        vault: getAssociatedTokenAddressSync(USDC, planAddress(id), true), tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID, systemProgram: SystemProgram.programId }).rpc();
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await rejects(program.methods.executeTransfer().accounts({ authorizedCaller: caller.publicKey, plan: planAddress(id), mint: USDC,
      vault: getAssociatedTokenAddressSync(USDC, planAddress(id), true), recipient, tokenProgram: TOKEN_PROGRAM_ID }).signers([caller]).rpc());
  });

  it("REQ-20, REQ-21, REQ-25, REQ-29: rejects unauthorized, early, and unfunded transfers atomically", async () => {
    const id = nextId++;
    const future = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);
    await program.methods.createPlan(new anchor.BN(id), new anchor.BN(10), new anchor.BN(60), new anchor.BN(3), future, caller.publicKey)
      .accounts({ owner: owner.publicKey, plan: planAddress(id), mint: USDC, recipient,
        vault: getAssociatedTokenAddressSync(USDC, planAddress(id), true), tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID, systemProgram: SystemProgram.programId }).rpc();
    const before = await fetchPlan(id);
    const accounts = { plan: planAddress(id), mint: USDC,
      vault: getAssociatedTokenAddressSync(USDC, planAddress(id), true), recipient, tokenProgram: TOKEN_PROGRAM_ID };
    await rejects(program.methods.executeTransfer().accounts({ ...accounts, authorizedCaller: owner.publicKey }).rpc()); // REQ-20
    await rejects(program.methods.executeTransfer().accounts({ ...accounts, authorizedCaller: caller.publicKey }).signers([caller]).rpc()); // REQ-21
    const alternateOwner = anchor.web3.Keypair.generate();
    const alternateRecipient = getAssociatedTokenAddressSync(USDC, alternateOwner.publicKey);
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(owner.publicKey, alternateRecipient, alternateOwner.publicKey, USDC),
    ));
    // REQ-24 is enforced by the stored-recipient address constraint.
    await rejects(program.methods.executeTransfer().accounts({ ...accounts, recipient: alternateRecipient, authorizedCaller: caller.publicKey }).signers([caller]).rpc());
    const after = await fetchPlan(id);
    expect(after.paidTotal.eq(before.paidTotal)).to.equal(true);
    expect(after.nextDueAt.eq(before.nextDueAt)).to.equal(true);

    const unfundedId = nextId++;
    await create({}, unfundedId);
    const unfundedBefore = await fetchPlan(unfundedId);
    const recipientBefore = await getAccount(provider.connection, recipient);
    const vault = getAssociatedTokenAddressSync(USDC, planAddress(unfundedId), true);
    await rejects(program.methods.executeTransfer().accounts({ authorizedCaller: caller.publicKey, plan: planAddress(unfundedId),
      mint: USDC, vault, recipient, tokenProgram: TOKEN_PROGRAM_ID }).signers([caller]).rpc()); // REQ-25
    const unfundedAfter = await fetchPlan(unfundedId);
    expect(unfundedAfter.paidTotal.eq(unfundedBefore.paidTotal)).to.equal(true); // REQ-29
    expect(unfundedAfter.nextDueAt.eq(unfundedBefore.nextDueAt)).to.equal(true);
    expect((await getAccount(provider.connection, recipient)).amount).to.equal(recipientBefore.amount);
  });
});
