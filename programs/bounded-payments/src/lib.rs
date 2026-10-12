use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

anchor_lang::declare_id!("Hcgo55q8sQZW1cw6UBBErqZEhCYGjph7PKmK26rvkp2Z");

pub const USDC_DEVNET: Pubkey = anchor_lang::solana_program::pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

#[program]
pub mod bounded_payments {
    use super::*;

    pub fn create_plan(
        ctx: Context<CreatePlan>,
        plan_id: u64,
        amount: u64,
        interval: i64,
        payment_count: u64,
        first_due_at: Option<i64>,
        authorized_caller: Pubkey,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(amount > 0, PlanError::ZeroAmount);
        require!(interval > 0, PlanError::InvalidInterval);
        require!(payment_count > 0, PlanError::ZeroPaymentCount);
        require!(authorized_caller != Pubkey::default(), PlanError::ZeroAuthorizedCaller);
        let next_due_at = first_due_at.unwrap_or(now);
        require!(next_due_at >= now, PlanError::FirstDueInPast);
        let total_limit = amount.checked_mul(payment_count).ok_or(PlanError::MathOverflow)?;
        let schedule_span = interval
            .checked_mul(i64::try_from(payment_count).map_err(|_| PlanError::MathOverflow)?)
            .ok_or(PlanError::MathOverflow)?;
        let expiry = checked_add(next_due_at, schedule_span).ok_or(PlanError::MathOverflow)?;

        let plan = &mut ctx.accounts.plan;
        plan.owner = ctx.accounts.owner.key();
        plan.plan_id = plan_id;
        plan.recipient = ctx.accounts.recipient.key();
        plan.amount = amount;
        plan.interval = interval;
        plan.total_limit = total_limit;
        plan.paid_total = 0;
        plan.next_due_at = next_due_at;
        plan.expiry = expiry;
        plan.authorized_caller = authorized_caller;
        plan.bump = ctx.bumps.plan;
        Ok(())
    }

    pub fn execute_transfer(ctx: Context<ExecuteTransfer>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let plan = &ctx.accounts.plan;
        require!(now >= plan.next_due_at, PlanError::TransferNotDue);
        require!(now <= plan.expiry, PlanError::PlanExpired);
        let paid_total = plan.paid_total.checked_add(plan.amount).ok_or(PlanError::MathOverflow)?;
        require!(paid_total <= plan.total_limit, PlanError::LimitExceeded);
        let next_due_at = next_scheduled_time(now, plan.next_due_at, plan.interval)
            .ok_or(PlanError::MathOverflow)?;

        let owner = plan.owner;
        let plan_id = plan.plan_id.to_le_bytes();
        let bump = [plan.bump];
        let signer_seeds: &[&[u8]] = &[b"plan", owner.as_ref(), &plan_id, &bump];
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.recipient.to_account_info(),
            authority: ctx.accounts.plan.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                &[signer_seeds],
            ),
            plan.amount,
            ctx.accounts.mint.decimals,
        )?;
        let plan = &mut ctx.accounts.plan;
        plan.paid_total = paid_total;
        plan.next_due_at = next_due_at;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(plan_id: u64)]
pub struct CreatePlan<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + PaymentPlan::INIT_SPACE,
        seeds = [b"plan", owner.key().as_ref(), &plan_id.to_le_bytes()],
        bump
    )]
    pub plan: Account<'info, PaymentPlan>,
    #[account(address = USDC_DEVNET)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        constraint = recipient.mint == mint.key() @ PlanError::WrongMint
    )]
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = plan,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteTransfer<'info> {
    pub authorized_caller: Signer<'info>,
    #[account(
        mut,
        seeds = [b"plan", plan.owner.as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
        constraint = authorized_caller.key() == plan.authorized_caller @ PlanError::Unauthorized
    )]
    pub plan: Account<'info, PaymentPlan>,
    #[account(address = USDC_DEVNET)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = plan,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        address = plan.recipient,
        constraint = recipient.mint == mint.key() @ PlanError::WrongMint
    )]
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
#[derive(InitSpace)]
pub struct PaymentPlan {
    pub owner: Pubkey,
    pub plan_id: u64,
    pub recipient: Pubkey,
    pub amount: u64,
    pub interval: i64,
    pub total_limit: u64,
    pub paid_total: u64,
    pub next_due_at: i64,
    pub expiry: i64,
    pub authorized_caller: Pubkey,
    pub bump: u8,
}

fn checked_add(left: i64, right: i64) -> Option<i64> {
    left.checked_add(right)
}

fn next_scheduled_time(now: i64, due_at: i64, interval: i64) -> Option<i64> {
    let elapsed = now.checked_sub(due_at)?;
    let intervals = elapsed.checked_div(interval)?.checked_add(1)?;
    intervals.checked_mul(interval).and_then(|advance| due_at.checked_add(advance))
}

#[cfg(test)]
mod tests {
    use super::{checked_add, next_scheduled_time};

    #[test]
    fn schedule_advances_to_first_time_after_now() {
        assert_eq!(next_scheduled_time(125, 100, 10), Some(130)); // REQ-27
        assert_eq!(next_scheduled_time(100, 100, 10), Some(110)); // REQ-27
    }

    #[test]
    fn schedule_overflow_fails_without_wrapping() {
        assert_eq!(next_scheduled_time(i64::MAX, i64::MAX - 1, 1), None); // REQ-28
        assert_eq!(checked_add(i64::MAX, 1), None); // REQ-19
    }
}

#[error_code]
pub enum PlanError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Interval must be greater than zero")]
    InvalidInterval,
    #[msg("Payment count must be greater than zero")]
    ZeroPaymentCount,
    #[msg("First due time is earlier than now")]
    FirstDueInPast,
    #[msg("Recipient token account has the wrong mint")]
    WrongMint,
    #[msg("Authorized caller cannot be the zero key")]
    ZeroAuthorizedCaller,
    #[msg("Checked arithmetic overflow")]
    MathOverflow,
    #[msg("Caller is not authorized")]
    Unauthorized,
    #[msg("Transfer is not due")]
    TransferNotDue,
    #[msg("Plan has expired")]
    PlanExpired,
    #[msg("Transfer exceeds the total limit")]
    LimitExceeded,
}
