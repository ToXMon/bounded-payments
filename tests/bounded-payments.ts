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

  async function rejects(promise: Promise<unknown>, expectedCode?: string) {
    try {
      await promise;
    } catch (error: any) {
      if (expectedCode !== undefined) expect(error?.error?.errorCode?.code).to.equal(expectedCode);
      return;
    }
    throw new Error("expected transaction to fail");
  }

  async function waitForTokenAccount(address: PublicKey, expectedAmount?: bigint) {
    for (let attempt = 0; ; attempt++) {
      try {
        const account = await getAccount(provider.connection, address);
        if (expectedAmount === undefined || account.amount === expectedAmount) return account;
      } catch (error) {
        if (attempt === 9) throw error;
      }
      if (attempt === 9) throw new Error(`token account ${address.toBase58()} did not reach expected balance`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
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

  async function waitForPaidTotal(id: number, expected: number) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const plan = await fetchPlan(id);
      if (plan.paidTotal.toNumber() === expected) return plan;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`plan ${id} did not reach paid_total ${expected}`);
  }

  async function chainTime() {
    const slot = await provider.connection.getSlot("confirmed");
    const time = await provider.connection.getBlockTime(slot);
    if (time === null) throw new Error("latest confirmed block has no timestamp");
    return time;
  }

  async function waitForDue(id: number) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const plan = await fetchPlan(id);
      if (await chainTime() >= plan.nextDueAt.toNumber()) return plan;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`plan ${id} did not become due`);
  }

  async function waitForExpiry(id: number) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const plan = await fetchPlan(id);
      if (await chainTime() > plan.expiry.toNumber()) return plan;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`plan ${id} did not expire`);
  }

  async function fundVault(vault: PublicKey, amount: bigint) {
    const source = getAssociatedTokenAddressSync(USDC, owner.publicKey);
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(
      createTransferCheckedInstruction(source, USDC, vault, owner.publicKey, amount, 6, [], TOKEN_PROGRAM_ID),
    ));
    await waitForTokenAccount(vault, amount);
  }

  async function create(id = nextId++) {
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

  it("REQ-01..12 and REQ-25..27: funds the vault and executes a transfer", async () => {
    const id = nextId++;
    const createSignature = await create(id);
    console.log(`create_plan signature: ${createSignature}`);
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
    const sourceBefore = await getAccount(provider.connection, source);
    const fundingSignature = await provider.sendAndConfirm(new anchor.web3.Transaction().add(
      createTransferCheckedInstruction(source, USDC, vaultAddress, owner.publicKey, 10n, 6, [], TOKEN_PROGRAM_ID),
    ));
    console.log(`vault funding signature: ${fundingSignature}`);
    const fundedVault = await waitForTokenAccount(vaultAddress, 10n);
    expect(fundedVault.amount).to.equal(10n);
    const recipientBefore = await getAccount(provider.connection, recipient);
    const transferSignature = await program.methods.executeTransfer().accounts({ authorizedCaller: caller.publicKey, plan: planAddress(id), mint: USDC,
      vault: vaultAddress, recipient, tokenProgram: TOKEN_PROGRAM_ID }).signers([caller]).rpc();
    console.log(`execute_transfer signature: ${transferSignature}`);
    const recipientAfter = await waitForTokenAccount(recipient, recipientBefore.amount + 10n);
    const vaultAfter = await waitForTokenAccount(vaultAddress, 0n);
    const sourceAfter = await waitForTokenAccount(source, sourceBefore.amount - 10n);
    const paid = await waitForPaidTotal(id, 10);
    expect(recipientAfter.amount - recipientBefore.amount).to.equal(10n); // REQ-25
    expect(sourceBefore.amount - sourceAfter.amount).to.equal(10n); // plain SPL funding
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
    await create(id);
    const before = await fetchPlan(id);
    await rejects(create(id));
    const after = await fetchPlan(id);
    expect(after.amount.eq(before.amount)).to.equal(true);
  });

  it("REQ-23 and REQ-29: rejects a due transfer after the final allowed payment", async function () {
    this.timeout(60000);
    const id = nextId++;
    await program.methods.createPlan(new anchor.BN(id), new anchor.BN(10), new anchor.BN(20), new anchor.BN(2), null, caller.publicKey)
      .accounts({ owner: owner.publicKey, plan: planAddress(id), mint: USDC, recipient,
        vault: getAssociatedTokenAddressSync(USDC, planAddress(id), true), tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID, systemProgram: SystemProgram.programId }).rpc();
    const vault = getAssociatedTokenAddressSync(USDC, planAddress(id), true);
    const source = getAssociatedTokenAddressSync(USDC, owner.publicKey);
    const sourceBefore = await getAccount(provider.connection, source);
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(
      createTransferCheckedInstruction(source, USDC, vault, owner.publicKey, 30n, 6, [], TOKEN_PROGRAM_ID),
    ));
    await waitForTokenAccount(vault, 30n);
    const execute = () => program.methods.executeTransfer().accounts({ authorizedCaller: caller.publicKey,
      plan: planAddress(id), mint: USDC, vault, recipient, tokenProgram: TOKEN_PROGRAM_ID }).signers([caller]).rpc();
    await waitForDue(id);
    await execute();
    await waitForDue(id);
    await execute();

    const planBefore = await fetchPlan(id);
    const vaultBefore = await getAccount(provider.connection, vault);
    const recipientBefore = await getAccount(provider.connection, recipient);
    await waitForDue(id);
    await rejects(execute());
    const planAfter = await fetchPlan(id);
    expect(planAfter.paidTotal.eq(planBefore.paidTotal)).to.equal(true);
    expect(planAfter.nextDueAt.eq(planBefore.nextDueAt)).to.equal(true);
    expect((await getAccount(provider.connection, vault)).amount).to.equal(vaultBefore.amount);
    expect((await getAccount(provider.connection, recipient)).amount).to.equal(recipientBefore.amount);
    expect((await getAccount(provider.connection, source)).amount).to.equal(sourceBefore.amount - 30n);
  });

  it("REQ-22: rejects a transfer after expiry", async () => {
    const id = nextId++;
    await program.methods.createPlan(new anchor.BN(id), new anchor.BN(10), new anchor.BN(1), new anchor.BN(1), null, caller.publicKey)
      .accounts({ owner: owner.publicKey, plan: planAddress(id), mint: USDC, recipient,
        vault: getAssociatedTokenAddressSync(USDC, planAddress(id), true), tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID, systemProgram: SystemProgram.programId }).rpc();
    const vault = getAssociatedTokenAddressSync(USDC, planAddress(id), true);
    await fundVault(vault, 10n);
    const before = await fetchPlan(id);
    const recipientBefore = await getAccount(provider.connection, recipient);
    await waitForExpiry(id);
    await rejects(program.methods.executeTransfer().accounts({ authorizedCaller: caller.publicKey, plan: planAddress(id), mint: USDC,
      vault, recipient, tokenProgram: TOKEN_PROGRAM_ID }).signers([caller]).rpc(), "PlanExpired");
    const after = await fetchPlan(id);
    expect(after.paidTotal.eq(before.paidTotal)).to.equal(true);
    expect(after.nextDueAt.eq(before.nextDueAt)).to.equal(true);
    expect((await getAccount(provider.connection, recipient)).amount).to.equal(recipientBefore.amount);
  });

  it("REQ-20, REQ-21, REQ-24, REQ-25, REQ-29: rejects invalid transfers atomically", async () => {
    const dueId = nextId++;
    await program.methods.createPlan(new anchor.BN(dueId), new anchor.BN(10), new anchor.BN(60), new anchor.BN(3), null, caller.publicKey)
      .accounts({ owner: owner.publicKey, plan: planAddress(dueId), mint: USDC, recipient,
        vault: getAssociatedTokenAddressSync(USDC, planAddress(dueId), true), tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID, systemProgram: SystemProgram.programId }).rpc();
    const dueVault = getAssociatedTokenAddressSync(USDC, planAddress(dueId), true);
    await fundVault(dueVault, 10n);
    const dueAccounts = { plan: planAddress(dueId), mint: USDC, vault: dueVault, recipient, tokenProgram: TOKEN_PROGRAM_ID };
    const dueBefore = await fetchPlan(dueId);
    const dueVaultBefore = await getAccount(provider.connection, dueVault);
    const dueRecipientBefore = await getAccount(provider.connection, recipient);
    await rejects(program.methods.executeTransfer().accounts({ ...dueAccounts, authorizedCaller: owner.publicKey }).rpc(), "Unauthorized");

    const alternateOwner = anchor.web3.Keypair.generate();
    const alternateRecipient = getAssociatedTokenAddressSync(USDC, alternateOwner.publicKey);
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(owner.publicKey, alternateRecipient, alternateOwner.publicKey, USDC),
    ));
    await rejects(program.methods.executeTransfer().accounts({ ...dueAccounts, recipient: alternateRecipient, authorizedCaller: caller.publicKey }).signers([caller]).rpc(), "ConstraintAddress");
    const dueAfter = await fetchPlan(dueId);
    expect(dueAfter.paidTotal.eq(dueBefore.paidTotal)).to.equal(true);
    expect(dueAfter.nextDueAt.eq(dueBefore.nextDueAt)).to.equal(true);
    expect((await getAccount(provider.connection, dueVault)).amount).to.equal(dueVaultBefore.amount);
    expect((await getAccount(provider.connection, recipient)).amount).to.equal(dueRecipientBefore.amount);

    const earlyId = nextId++;
    const future = new anchor.BN(await chainTime() + 3600);
    await program.methods.createPlan(new anchor.BN(earlyId), new anchor.BN(10), new anchor.BN(60), new anchor.BN(3), future, caller.publicKey)
      .accounts({ owner: owner.publicKey, plan: planAddress(earlyId), mint: USDC, recipient,
        vault: getAssociatedTokenAddressSync(USDC, planAddress(earlyId), true), tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID, systemProgram: SystemProgram.programId }).rpc();
    const earlyVault = getAssociatedTokenAddressSync(USDC, planAddress(earlyId), true);
    await fundVault(earlyVault, 10n);
    const earlyBefore = await fetchPlan(earlyId);
    await rejects(program.methods.executeTransfer().accounts({ authorizedCaller: caller.publicKey, plan: planAddress(earlyId),
      mint: USDC, vault: earlyVault, recipient, tokenProgram: TOKEN_PROGRAM_ID }).signers([caller]).rpc(), "TransferNotDue");
    const earlyAfter = await fetchPlan(earlyId);
    expect(earlyAfter.paidTotal.eq(earlyBefore.paidTotal)).to.equal(true);
    expect(earlyAfter.nextDueAt.eq(earlyBefore.nextDueAt)).to.equal(true);
    expect((await getAccount(provider.connection, earlyVault)).amount).to.equal(10n);

    const unfundedId = nextId++;
    await create(unfundedId);
    const unfundedBefore = await fetchPlan(unfundedId);
    const recipientBefore = await getAccount(provider.connection, recipient);
    const unfundedVault = getAssociatedTokenAddressSync(USDC, planAddress(unfundedId), true);
    await rejects(program.methods.executeTransfer().accounts({ authorizedCaller: caller.publicKey, plan: planAddress(unfundedId),
      mint: USDC, vault: unfundedVault, recipient, tokenProgram: TOKEN_PROGRAM_ID }).signers([caller]).rpc()); // REQ-25
    const unfundedAfter = await fetchPlan(unfundedId);
    expect(unfundedAfter.paidTotal.eq(unfundedBefore.paidTotal)).to.equal(true); // REQ-29
    expect(unfundedAfter.nextDueAt.eq(unfundedBefore.nextDueAt)).to.equal(true);
    expect((await getAccount(provider.connection, recipient)).amount).to.equal(recipientBefore.amount);
  });
});
