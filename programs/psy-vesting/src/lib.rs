use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, TokenAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod psy_vesting {
    use super::*;
    pub fn create_vesting_contract(_ctx: Context<CreateVestingContract>) -> ProgramResult {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateVestingContract<'info> {
    pub signer: Signer<'info>,
    /// The destination for the tokens when they are vested
    pub destination_address: AccountInfo<'info>,
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        seeds = [&destination_address.key().to_bytes()[..], &token_mint.key().to_bytes()[..], b"vault"],
        bump,
        payer = signer,    
        token::mint = token_mint,
        token::authority = vault_authority,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,
    pub vault_authority: AccountInfo<'info>,

    pub token_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
}

struct VestingContract {
	/// The destination for the tokens when they are vested
	pub destination_address: Pubkey,
	/// Optional authority that can extend the vesting date
	pub update_authority: Pubkey,
	/// The mint address of the SPL Token being vested
	pub mint_address: Pubkey,
	/// PDA for TokenAccount that holds the total vesting SPLs
	pub token_vault: Pubkey, 
	/// The vesting schedule
	pub schedule: Vec<Vest>
}

struct Vest {
	/// The amount that unlocks at the date
	pub amount: u64,
	/// The current unlock date
	pub unlock_date: i64,
	/// Flag that the vesting has been claimed
	pub claimed: bool,
}
