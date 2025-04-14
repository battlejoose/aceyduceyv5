use anchor_lang::{
    prelude::*,
    solana_program::{
        pubkey::Pubkey,
        keccak,
    },
    system_program,
};

use anchor_spl::{
    associated_token::{AssociatedToken},
    token_interface::{Mint, TokenAccount, TokenInterface, transfer_checked, TransferChecked, SyncNative, sync_native},
};

use raydium_cpmm_cpi::{
    cpi,
    program::RaydiumCpmm,
    states::{AmmConfig, ObservationState, PoolState},
};


pub const RAYDIUM_CP_SWAP_PROGRAM_ID_DEVNET: Pubkey = pubkey!("CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW");

declare_id!("87FB3XA9xBPzQq1zoEHSdECUmDpRG32x7EC87YrLLPU2");

#[program]
pub mod acey {
    use super::*;

    pub const ENTRY_PRICE: u64 = 100_000_000; //0.1 sol
    pub const ANTE_PRICE: u64 = 10_000_000; //0.01 sol

    pub const WAIT_TIME: i64 = 120; //2 minutes
    
    pub const CLUBMOON_MINT: Pubkey = pubkey!("5gVSqhk41VA8U6U4Pvux6MSxFWqgptm3w58X9UTGpump");
    // devnet: pub const CLUBMOON_MINT: Pubkey = pubkey!("D2BYx2UoshNpAfgBEXEEyfUKxLSxkLMAb6zeZhZYgoos");

    pub const SOLANA_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");

    pub const ADMIN_PUBLIC_KEY: Pubkey = pubkey!("6gkkRU5t8WfXHWNuc6zQ7FoQxybcigLvzJKLz7Z1tGg");
    pub const FEE_PERCENTAGE: u8 = 100; // divide by 100 so 1%

    pub const MINIMUM_POT: u64 = 100_000_000; //0.1 sol

    pub fn init_game(
        ctx: Context<InitializeGame>,
    ) -> Result<()> {

        let game_account = &mut ctx.accounts.game_account;
        game_account.entry_price = ENTRY_PRICE;
        game_account.ante_price = ANTE_PRICE;
        game_account.pot_amount = 0;
        game_account.next_skip_time = -1;

        game_account.card_1 = 0;
        game_account.card_2 = 0;
        game_account.card_3 = 0;

        game_account.current_bet = 0;

        game_account.player_no = 1;
        game_account.current_player_id = 0;
        game_account.currently_playing = 0;

        game_account.buy_back = 0;
        game_account.round = 0;


        Ok(())
    }

