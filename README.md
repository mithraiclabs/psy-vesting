We want a custom vesting contract that will allow users to be an *update_authority* on the vesting so they can extend the vesting and lockup. 

```rust
struct VestingContract {
	/// The destination for the tokens when they are vested
	pub *destination_address*: Pubkey,
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
```

## Instruction Set

### CreateVestingSchedule

Create a new TokenAccount for the *mint_address*, store this TokenAccount as the *token_vault*. Validate that the Mint on the *destination_address* is the *mint_address*. Order the VestDate array. Sum the total amount from the array of VestDates and transfer that amount from the signer's account to the *token_vault*. 

### UpdateVestingSchedule

Validate that the *update_authority* is the signer. Order the new VestDate array by unlock. Loop through the new array of vest dates, for each item check that the *unlock_date* is greater than or equal to the current *unlock_date* AND the current *unlock_date* has not passed AND check that the amounts are the same. Return error if those checks fail. If they pass, store the new VestDate array on the VestingContract. 

### TransferVestedTokens

Loop through the VestDates, for those that the *unlock_date* has passed and *claimed* is false, sum the amount. After the loop transfer the *total_amount* to the *destination_address*

### CloseVestingContract

Validate that *token_vault* is empty. Validate that all VestDate's have been claimed. Pull the lamports from the TokenAccount and the VestingContract account and flag for close. 

## Additional Items For Discussion

- Should there be a *revoke_authority* that has the ability to cancel a VestingContract?