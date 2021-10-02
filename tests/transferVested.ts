import * as anchor from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";
import { MintInfo, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { createVestingContract, initNewTokenMint, Vest } from "./utils";

describe("psy-vesting transferVested", () => {
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.PsyVesting as anchor.Program;
  const provider = program.provider;
  const payer = anchor.web3.Keypair.generate();

  let tokenKeypair: Keypair,
    token: Token,
    signerTokenAccount: PublicKey,
    tokenMintInfo: MintInfo;
  let tokenVaultKey: PublicKey,
    vestingContractKeypair: Keypair,
    vaultAuthorityKey: PublicKey,
    vaultAuthorityBump: number,
    destinationAddress: PublicKey;
  const item1 = {
    amount: new anchor.BN(1),
    unlockDate: new anchor.BN(new Date().getTime() / 1000 - 400), // 400 sec in the past
  };
  const item2 = {
    amount: new anchor.BN(2),
    unlockDate: new anchor.BN(new Date().getTime() / 1000 + 4000), // 4,000 sec from now
  };
  let vestingSchedule: Vest[] = [item1, item2];
  beforeEach(async () => {
    // Send lamports to payer wallet
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        payer.publicKey,
        100 * LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
    // create new token mint
    ({ mintAccount: tokenKeypair } = await initNewTokenMint(
      provider.connection,
      payer.publicKey,
      payer
    ));
    token = new Token(
      provider.connection,
      tokenKeypair.publicKey,
      TOKEN_PROGRAM_ID,
      payer
    );
    tokenMintInfo = await token.getMintInfo();
    // create a token account for the signer
    signerTokenAccount = await token.createAssociatedTokenAccount(
      provider.wallet.publicKey
    );
    const amount = new anchor.BN(10_000_000).mul(
      new anchor.BN(10).pow(new anchor.BN(tokenMintInfo.decimals))
    );
    // mint 10,000,000 of tokens to the
    await token.mintTo(
      signerTokenAccount,
      payer.publicKey,
      [],
      amount.toNumber()
    );
    destinationAddress = await token.createAssociatedTokenAccount(
      payer.publicKey
    );
    // create vesting schedule with update authority
    ({
      tokenVaultKey,
      vestingContractKeypair,
      vaultAuthorityKey,
      vaultAuthorityBump,
    } = await createVestingContract(
      program,
      signerTokenAccount,
      destinationAddress,
      token.publicKey,
      vestingSchedule,
      payer.publicKey
    ));
  });

  describe("A vesting period has passed", () => {
    it("should transfer total tokens to the destination address", async () => {
      const destBefore = await token.getAccountInfo(destinationAddress);
      // make rpc call to transferVested
      try {
        await program.rpc.transferVested(vaultAuthorityBump, {
          accounts: {
            destinationAddress,
            tokenVault: tokenVaultKey,
            vestingContract: vestingContractKeypair.publicKey,
            vaultAuthority: vaultAuthorityKey,
            tokenMint: token.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        });
      } catch (err) {
        console.error(err);
        throw err;
      }

      // test that the destination address received the correct amount of tokens
      const destAfter = await token.getAccountInfo(destinationAddress);
      const destDiff = destAfter.amount.sub(destBefore.amount);
      assert.ok(destDiff.eq(item1.amount));
      // test that claimed is changed to true
      const vestingContract = await program.account.vestingContract.fetch(
        vestingContractKeypair.publicKey
      );
      assert.ok(vestingContract.schedule[0].amount.eq(new BN(0)));
      assert.notOk(vestingContract.schedule[1].amount.eq(new BN(0)));
    });
  });

  describe("incorrect destination address", () => {
    // Test that incorrect desination address returns an errorz
    it("should error", async () => {
      try {
        await program.rpc.transferVested(vaultAuthorityBump, {
          accounts: {
            destinationAddress: signerTokenAccount,
            tokenVault: tokenVaultKey,
            vestingContract: vestingContractKeypair.publicKey,
            vaultAuthority: vaultAuthorityKey,
            tokenMint: token.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        });
        assert.ok(false);
      } catch (err) {
        const errMsg = "Destination address must match VestingContract";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });

  describe("a past vesting item has already been claimed", () => {
    beforeEach(async () => {
      await program.rpc.transferVested(vaultAuthorityBump, {
        accounts: {
          destinationAddress,
          tokenVault: tokenVaultKey,
          vestingContract: vestingContractKeypair.publicKey,
          vaultAuthority: vaultAuthorityKey,
          tokenMint: token.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
      });
    });
    // Test that claimed tokens can't get claimed again
    it("should exclude counting them in the total transfer", async () => {
      const destBefore = await token.getAccountInfo(destinationAddress);
      const vestingContract = await program.account.vestingContract.fetch(
        vestingContractKeypair.publicKey
      );
      const schedule: Vest[] = vestingContract.schedule;
      const totalToClaim = schedule.reduce(
        (acc, curr) =>
          curr.unlockDate > new anchor.BN(new Date().getTime() / 1000)
            ? acc
            : curr.amount.add(acc),
        new BN(0)
      );
      try {
        await program.rpc.transferVested(vaultAuthorityBump, {
          accounts: {
            destinationAddress,
            tokenVault: tokenVaultKey,
            vestingContract: vestingContractKeypair.publicKey,
            vaultAuthority: vaultAuthorityKey,
            tokenMint: token.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        });
      } catch (err) {
        console.error(err);
        throw err;
      }
      // test that the destination address received the correct amount of tokens
      const destAfter = await token.getAccountInfo(destinationAddress);
      const destDiff = destAfter.amount.sub(destBefore.amount);
      assert.ok(destDiff.eq(totalToClaim));
    });
  });

  // TODO: Nice to have - test that the incorrect token mint returns an error
  //    (this will already error by SPL Token program Transfer instruction fail)

  // TODO: Nice to have - test and error if there are no vested tokens
});