    pub fn player_buy_back(
        ctx: Context<PlayerAnte>
    ) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ADMIN_PUBLIC_KEY,
            CustomError::InvalidAdmin,
        );

        let game_account = &mut ctx.accounts.game_account;
        let player_account = &mut ctx.accounts.player_account;
        let current_time = Clock::get()?.unix_timestamp as i64;
        

        require!(
            game_account.buy_back > 0,
            CustomError::Unauthorized,
        );

        require!(
            player_account.round != game_account.round,
            CustomError::Unauthorized,
        );

        let fees = game_account.entry_price * FEE_PERCENTAGE as u64 / 10000;
        let fee_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.signer.to_account_info().clone(),
                to: ctx.accounts.admin.to_account_info().clone(),
            },
        );
        system_program::transfer(fee_context, fees)?; //sol transferred to treasury

        let amount_after_fees = game_account.entry_price - fees;

        game_account.pot_amount += amount_after_fees;

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.signer.to_account_info().clone(),
                to: ctx.accounts.treasury_solana_account.to_account_info().clone(),
            },
        );
        system_program::transfer(cpi_context, amount_after_fees)?; // sol transferred to treasury

        sync_native(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            SyncNative {
                account: ctx.accounts.treasury_solana_account.to_account_info(),
            },
        ))?;

        game_account.buy_back -= 1;

        if game_account.buy_back == 0 {
            game_account.next_skip_time = current_time + WAIT_TIME;
        }

        player_account.round = game_account.round;

        Ok(())
    }

    
    
    pub fn init_treasuries(
        ctx: Context<InitializeTreasuries>,
    ) -> Result<()> {

        require!(
            ctx.accounts.solana_mint.key() == SOLANA_MINT,
            CustomError::InvalidMint,
        );


        Ok(())
    }

    pub fn player_join(
        ctx: Context<PlayerJoin>,
        user_name: String,
    ) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ADMIN_PUBLIC_KEY,
            CustomError::InvalidAdmin,
        );

        let game_account = &mut ctx.accounts.game_account;
        let new_id: u64 = game_account.player_no + 1;

        let current_time = Clock::get()?.unix_timestamp as i64;

        game_account.player_no = new_id;

        if game_account.currently_playing == 0 {
            game_account.current_player_id = new_id;
            game_account.next_skip_time = current_time + WAIT_TIME;
        }

        game_account.currently_playing += 1;

        let fees = game_account.entry_price * FEE_PERCENTAGE as u64 / 10000;
        let fee_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.signer.to_account_info().clone(),
                to: ctx.accounts.admin.to_account_info().clone(),
            },
        );
        system_program::transfer(fee_context, fees)?; //sol transferred to treasury

        let amount_after_fees = game_account.entry_price - fees;

        game_account.pot_amount += amount_after_fees;


        let player_account = &mut ctx.accounts.player_account;
        player_account.user = ctx.accounts.signer.key();
        player_account.game_account = game_account.key();
        player_account.id = new_id;
        player_account.user_name = user_name;
        player_account.round = game_account.round;

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.signer.to_account_info().clone(),
                to: ctx.accounts.treasury_solana_account.to_account_info().clone(),
            },
        );
        system_program::transfer(cpi_context, amount_after_fees)?; //sol transferred to treasury

        sync_native(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            SyncNative {
                account: ctx.accounts.treasury_solana_account.to_account_info(),
            },
        ))?;

        Ok(())
    }

    pub fn player_ante(
        ctx: Context<PlayerAnte>
    ) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ADMIN_PUBLIC_KEY,
            CustomError::InvalidAdmin,
        );

        

        let game_account = &mut ctx.accounts.game_account;
        let player_account = &ctx.accounts.player_account;

        require!(
            game_account.buy_back == 0,
            CustomError::Unauthorized
        );

        require!(
            game_account.current_player_id == player_account.id,
            CustomError::Unauthorized
        );

        require!(
            game_account.card_1 == 0,
            CustomError::Unauthorized
        );

        require!(
            game_account.card_2 == 0,
            CustomError::Unauthorized
        );

        require!(
            game_account.card_3 == 0,
            CustomError::Unauthorized
        );

        let fees = game_account.ante_price * FEE_PERCENTAGE as u64 / 10000;
        let fee_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.signer.to_account_info().clone(),
                to: ctx.accounts.admin.to_account_info().clone(),
            },
        );
        system_program::transfer(fee_context, fees)?; //sol transferred to treasury

        let amount_after_fees = game_account.ante_price - fees;

        game_account.pot_amount += amount_after_fees;

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.signer.to_account_info().clone(),
                to: ctx.accounts.treasury_solana_account.to_account_info().clone(),
            },
        );
        system_program::transfer(cpi_context, amount_after_fees)?; // sol transferred to treasury

        sync_native(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            SyncNative {
                account: ctx.accounts.treasury_solana_account.to_account_info(),
            },
        ))?;

        // Get the current timestamp
        let clock = Clock::get()?;
        let timestamp = clock.unix_timestamp as u64;

        // Hash the timestamp
        let hash = keccak::hash(&timestamp.to_le_bytes());

        // Generate first card between 1 and 52
        let card1 = (hash.0[0] % 52) + 1;
        let mut card2 = (hash.0[1] % 52) + 1;

        // Ensure card1 and card2 are unique (keep regenerating until they are different)
        let mut index = 2;
        while card1 == card2 {
            card2 = (hash.0[index % 32] % 52) + 1;
            index += 1;
        }

        game_account.card_1 = card1;
        game_account.card_2 = card2;

        Ok(())
    }

    pub fn player_bet(
        ctx: Context<PlayerAnte>,
        bet_amount: u64,
    ) -> Result<()> {

        require!(
            ctx.accounts.admin.key() == ADMIN_PUBLIC_KEY,
            CustomError::InvalidAdmin,
        );

        let game_account = &mut ctx.accounts.game_account;
        let player_account = &ctx.accounts.player_account;

        require!(bet_amount <= game_account.pot_amount,
            CustomError::BetBiggerThanPot
        );

        require!(
            game_account.current_player_id == player_account.id,
            CustomError::Unauthorized
        );

        require!(
            game_account.card_1 != 0,
            CustomError::Unauthorized
        );

        require!(
            game_account.card_2 != 0,
            CustomError::Unauthorized
        );

        require!(
            game_account.card_3 == 0,
            CustomError::Unauthorized
        );

        let fees = bet_amount * FEE_PERCENTAGE as u64 / 10000;
        let fee_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.signer.to_account_info().clone(),
                to: ctx.accounts.admin.to_account_info().clone(),
            },
        );
        system_program::transfer(fee_context, fees)?; //sol transferred to treasury

        let amount_after_fees = bet_amount - fees;

        game_account.pot_amount += amount_after_fees;
        game_account.current_bet = amount_after_fees;

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.signer.to_account_info().clone(),
                to: ctx.accounts.treasury_solana_account.to_account_info().clone(),
            },
        );
        system_program::transfer(cpi_context, amount_after_fees)?; //sol transferred to treasury

        sync_native(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            SyncNative {
                account: ctx.accounts.treasury_solana_account.to_account_info(),
            },
        ))?;

        // Get the current timestamp
        let clock = Clock::get()?;
        let timestamp = clock.unix_timestamp as u64;

        // Hash the timestamp
        let hash = keccak::hash(&timestamp.to_le_bytes());

        let mut card3 = (hash.0[0] % 52) + 1;

        
        let mut index = 1;
        while card3 == game_account.card_1 || card3 == game_account.card_2 {
            card3 = (hash.0[index % 32] % 52) + 1;
            index += 1;
        }

        game_account.card_3 = card3;

        Ok(())
    }

    pub fn next_turn(
        ctx: Context<PlayerClaim>,
    ) -> Result<()> {

        require!(
            ctx.accounts.clubmoon_mint.key() == CLUBMOON_MINT,
            CustomError::InvalidMint,
        );
        require!(
            ctx.accounts.solana_mint.key() == SOLANA_MINT,
            CustomError::InvalidMint,
        );

        

        let game_account = &mut ctx.accounts.game_account;
        let player_account = &ctx.accounts.player_account;

        require!(
            game_account.buy_back == 0,
            CustomError::Unauthorized
        );

        require!(
            game_account.current_player_id == player_account.id,
            CustomError::Unauthorized
        );

        require!(
            ctx.remaining_accounts.len() == game_account.currently_playing as usize,
            CustomError::Unauthorized
        );

        if game_account.current_bet != 0 {
            let card1 = ((game_account.card_1 - 1) % 13) + 1;
            let card2 = ((game_account.card_2 - 1) % 13) + 1;
            let card3 = ((game_account.card_3 - 1) % 13) + 1;

            // Ensure we find the lower and higher values correctly
            let low = card1.min(card2);
            let high = card1.max(card2);

            let game_account_key = game_account.key();

            let seeds = &["solana".as_bytes(), game_account_key.as_ref(), &[ctx.bumps.treasury_solana_account]];
            let signer: &[&[&[u8]]] = &[&seeds[..]];

            // Check if card3 is within the inclusive range [low, high]
            if (card3 > low) && (card3 < high) {
                // WIN condition
                let cpi_accounts = cpi::accounts::Swap {
                    payer: ctx.accounts.treasury_solana_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                    amm_config: ctx.accounts.amm_config.to_account_info(),
                    pool_state: ctx.accounts.pool_state.to_account_info(),
                    input_token_account: ctx.accounts.treasury_solana_account.to_account_info(),
                    output_token_account: ctx.accounts.user_clubmoon_account.to_account_info(),
                    input_vault: ctx.accounts.input_vault.to_account_info(),
                    output_vault: ctx.accounts.output_vault.to_account_info(),
                    input_token_program: ctx.accounts.token_program.to_account_info(),
                    output_token_program: ctx.accounts.token_program.to_account_info(),
                    input_token_mint: ctx.accounts.solana_mint.to_account_info(),
                    output_token_mint: ctx.accounts.clubmoon_mint.to_account_info(),
                    observation_state: ctx.accounts.observation_state.to_account_info(),
                };
                let cpi_context = CpiContext::new_with_signer(
                    ctx.accounts.cp_swap_program.to_account_info(), 
                    cpi_accounts,
                    &signer,
                );
                cpi::swap_base_input(cpi_context, game_account.current_bet * 2, 0);

                game_account.pot_amount -= game_account.current_bet * 2;

                if game_account.pot_amount <= MINIMUM_POT {
                    game_account.buy_back = ctx.remaining_accounts.len() as u64;
                    game_account.round += 1;
                }


                msg!("You won! card3 ({}) is between {} and {}", card3, low, high);
            } else {
                // LOSE condition
                msg!("You lost. card3 ({}) is NOT between {} and {}", card3, low, high);
            }
        }

        
        game_account.current_bet = 0;
        game_account.card_1 = 0;
        game_account.card_2 = 0;
        game_account.card_3 = 0;

        let next_player_id = get_next_player_id(
            game_account.current_player_id, 
            game_account.key(), 
            &ctx.remaining_accounts
        )?; 


        game_account.current_player_id = next_player_id;

        let current_time = Clock::get()?.unix_timestamp as i64;
        game_account.next_skip_time = current_time + WAIT_TIME;
        
        Ok(())

    }

    pub fn player_leave(
        ctx: Context<PlayerLeave>
    ) -> Result<()> {
        let game_account = &mut ctx.accounts.game_account;
        let closing_player_account = &ctx.accounts.closing_player_account;

        require!(
            ctx.remaining_accounts.len() == game_account.currently_playing as usize,
            CustomError::Unauthorized
        );

        require!(
            closing_player_account.game_account == game_account.key(),
            CustomError::Unauthorized
        );

        require!(
            closing_player_account.user == ctx.accounts.signer.key(),
            CustomError::Unauthorized
        );

        if game_account.current_player_id == closing_player_account.id {
            game_account.card_1 = 0;
            game_account.card_2 = 0;
            game_account.card_3 = 0;
            game_account.current_bet = 0;

            let next_player_id = get_next_player_id(
                game_account.current_player_id, 
                game_account.key(), 
                &ctx.remaining_accounts
            )?; 
            
            game_account.current_player_id = next_player_id;

            let current_time = Clock::get()?.unix_timestamp as i64;
            game_account.next_skip_time = current_time + WAIT_TIME;
        }
        
        game_account.currently_playing -= 1;

        if closing_player_account.round != game_account.round {
            game_account.buy_back -= 1;
        }

        Ok(())


    }

    pub fn kick_player(
        ctx: Context<PlayerLeave>,
    ) -> Result<()> {

        let game_account = &mut ctx.accounts.game_account;
        let closing_player_account = &ctx.accounts.closing_player_account;

        let current_time = Clock::get()?.unix_timestamp as i64;

        require!(
            game_account.buy_back == 0,
            CustomError::Unauthorized
        );

        require!(
            current_time >= game_account.next_skip_time,
            CustomError::Unauthorized
        );

        require!(
            ctx.remaining_accounts.len() == game_account.currently_playing as usize,
            CustomError::Unauthorized
        );

        require!(
            closing_player_account.game_account == game_account.key(),
            CustomError::Unauthorized
        );

        require!(
            game_account.current_player_id == closing_player_account.id,
            CustomError::Unauthorized
        );

        game_account.card_1 = 0;
        game_account.card_2 = 0;
        game_account.card_3 = 0;
        game_account.current_bet = 0;

        let next_player_id = get_next_player_id(
            game_account.current_player_id, 
            game_account.key(), 
            &ctx.remaining_accounts
        )?; 

        game_account.current_player_id = next_player_id;
        let current_time = Clock::get()?.unix_timestamp as i64;
        game_account.next_skip_time = current_time + WAIT_TIME;
    
        game_account.currently_playing -= 1;

        Ok(())
    }

    pub fn finish_buy_back(
        ctx: Context<PlayerAnte>
    ) -> Result<()> {
        let current_time = Clock::get()?.unix_timestamp as i64;
        let game_account = &mut ctx.accounts.game_account;
        let player_account = &ctx.accounts.player_account;

        require!(
            current_time >= game_account.next_skip_time,
            CustomError::Unauthorized
        );

        require!(
            player_account.round == game_account.round,
            CustomError::Unauthorized
        );

        require!(
            game_account.buy_back > 0,
            CustomError::Unauthorized
        );

        require!(
            ctx.remaining_accounts.len() == game_account.currently_playing as usize,
            CustomError::Unauthorized
        );

        game_account.buy_back = 0;
        game_account.next_skip_time = current_time + WAIT_TIME;


        for account in ctx.remaining_accounts.iter() {
            let data = account.try_borrow_mut_data().map_err(|_| CustomError::Unauthorized)?;
            
            let player_account_instance = PlayerAccount::try_deserialize(&mut &data[..])
                .map_err(|_| CustomError::Unauthorized)?;
        
            // Ensure it's a valid PlayerAccount before closing
            require!(
                player_account_instance.game_account == game_account.key(),
                CustomError::Unauthorized
            );

            if player_account_instance.round == game_account.round {
                continue;
            }

            
            if player_account_instance.id == game_account.current_player_id {
                game_account.current_player_id = player_account.id;
            }

        
            // ✅ Transfer lamports to the signer before closing
            **ctx.accounts.signer.to_account_info().lamports.borrow_mut() += account.lamports();
            **account.lamports.borrow_mut() = 0;
        
            // ✅ Mark the account for closing
            **account.try_borrow_mut_lamports()? = 0; // Clears out the lamports

            game_account.currently_playing -= 1;
        }

        Ok(())
        
    }
}

