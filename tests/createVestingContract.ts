import { createVestingContract, initNewTokenMint } from "./utils";
import * as anchor from "@project-serum/anchor"
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { MintInfo, Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { assert, expect } from "chai";

const textEncoder = new TextEncoder();

describe('psy-vesting createVestingContract', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.PsyVesting as anchor.Program;
  const provider = program.provider;
  const payer = anchor.web3.Keypair.generate();

  let tokenKeypair: Keypair, token: Token, signerTokenAccount: PublicKey, tokenMintInfo: MintInfo;
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
  })

  describe("Given a valid SPL Token Mint and vesting information", () => {
    let vestingSchedule = [{
      amount: new anchor.BN(10),
      unlockDate: new anchor.BN(new Date().getTime() / 1000 + 3), // 3 sec from now
      claimed: false,
    }]
    let tokenVaultKey: PublicKey, vestingContractKeypair: Keypair;
    it("should create a valid VestingContract", async () => {
      // Test that the mint exists
      const mintInfo = await token.getMintInfo();
      assert.equal(mintInfo.supply.toString(), new anchor.BN(10_000_000).mul(new anchor.BN(10).pow(new anchor.BN(tokenMintInfo.decimals))).toString());

      // make rpc call to create the VestingContract
      try {
        ({tokenVaultKey, vestingContractKeypair} = await createVestingContract(program, signerTokenAccount, payer.publicKey, token.publicKey, vestingSchedule, payer.publicKey));
      } catch(err) {
        console.error((err as Error).toString());
        throw err;
      }

      // test that the VestingContract account was created
      const vestingContract = await program.account.vestingContract.fetch(vestingContractKeypair.publicKey);
      assert.ok(true)

      assert.ok(vestingContract.destinationAddress.equals(payer.publicKey))
      // test that the new token account is stored on the VestingContract
      assert.ok(vestingContract.mintAddress.equals(token.publicKey))
      assert.ok(vestingContract.tokenVault.equals(tokenVaultKey))
      assert.ok(vestingContract.updateAuthority.equals(payer.publicKey))

      // Test that the Vest array was stored properly
      expect(JSON.stringify(vestingContract.schedule)).to.eql(JSON.stringify(vestingSchedule));

      // Test that total amount transfered from the issuer_account to the token account
      let total = vestingSchedule.reduce((acc, curr) => curr.amount.add(acc), new anchor.BN(0));
      // test that the a new TokenAccount for the mint is created
      const tokenVaultInfo = await token.getAccountInfo(tokenVaultKey);
      assert.ok(tokenVaultInfo.amount.eq(total))
    })

    describe("no update authority", () => {
      it("should not store the update authority", async () => {
        const destination = anchor.web3.Keypair.generate();
        try {
          ({tokenVaultKey, vestingContractKeypair} = await createVestingContract(program, signerTokenAccount, destination.publicKey, token.publicKey, vestingSchedule));
        } catch(err) {
          console.error((err as Error).toString());
          throw err;
        }
        const vestingContract = await program.account.vestingContract.fetch(vestingContractKeypair.publicKey);
        assert.ok(vestingContract.updateAuthority.equals(SystemProgram.programId))
      })
    })
    describe("Vesting schedule is out of order", () => {
      it("should order the schedule", async () => {
        const destination = anchor.web3.Keypair.generate();
        const item1 = {
          amount: new anchor.BN(1),
          unlockDate: new anchor.BN(new Date().getTime() / 1000 + 3), // 3 sec from now
          claimed: false,
        }
        const item2 = {
          amount: new anchor.BN(2),
          unlockDate: new anchor.BN(new Date().getTime() / 1000 + 300), // 3 sec from now
          claimed: false,
        }
        try {
          ({tokenVaultKey, vestingContractKeypair} = await createVestingContract(program, signerTokenAccount, destination.publicKey, token.publicKey, [item2, item1]));
        } catch(err) {
          console.error((err as Error).toString());
          throw err;
        }
        const vestingContract = await program.account.vestingContract.fetch(vestingContractKeypair.publicKey);
        // Test that the items are ordered properly
        expect(JSON.stringify(vestingContract.schedule)).to.eql(JSON.stringify([item1, item2]));
      })
    })
  })

  // TODO: Test that a destination address with a different mint errors
});
