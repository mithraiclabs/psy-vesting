use anchor_lang::prelude::*;

#[error]
pub enum ErrorCode {
  #[msg("Signer must be the update authority")]
  SignerMustBeUpdateAuthority,
  #[msg("Cannot change the amount")]
  CannotChangeAmount,
  #[msg("New date must be in the future")]
  NewDateMustBeInTheFuture,
  #[msg("New date must be later than the previous date")]
  NewDateMustBeLaterThanCurrent,
  #[msg("Destination address must match VestingContract")]
  DestinationMustMatchVestingContract,
  #[msg("The token vault must be empty")]
  TokenVaultNotEmpty,
  #[msg("The token vault must match the VestingContract")]
  TokenVaultIsWrong,
  #[msg("Destination's mint address doesn't match the token")]
  DestinationMintMismatch,
}