fn get_next_player_id(
    current_player_id: u64,
    game_account_key: Pubkey,
    remaining_accounts: &[AccountInfo],
) -> Result<u64> {
    let mut next_player_id: Option<u64> = None;
    let mut min_id: Option<u64> = None;

    for account in remaining_accounts.iter() {
        let data = account.try_borrow_data().map_err(|_| CustomError::Unauthorized)?;

        let remaining_player_account = PlayerAccount::try_deserialize(&mut &data[..])
            .map_err(|_| CustomError::Unauthorized)?;

        // ✅ Fail immediately if an unauthorized account is found
        require!(
            remaining_player_account.game_account == game_account_key,
            CustomError::Unauthorized
        );

        let remaining_player_id = remaining_player_account.id;

        // Find the next valid player ID
        if remaining_player_id > current_player_id {
            if next_player_id.is_none() || remaining_player_id < next_player_id.unwrap() {
                next_player_id = Some(remaining_player_id);
            }
        }

        // Track the smallest ID in case we need to wrap around
        if min_id.is_none() || remaining_player_id < min_id.unwrap() {
            min_id = Some(remaining_player_id);
        }
    }

    // Return the next valid ID, or wrap around to the smallest ID
    Ok(next_player_id.or(min_id).unwrap_or(current_player_id))
}

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + GameAccount::INIT_SPACE,
        seeds = [b"game"],
        bump,
    )]
    pub game_account: Box<Account<'info, GameAccount>>,

    pub system_program: Program<'info, System>,
    
}

