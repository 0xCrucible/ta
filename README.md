# TA Metrics

Independent analytics dashboard for the TA token on Robinhood Chain.

## Core dashboard
- Trading Volume
- Donations Made
- Treasury Balance
- Global 24H / 7D / 30D range selector
- Donation activity chart
- Independent branding and methodology links

## Data behavior
- **24H volume:** live rolling volume from DEX Screener.
- **7D / 30D volume:** intentionally shown as unavailable until historical daily volume snapshots are connected. DEX Screener's public token endpoint supplies rolling 24H volume, not a trustworthy 7D/30D aggregate.
- **Donations:** computed from TA Fund's published contribution records for the selected period.
- **Treasury:** current published treasury balance; it is a point-in-time balance, so it does not change with the period selector.

This avoids presenting estimated or fabricated longer-period volume as measured data.

## Deploy to Vercel
1. Upload this folder to a GitHub repository.
2. Import the repo in Vercel.
3. Deploy. No build step is required.

The serverless endpoint is `/api/dashboard`.

## Recommended next upgrade
Add a tiny historical-volume database and a daily cron snapshot. Once at least 7/30 days of snapshots exist, the existing API response can fill `ranges.7d.volume` and `ranges.30d.volume` with exact recorded totals.

Token: `0x9cA1cC0c90d97B4F36c5E2232d4fbD705a73c65d`
Treasury: `0x1F41B0441ae6E00633Bd2E6607218d370DA4896e`
