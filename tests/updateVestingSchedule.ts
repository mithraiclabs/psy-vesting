import * as anchor from "@project-serum/anchor";
import { MintInfo, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { createVestingContract, initNewTokenMint, Vest } from "./utils";

// TODO: clean up the copy pasta

describe("psy-vesting updateVestingSchedule", () => {
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.PsyVesting as anchor.Program;
  const provider = program.provider;
  const payer = anchor.web3.Keypair.generate();

  let tokenKeypair: Keypair, token: Token, signerTokenAccount: PublicKey, tokenMintInfo: MintInfo;
  let tokenVaultKey: PublicKey, vestingContractKeypair: Keypair;
  const item1 = {
    amount: new anchor.BN(1),
    unlockDate: new anchor.BN(new Date().getTime() / 1000 + 400), // 400 sec from now
    claimed: false,
  }
  const item2 = {
    amount: new anchor.BN(2),
    unlockDate: new anchor.BN(new Date().getTime() / 1000 + 4000), // 4,000 sec from now
    claimed: false,
  }
  let vestingSchedule: Vest[] = [item1, item2]
  before(async () => {
    // Send lamports to payer wallet
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        payer.publicKey,
        100 * LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
    // create new token mint
   ({ mintAccount: tokenKeypair} = await initNewTokenMint(provider.connection, payer.publicKey, payer));
   token = new Token(provider.connection, tokenKeypair.publicKey, TOKEN_PROGRAM_ID, payer);
   tokenMintInfo = await token.getMintInfo();
   // create a token account for the signer
   signerTokenAccount = await token.createAssociatedTokenAccount(provider.wallet.publicKey);
   const amount = new anchor.BN(10_000_000).mul(new anchor.BN(10).pow(new anchor.BN(tokenMintInfo.decimals)));
   // mint 10,000,000 of tokens to the 
   await token.mintTo(signerTokenAccount, payer.publicKey, [], amount.toNumber());
   // create vesting schedule with update authority
   ({tokenVaultKey, vestingContractKeypair} = await createVestingContract(program, signerTokenAccount, payer.publicKey, token.publicKey, vestingSchedule, payer.publicKey));
  })
  describe("appropriate use of update", () => {
    it("should update the vesting schedule", async () => {
      const newItem1 = {
        amount: new anchor.BN(1),
        unlockDate: new anchor.BN(new Date().getTime() / 1000 + 400), // 400 sec from now
        claimed: false,
      }

      // make request to update the vesting schedule
      try {
        await program.rpc.updateVestingSchedule([item2, newItem1], {
          accounts: {
            authority: payer.publicKey,
            vestingContract: vestingContractKeypair.publicKey
          },
          signers: [payer]
        })
      } catch(err) {
        console.log((err as Error).toString());
        throw err;
      }

      const vestingContract = await program.account.vestingContract.fetch(vestingContractKeypair.publicKey);
      // TODO: test that the vesting schedule properly updated
      expect(JSON.stringify(vestingContract.schedule)).to.eql(JSON.stringify([newItem1, item2]));
    })
  })

  // TODO: test error is thrown when amount is changed


  // TODO: test case when the update authority does not sign
  // TODO: test bad case when trying to change unlockDate that has already passed
  // TODO: test case when trying to change Vest where claimed is true

})