#[derive(Accounts)]
pub struct InitializeTreasuries<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game"],
        bump,
    )]
    pub game_account: Box<Account<'info, GameAccount>>,

    #[account(mut)]
    pub solana_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        seeds = [b"solana", game_account.key().as_ref()],
        bump,
        payer = signer,
        token::mint = solana_mint,
        token::authority = treasury_solana_account,
    )]
    pub treasury_solana_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    
}

#[derive(Accounts)]
pub struct PlayerJoin<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game"],
        bump,
    )]
    pub game_account: Account<'info, GameAccount>,

    #[account(mut)]
    pub admin: SystemAccount<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + PlayerAccount::INIT_SPACE,
        seeds = [b"player", game_account.key().as_ref(), signer.key().as_ref()],
        bump,
    )]
    pub player_account: Account<'info, PlayerAccount>,

    #[account(
        mut,
        seeds = [b"solana", game_account.key().as_ref()],
        bump,
    )]
    pub treasury_solana_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlayerLeave<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game"],
        bump,
    )]
    pub game_account: Account<'info, GameAccount>,

    #[account(
        mut,
        close = signer,
    )]
    pub closing_player_account: Account<'info, PlayerAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct KickPlayer<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game"],
        bump,
    )]
    pub game_account: Account<'info, GameAccount>,

    #[account(
        mut,
        close = signer,
    )]
    pub closing_player_account: Account<'info, PlayerAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlayerAnte<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game"],
        bump,
    )]
    pub game_account: Account<'info, GameAccount>,

    #[account(
        mut,
        seeds = [b"player", game_account.key().as_ref(), signer.key().as_ref()],
        bump,
    )]
    pub player_account: Account<'info, PlayerAccount>,

    #[account(mut)]
    pub admin: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"solana", game_account.key().as_ref()],
        bump,
    )]
    pub treasury_solana_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlayerClaim<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game"],
        bump,
    )]
    pub game_account: Account<'info, GameAccount>,

    #[account(
        mut,
        seeds = [b"player", game_account.key().as_ref(), signer.key().as_ref()],
        bump,
    )]
    pub player_account: Account<'info, PlayerAccount>,

    #[account(address = output_vault.mint)]
    pub clubmoon_mint: InterfaceAccount<'info, Mint>,

    #[account(address = input_vault.mint)]
    pub solana_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [b"solana", game_account.key().as_ref()],
        bump,
    )]
    pub treasury_solana_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = clubmoon_mint,
        associated_token::authority = signer,
    )]
    pub user_clubmoon_account: Box<InterfaceAccount<'info, TokenAccount>>,

    
    #[account(
    )]
    pub cp_swap_program: Program<'info, RaydiumCpmm>,

    

    /// CHECK: pool vault and lp mint authority
    #[account(
        seeds = [
          raydium_cpmm_cpi::AUTH_SEED.as_bytes(),
        ],
        seeds::program = cp_swap_program.key(),
        bump,
    )]
    pub authority: UncheckedAccount<'info>,
    

    /// The factory state to read protocol fees
    #[account(address = pool_state.load()?.amm_config)]
    pub amm_config: Box<Account<'info, AmmConfig>>,

    /// The program account of the pool in which the swap will be performed
    #[account(mut)]
    pub pool_state: AccountLoader<'info, PoolState>,

    /// The vault token account for input token
    #[account(
        mut,
        constraint = input_vault.key() == pool_state.load()?.token_0_vault || input_vault.key() == pool_state.load()?.token_1_vault
    )]
    pub input_vault: Box<InterfaceAccount<'info, TokenAccount>>,
  
      /// The vault token account for output token
      #[account(
        mut,
        constraint = output_vault.key() == pool_state.load()?.token_0_vault || output_vault.key() == pool_state.load()?.token_1_vault
    )]
    pub output_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, address = pool_state.load()?.observation_key)]
    pub observation_state: AccountLoader<'info, ObservationState>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,

}

#[account]
#[derive(InitSpace)]
pub struct GameAccount { //8
    pub entry_price: u64, //8
    pub ante_price: u64, //8
    pub pot_amount: u64, //8
    pub next_skip_time: i64, //8

    pub current_bet: u64, // 8

    pub player_no: u64, //8  how many players have been through

    pub current_player_id: u64, //8  id of player whos turn is now
    pub currently_playing: u64, //8  how many players are playing rn
    pub card_1: u8, // 1
    pub card_2: u8, // 1
    pub card_3: u8, // 1

    _padding: [u8; 5], // Padding to align to 8 bytes

    pub buy_back: u64, // 8   0 is normal, 0< means that amount of ppl need to buy in again
    pub round: u64 // 8   what round is it?
    
}

#[account]
#[derive(InitSpace)]
pub struct PlayerAccount { //8
    pub user: Pubkey, //32
    pub game_account: Pubkey, //32

    pub id: u64, //8

    pub round: u64, // 8

    #[max_len(100)]  
    pub user_name: String,
    
}


#[error_code]
pub enum CustomError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Can't bet bigger than the pot")]
    BetBiggerThanPot,
    #[msg("Wrong mint")]
    InvalidMint,
    #[msg("Invalid admin")]
    InvalidAdmin,
}
