import * as anchor from "@project-serum/anchor";
import { MintInfo, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert, expect } from "chai";
import { createVestingContract, initNewTokenMint, Vest } from "./utils";

// TODO: clean up the copy pasta

describe("psy-vesting updateVestingSchedule", () => {
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
    unlockDate: new anchor.BN(new Date().getTime() / 1000 + 400), // 400 sec from now
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
  const newItem1 = {
    amount: new anchor.BN(1),
    unlockDate: new anchor.BN(new Date().getTime() / 1000 + 500), // 400 sec from now
  };
  describe("appropriate use of update", () => {
    it("should update the vesting schedule", async () => {
      // make request to update the vesting schedule
      try {
        await program.rpc.updateVestingSchedule([item2, newItem1], {
          accounts: {
            authority: payer.publicKey,
            vestingContract: vestingContractKeypair.publicKey,
          },
          signers: [payer],
        });
      } catch (err) {
        console.log((err as Error).toString());
        throw err;
      }

      const vestingContract = await program.account.vestingContract.fetch(
        vestingContractKeypair.publicKey
      );
      // test that the vesting schedule properly updated
      expect(JSON.stringify(vestingContract.schedule)).to.eql(
        JSON.stringify([newItem1, item2])
      );
    });
  });

  describe("signer is not the update authority", () => {
    // test case when the update authority does not sign
    it("should throw error", async () => {
      // make request to update the vesting schedule
      try {
        await program.rpc.updateVestingSchedule([item2, newItem1], {
          accounts: {
            authority: provider.wallet.publicKey,
            vestingContract: vestingContractKeypair.publicKey,
          },
        });
        assert.ok(false);
      } catch (err) {
        const errMsg = "Signer must be the update authority";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });

  describe("when amount was changed", () => {
    // test error is thrown when amount is changed
    const amountChangedItem = {
      amount: new anchor.BN(10),
      unlockDate: new anchor.BN(new Date().getTime() / 1000 + 400), // 400 sec from now
    };
    it("should throw error", async () => {
      // make request to update the vesting schedule
      try {
        await program.rpc.updateVestingSchedule([item2, amountChangedItem], {
          accounts: {
            authority: payer.publicKey,
            vestingContract: vestingContractKeypair.publicKey,
          },
          signers: [payer],
        });
        assert.ok(false);
      } catch (err) {
        const errMsg = "Cannot change the amount";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });
  describe("unlock date has already passed", () => {
    // test bad case when trying to change unlockDate that has already passed
    it("should error", async () => {
      const dateHasPassed = {
        amount: new anchor.BN(1),
        unlockDate: new anchor.BN(new Date().getTime() / 1000 - 400), // 400 sec from now
      };
      try {
        await program.rpc.updateVestingSchedule([item2, dateHasPassed], {
          accounts: {
            authority: payer.publicKey,
            vestingContract: vestingContractKeypair.publicKey,
          },
          signers: [payer],
        });
        assert.ok(false);
      } catch (err) {
        const errMsg = "New date must be in the future";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });
  describe("unlock date is prior to current unlock", () => {
    // test error case when trying to change the unlockDate that is prior to the existing unlock date
    it("should error", async () => {
      const dateHasPassed = {
        amount: new anchor.BN(1),
        unlockDate: item1.unlockDate.subn(100),
      };
      try {
        await program.rpc.updateVestingSchedule([item2, dateHasPassed], {
          accounts: {
            authority: payer.publicKey,
            vestingContract: vestingContractKeypair.publicKey,
          },
          signers: [payer],
        });
        assert.ok(false);
      } catch (err) {
        const errMsg = "New date must be later than the previous date";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });

  // ~~test case when trying to change Vest where claimed is true~~
  //  This actually cannot happen because the unlock date would have to have been in the past
  //  and the instruction checks that the date of the vest has not passed
});
