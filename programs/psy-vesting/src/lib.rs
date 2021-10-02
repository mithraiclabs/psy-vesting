pub mod errors;

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, TokenAccount, Transfer, CloseAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod psy_vesting {
    use super::*;
    pub fn create_vesting_contract(ctx: Context<CreateVestingContract>, vesting_schedule: Vec<Vest>) -> ProgramResult {
        let vesting_contract = &mut ctx.accounts.vesting_contract;
        vesting_contract.issuer_address = *ctx.accounts.authority.key;
        vesting_contract.destination_address = *ctx.accounts.destination_address.key;
        vesting_contract.mint_address = ctx.accounts.token_mint.key();
        vesting_contract.token_vault = ctx.accounts.token_vault.key();
        // sort the vesting schedule keys
        let mut schedule = vesting_schedule.clone();
        schedule.sort_by_key(|x| x.unlock_date);

        // Check if there is an update authority in the remaining_accounts.
        let account_info_iter = &mut ctx.remaining_accounts.iter();
        if account_info_iter.len() > 0 {
            let update_authority = next_account_info(account_info_iter)?;
            vesting_contract.update_authority = update_authority.key();
        }

        // Sum the total amount from the vesting schedule
        let mut total: u64 = 0;
        for vest in schedule.clone() {
            total += vest.amount;
        }

        // Transfer the total amount from the issuer account
        let cpi_accounts = Transfer {
            from: ctx.accounts.token_src.to_account_info(),
            to: ctx.accounts.token_vault.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new(cpi_token_program, cpi_accounts);
        token::transfer(cpi_ctx, total)?;


        vesting_contract.schedule = schedule;
        Ok(())
    }

    #[access_control(UpdateVestingSchedule::accounts(&ctx))]
    pub fn update_vesting_schedule(ctx: Context<UpdateVestingSchedule>, vesting_schedule: Vec<Vest>) -> ProgramResult {
        // sort the vesting scheule 
        let mut schedule = vesting_schedule.clone();
        schedule.sort_by_key(|x| x.unlock_date);

        let vesting_contract = &mut ctx.accounts.vesting_contract;

        let clock = Clock::get()?;

        for (i, vest) in schedule.iter().enumerate() {
            // check that the amounts have not changed
            if vesting_contract.schedule[i].amount != vest.amount {
                return Err(errors::ErrorCode::CannotChangeAmount.into())
            }
            msg!("Clock {:?} {:?}", clock.unix_timestamp, vest.unlock_date);
            // check that the date has not passed
            if clock.unix_timestamp > vest.unlock_date {
                return Err(errors::ErrorCode::NewDateMustBeInTheFuture.into())
            }
            // check that the date is ahead of the current unlock date
            if vesting_contract.schedule[i].unlock_date > vest.unlock_date {
                return Err(errors::ErrorCode::NewDateMustBeLaterThanCurrent.into())
            }
        }
        // update the vesting_contract
        vesting_contract.schedule = schedule;

        Ok(())
    }

    #[access_control(TransferVested::accounts(&ctx))]
    pub fn transfer_vested(ctx: Context<TransferVested>, vault_authority_bump: u8) -> ProgramResult {
        // sum the amount of tokens that have vested
        let vesting_contract = &mut ctx.accounts.vesting_contract;
        let mut total_vested: u64 = 0;
        let clock = Clock::get()?;
        let mut schedule = vesting_contract.schedule.clone();
        for (i, vest) in vesting_contract.schedule.iter().enumerate() {
            if !vest.claimed && clock.unix_timestamp > vest.unlock_date {
                total_vested += vest.amount;
                // while summing, update the claimed to true
                schedule[i].claimed = true;
            }
        }

        vesting_contract.schedule = schedule;

        // Transfer the total amount from the token vault to the destination address
        let cpi_accounts = Transfer {
            from: ctx.accounts.token_vault.to_account_info(),
            to: ctx.accounts.destination_address.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let token_vault_key = ctx.accounts.token_vault.key();
        let seeds = [
            token_vault_key.as_ref(),
            b"vaultAuth",
            &[vault_authority_bump]
        ];
        let signers = &[&seeds[..]];
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program, cpi_accounts, signers);
        token::transfer(cpi_ctx, total_vested)?;
        Ok(())
    }

    pub fn close_vesting_contract(ctx: Context<CloseVestingContract>, vault_authority_bump: u8) -> ProgramResult {
        // Check that the token vault is the same as the VestingContract
        if ctx.accounts.vesting_contract.token_vault != ctx.accounts.token_vault.key() {
            return Err(errors::ErrorCode::TokenVaultIsWrong.into())
        }
        // Check that the token vault is empty
        if ctx.accounts.token_vault.amount > 0 {
            return Err(errors::ErrorCode::TokenVaultNotEmpty.into())
        }
        // Close the token vault
        let cpi_accounts = CloseAccount {
            account: ctx.accounts.token_vault.to_account_info(),
            destination: ctx.accounts.issuer.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let token_vault_key = ctx.accounts.token_vault.key();
        let seeds = [
            token_vault_key.as_ref(),
            b"vaultAuth",
            &[vault_authority_bump]
        ];
        let signers = &[&seeds[..]];
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program, cpi_accounts, signers);
        token::close_account(cpi_ctx)?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(vesting_schedule: Vec<Vest>)]
pub struct CreateVestingContract<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub token_src: AccountInfo<'info>,
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
        space = 8 + std::mem::size_of::<Pubkey>() * 5 as usize + std::mem::size_of::<Vest>() * vesting_schedule.len() as usize
    )]
    pub vesting_contract: Account<'info, VestingContract>,

    pub token_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateVestingSchedule<'info> {
    pub authority: Signer<'info>,
    /// The VestingContract account to update
    #[account(mut)]
    pub vesting_contract: Account<'info, VestingContract>,
}

impl<'info> UpdateVestingSchedule<'info> {
    pub fn accounts(ctx: &Context<UpdateVestingSchedule>) -> ProgramResult {
        // Validate the update_authority on the VestingContract is the signer
        if *ctx.accounts.authority.key != ctx.accounts.vesting_contract.update_authority {
            return Err(errors::ErrorCode::SignerMustBeUpdateAuthority.into())
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct TransferVested<'info> {
    #[account(mut)]
    pub destination_address: Account<'info, TokenAccount>,
    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vesting_contract: Account<'info, VestingContract>,
    pub vault_authority: AccountInfo<'info>,
    pub token_mint: Account<'info, Mint>,

    pub token_program: AccountInfo<'info>
}
impl<'info> TransferVested<'info> {
    pub fn accounts(ctx: &Context<TransferVested>) -> ProgramResult {
        // Validate the destination address is the same as the VestingContract
        if ctx.accounts.vesting_contract.destination_address != ctx.accounts.destination_address.key() {
            return Err(errors::ErrorCode::DestinationMustMatchVestingContract.into())
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CloseVestingContract<'info> {
    #[account(mut)]
    pub issuer: AccountInfo<'info>,
    #[account(mut, close = issuer)]
    pub vesting_contract: Account<'info, VestingContract>,
    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,
    pub vault_authority: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}


#[account]
#[derive(Default)]
pub struct VestingContract {
    /// The SOL address that paid for the rent and should get it back
    pub issuer_address: Pubkey,
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
