import { initNewTokenMint } from "./utils";
import * as anchor from "@project-serum/anchor"
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { assert } from "chai";

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
    it("should create a valid VestingContract", async () => {
      // Test that the mint exists
      const mintInfo = await token.getMintInfo();
      assert.equal(mintInfo.supply.toString(), new u64(0).toString());

      // make rpc call to create the VestingContract
      try {
        await program.rpc.createVestingContract({
          accounts: {
            signer: provider.wallet.publicKey
          }
        })
      } catch(err) {
        console.error((err as Error).toString());
        throw err;
      }

      // TODO: test that the a new TokenAccount for the mint is created


      // TODO: test that the VestingContract account was created

      // TODO: test that the new token account is stored on the VestingContract

      // TODO: Test that the Vest array was stored properly

    })
  })
});
