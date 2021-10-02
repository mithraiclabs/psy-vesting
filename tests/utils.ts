import {
  AccountMeta,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import { MintLayout, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN, Program } from "@project-serum/anchor";

const textEncoder = new TextEncoder();

export type Vest = {
  amount: BN;
  unlockDate: BN;
};

export const createVestingContract = async (
  program: Program,
  tokenSrc: PublicKey,
  destinationKey: PublicKey,
  tokenMint: PublicKey,
  vestingSchedule: Vest[],
  updateAuthority: PublicKey | undefined = undefined
) => {
  const vestingContractKeypair = new Keypair();

  const [tokenVaultKey, tokenVaultBump] = await PublicKey.findProgramAddress(
    [
      destinationKey.toBuffer(),
      tokenMint.toBuffer(),
      textEncoder.encode("vault"),
    ],
    program.programId
  );

  const [vaultAuthorityKey, vaultAuthorityBump] =
    await PublicKey.findProgramAddress(
      [tokenVaultKey.toBuffer(), textEncoder.encode("vaultAuth")],
      program.programId
    );

  let remainingAccounts: AccountMeta[] = [];
  if (updateAuthority) {
    remainingAccounts.push({
      pubkey: updateAuthority,
      isSigner: false,
      isWritable: false,
    });
  }
  await program.rpc.createVestingContract(vestingSchedule, {
    accounts: {
      authority: program.provider.wallet.publicKey,
      tokenSrc,
      destinationAddress: destinationKey,
      tokenMint,
      tokenVault: tokenVaultKey,
      vaultAuthority: vaultAuthorityKey,
      vestingContract: vestingContractKeypair.publicKey,

      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    },
    remainingAccounts,
    signers: [vestingContractKeypair],
  });
  return {
    tokenVaultKey,
    vestingContractKeypair,
    vaultAuthorityKey,
    vaultAuthorityBump,
  };
};

export const initNewTokenMint = async (
  connection: Connection,
  /** The owner for the new mint account */
  owner: PublicKey,
  wallet: Keypair
) => {
  const mintAccount = new Keypair();
  const transaction = new Transaction();
  // Create the Option Mint Account with rent exemption
  // Allocate memory for the account
  const mintRentBalance = await connection.getMinimumBalanceForRentExemption(
    MintLayout.span
  );

  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mintAccount.publicKey,
      lamports: mintRentBalance,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  transaction.add(
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      mintAccount.publicKey,
      8,
      owner,
      null
    )
  );
  await sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet, mintAccount],
    {
      commitment: "confirmed",
    }
  );
  return {
    mintAccount,
  };
};
