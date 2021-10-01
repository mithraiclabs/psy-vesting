import * as anchor from "@project-serum/anchor"
import { MintInfo, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { createVestingContract, initNewTokenMint, Vest } from "./utils";


describe("psy-vesting transferVested", () => {
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.PsyVesting as anchor.Program;
  const provider = program.provider;
  const payer = anchor.web3.Keypair.generate();

  let tokenKeypair: Keypair, token: Token, signerTokenAccount: PublicKey, tokenMintInfo: MintInfo;
  let tokenVaultKey: PublicKey, vestingContractKeypair: Keypair, vaultAuthorityKey: PublicKey, vaultAuthorityBump: number, destinationAddress: PublicKey;
  const item1 = {
    amount: new anchor.BN(1),
    unlockDate: new anchor.BN(new Date().getTime() / 1000 - 400), // 400 sec in the past
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
   destinationAddress = await token.createAssociatedTokenAccount(payer.publicKey);
   // create vesting schedule with update authority
   ({tokenVaultKey, vestingContractKeypair, vaultAuthorityKey, vaultAuthorityBump} = await createVestingContract(
     program,
     signerTokenAccount,
     destinationAddress,
     token.publicKey,
     vestingSchedule,
     payer.publicKey
    ));
  })

  describe("A vesting period has passed", () => {
    it("should transfer total tokens to the destination address", async () => {
      const destBefore = await token.getAccountInfo(destinationAddress)
      // make rpc call to transferVested
      try {
        await program.rpc.transferVested(vaultAuthorityBump, {
          accounts: {
            destinationAddress,
            tokenVault: tokenVaultKey,
            vestingContract: vestingContractKeypair.publicKey,
            vaultAuthority: vaultAuthorityKey,
            tokenMint: token.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID
          }
        })
      } catch(err) {
        console.error(err);
        throw err;
      }

      // test that the destination address received the correct amount of tokens
      const destAfter = await token.getAccountInfo(destinationAddress)
      const destDiff = destAfter.amount.sub(destBefore.amount)
      assert.ok(destDiff.eq(item1.amount))
      // test that claimed is changed to true
      const vestingContract = await program.account.vestingContract.fetch(vestingContractKeypair.publicKey);
      assert.ok(vestingContract.schedule[0].claimed)
      assert.ok(!vestingContract.schedule[1].claimed)
    })
  })

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
            tokenProgram: TOKEN_PROGRAM_ID
          }
        })
        assert.ok(false);
      } catch(err) {
        const errMsg = "Destination address must match VestingContract";
        assert.equal((err as Error).toString(), errMsg);
      }
    })
  })

  // TODO: Nice to have - test that the incorrect token mint returns an error

  // TODO: Might be optional - test and error if there are no vested tokens
});