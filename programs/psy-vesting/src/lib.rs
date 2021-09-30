use anchor_lang::prelude::*;

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
    signer: Signer<'info>,
}
