use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod psy_vesting {
    use super::*;
    pub fn create_vesting_contract(ctx: Context<CreateVestingContract>, vesting_schedule: Vec<Vest>) -> ProgramResult {
        let vesting_contract = &mut ctx.accounts.vesting_contract;
        vesting_contract.destination_address = *ctx.accounts.destination_address.key;
        vesting_contract.mint_address = ctx.accounts.token_mint.key();
        vesting_contract.token_vault = ctx.accounts.token_vault.key();
        // sort the vesting schedule keys
        let mut schedule = vesting_schedule.clone();
        schedule.sort_by_key(|x| x.unlock_date);
        vesting_contract.schedule = schedule;

        // Check if there is an update authority in the remaining_accounts.
        let account_info_iter = &mut ctx.remaining_accounts.iter();
        if account_info_iter.len() > 0 {
            let update_authority = next_account_info(account_info_iter)?;
            vesting_contract.update_authority = update_authority.key();
        }

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(vesting_schedule: Vec<Vest>)]
pub struct CreateVestingContract<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// The destination for the tokens when they are vested
    pub destination_address: AccountInfo<'info>,
    pub token_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        seeds = [&destination_address.key().to_bytes()[..], &token_mint.key().to_bytes()[..], b"vault"],
        bump,
        payer = authority,    
        token::mint = token_mint,
        token::authority = vault_authority,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,
    pub vault_authority: AccountInfo<'info>,
    #[account(
        init,
        payer = authority,
        // The 8 is to account for anchors hash prefix
        space = 8 + std::mem::size_of::<Pubkey>() * 4 as usize + std::mem::size_of::<Vest>() * vesting_schedule.len() as usize
    )]
    pub vesting_contract: Account<'info, VestingContract>,

    pub token_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
}

#[account]
#[derive(Default)]
pub struct VestingContract {
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

// The size of the Vest is 8 + 8 + 1 = 17 bytes
#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Vest {
	/// The amount that unlocks at the date
	pub amount: u64,
	/// The current unlock date
	pub unlock_date: i64,
	/// Flag that the vesting has been claimed
	pub claimed: bool,
}
