import { createVestingContract, initNewTokenMint } from "./utils";
import * as anchor from "@project-serum/anchor"
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { assert, expect } from "chai";

const textEncoder = new TextEncoder();

describe('psy-vesting createVestingContract', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.PsyVesting as anchor.Program;
  const provider = program.provider;
  const payer = anchor.web3.Keypair.generate();

  let tokenKeypair: Keypair,
  token: Token;
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
  })

  describe("Given a valid SPL Token Mint and vesting information", () => {
    const vestingSchedule = [{
      amount: new anchor.BN(10),
      unlockDate: new anchor.BN(new Date().getTime() / 1000 + 3), // 3 sec from now
      claimed: false,
    }]
    let tokenVaultKey: PublicKey, vestingContractKeypair: Keypair;
    it("should create a valid VestingContract", async () => {
      // Test that the mint exists
      const mintInfo = await token.getMintInfo();
      assert.equal(mintInfo.supply.toString(), new u64(0).toString());

      // make rpc call to create the VestingContract
      try {
        ({tokenVaultKey, vestingContractKeypair} = await createVestingContract(program, payer.publicKey, token.publicKey, vestingSchedule, payer.publicKey));
      } catch(err) {
        console.error((err as Error).toString());
        throw err;
      }

      // test that the a new TokenAccount for the mint is created
      const tokenVaultInfo = await token.getAccountInfo(tokenVaultKey);
      assert.ok(tokenVaultInfo.amount.eqn(0))

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

    })

    describe("no update authority", () => {
      it("should not store the update authority", async () => {
        const destination = anchor.web3.Keypair.generate();
        try {
          ({tokenVaultKey, vestingContractKeypair} = await createVestingContract(program, destination.publicKey, token.publicKey, vestingSchedule));
        } catch(err) {
          console.error((err as Error).toString());
          throw err;
        }
        const vestingContract = await program.account.vestingContract.fetch(vestingContractKeypair.publicKey);
        assert.ok(vestingContract.updateAuthority.equals(SystemProgram.programId))
      })
    })
  })
});
