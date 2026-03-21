# Midpoint Ordering

This app has used "midpoint ordering" for drag and drop.

The idea is simple:

- Every item has an `order` number.
- To move an item between two neighbors, we do not renumber everything.
- Instead, we pick a number between the neighbors.

Example:

- `A = 10`
- `B = 20`
- move `X` between them
- assign `X = (10 + 20) / 2 = 15`

That is fast and works well for many moves.

## Why it eventually breaks

If you keep inserting between the same neighbors, the gap keeps shrinking:

- `10` and `20` gives `15`
- between `10` and `15` gives `12.5`
- then `11.25`
- then `10.625`

In theory that can continue for a long time.
In practice, old data can accumulate values that are:

- duplicated
- extremely close together
- no longer producing a meaningful new position for the sort order

When that happens, drag and drop can look random:

- the UI shows the drag/drop gesture
- but the computed order does not move the item to a different effective slot
- so it appears to "snap back"

## Why local mode was especially affected

In local mode, the client already knows the exact target index at drop time.
So using midpoint math there is unnecessary. The UI can reorder by index directly.

That is what the local fix now does:

- reorder the visible layout by target index
- renumber layout items to clean sequential values
- defer the heavier localStorage write slightly

This keeps the ordering model healthy instead of letting old midpoint values accumulate forever.
