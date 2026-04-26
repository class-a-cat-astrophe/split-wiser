# Split Wiser

An offline-first group travel expense tracker built for fast mobile use. Split Wiser helps a trip group log shared expenses, see who owes whom, and settle up without creating accounts or relying on a backend.

## What It Does

- Track shared travel expenses by category, payer, and split group.
- Support a configurable base currency plus a trip-local currency.
- Save the exact exchange-rate snapshot used when each expense is created.
- Show current balances and optimized settlement suggestions.
- Export the trip log as CSV or share a balance snapshot image.
- Keep all data on-device with local storage.

## Currency Model

Split Wiser uses a snapshot-based exchange-rate model:

- You can fetch a live rate to set the app's current conversion.
- When you save an expense, the app stores that expense with the exact rate active at that time.
- Later rate changes do not rewrite older expenses.
- Balances are displayed in the currently selected base currency, while each expense keeps its own saved rate history.

This keeps the app lightweight and predictable without claiming full historical FX lookups.

## Notes

- The app is intentionally backend-free and works as a simple static web app.
- Trip members cannot be removed while historical expenses still reference them.
- Expense history supports both editing and deletion.
