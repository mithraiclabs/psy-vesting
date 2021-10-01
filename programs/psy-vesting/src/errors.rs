use anchor_lang::prelude::*;

#[error]
pub enum ErrorCode {
  #[msg("Signer must be the update authority")]
  SignerMustBeUpdateAuthority,
}