import * as anchor from "@project-serum/anchor";
import { MintInfo, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert, expect } from "chai";
import { createVestingContract, initNewTokenMint, Vest } from "./utils";

describe("psy-vesting closeVestingContract", () => {
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
    unlockDate: new anchor.BN(new Date().getTime() / 1000 - 200), // 200 sec in the past
    claimed: false,
  }
  let vestingSchedule: Vest[] = [item1, item2]
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

  describe("Vesting schedule has been completed and claimed", () => {
    beforeEach( async () => {
      // Claim all the vested tokens
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
    })
    it("should transfer the lamports to the desired address", async () => {
      const issuerAcctInfoBefore = await provider.connection.getAccountInfo(program.provider.wallet.publicKey);
      // Get the issuer
      const vestingContract = await program.account.vestingContract.fetch(vestingContractKeypair.publicKey);
      // make call to close VestingContract
      try {
        await program.rpc.closeVestingContract(vaultAuthorityBump, {
          accounts: {
            issuer: vestingContract.issuerAddress,
            vestingContract: vestingContractKeypair.publicKey,
            tokenVault: vestingContract.tokenVault,
            vaultAuthority: vaultAuthorityKey,
            tokenProgram: TOKEN_PROGRAM_ID
          }
        })
      } catch(err) {
        console.error(err);
        throw err;
      }
      // Validate the vesting contract account has 0 lamports
      const contractAcctAfter = await provider.connection.getAccountInfo(vestingContractKeypair.publicKey)
      assert.ok(!contractAcctAfter)

      // Validate the issuer got the lamports
      const issuerAcctInfo = await provider.connection.getAccountInfo(program.provider.wallet.publicKey);
      if (!issuerAcctInfo || !issuerAcctInfoBefore) {
        throw new Error("Cannot load issuer account info");
      }
      expect(issuerAcctInfo.lamports).to.greaterThan(issuerAcctInfoBefore.lamports)

      // test that the token vault gets closed
      const tokenVault = await provider.connection.getAccountInfo(vestingContract.tokenVault);
      assert.ok(!tokenVault);
    })
  })

  // Test if the token vault still has tokens in it
  describe("The vault still has tokens in it", () => {
    it("should error", async () => {
      const vestingContract = await program.account.vestingContract.fetch(vestingContractKeypair.publicKey);
      // make call to close VestingContract
      try {
        await program.rpc.closeVestingContract(vaultAuthorityBump, {
          accounts: {
            issuer: vestingContract.issuerAddress,
            vestingContract: vestingContractKeypair.publicKey,
            tokenVault: vestingContract.tokenVault,
            vaultAuthority: vaultAuthorityKey,
            tokenProgram: TOKEN_PROGRAM_ID
          }
        })
        assert.ok(false);
      } catch(err) {
        const errMsg = "The token vault must be empty";
        assert.equal((err as Error).toString(), errMsg);
      }
    })
  })

  // Test error with spoofed token vault
  describe("Token vault account is spoofed", () => {
    let fakeTokenVault: PublicKey;
    before( async () => {
      fakeTokenVault = await token.createAccount(payer.publicKey);
    })
    it("should error", async () => {
      const vestingContract = await program.account.vestingContract.fetch(vestingContractKeypair.publicKey);
      // make call to close VestingContract
      try {
        await program.rpc.closeVestingContract(vaultAuthorityBump, {
          accounts: {
            issuer: vestingContract.issuerAddress,
            vestingContract: vestingContractKeypair.publicKey,
            tokenVault: fakeTokenVault,
            vaultAuthority: vaultAuthorityKey,
            tokenProgram: TOKEN_PROGRAM_ID
          }
        })
        assert.ok(false);
      } catch(err) {
        const errMsg = "The token vault must match the VestingContract";
        assert.equal((err as Error).toString(), errMsg);
      }
    })
  })

  // TODO: Test if all the vesting has been claimed (This is redundant..not gonna do it lol)
})