We want a custom vesting contract that will allow users to be an _update_authority_ on the vesting so they can extend the vesting and lockup.

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
}
```

## Instruction Set

### CreateVestingSchedule

Create a new TokenAccount for the _mint_address_, store this TokenAccount as the _token_vault_. Validate that the Mint on the _destination_address_ is the _mint_address_. Order the VestDate array. Sum the total amount from the array of VestDates and transfer that amount from the signer's account to the _token_vault_.

### UpdateVestingSchedule

Validate that the _update_authority_ is the signer. Order the new VestDate array by unlock. Loop through the new array of vest dates, for each item check that the _unlock_date_ is greater than or equal to the current _unlock_date_ AND the current _unlock_date_ has not passed AND check that the amounts are the same. Return error if those checks fail. If they pass, store the new VestDate array on the VestingContract.

### TransferVestedTokens

Loop through the VestDates, for those that the _unlock_date_ has passed, sum the amount. After the loop transfer the _total_amount_ to the _destination_address_. Amounts will be set to 0.

### CloseVestingContract

Validate that _token_vault_ is empty. Validate that all VestDate's have been claimed. Pull the lamports from the TokenAccount and the VestingContract account and flag for close.

## Additional Items For Discussion

- Should there be a _revoke_authority_ that has the ability to cancel a VestingContract?
