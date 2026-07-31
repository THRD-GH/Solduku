# Solduku

Solitaire meets sudoku. The grid starts as a real sudoku — givens dug out
under a uniqueness proof — and every open cell arrives as a playing card in a
shuffled deck. Place cards anywhere their digit is legal, stash awkward ones
in free cells, play the wild joker when cornered, and chase suit flushes for
points. Fill the grid and the deal is won; wedge yourself and it dies.

Built on the [killer-sudoku](../killer-sudoku) play framework: same solver
core, technique ladder, deterministic seeded generation, PWA shell, themes,
and storage model.

## Rules

- **Placement** — a card may go on any empty cell where its digit does not
  repeat in the row, column or box. You are not reconstructing the hidden
  solution, only staying legal; the tension is that legal-but-wrong placements
  can wedge the deal.
- **Hand and free cells** — the hand refills from the deck as you play.
  Free cells park one card each, FreeCell-style.
- **Joker** — fully wild: any empty cell, counts as whatever digit and suit
  the position needs. Its digit is missing from the deck, so it must be spent
  wisely.
- **Scoring** — +1 per card placed, +10 per completed row/column/box, and
  +12 per played card when a completed unit is a flush (every card you played
  into it shares one suit, three cards minimum, jokers wild).
- **Dead deal** — nothing in the hand or free cells can be placed and there is
  nowhere to stash. Undo or restart.
- **Safe-move preview** — when a card is selected, green destinations keep a
  winning continuation; red destinations are legal but cannot finish with the
  remaining cards. Turn it off in Settings to play blind.

## Levels

Difficulty is graded by the solving techniques the underlying sudoku demands,
using the shared technique stack (`src/core/techniques.ts`):

| Level | Name   | Logic required            | Hand | Free | Jokers |
| ----- | ------ | ------------------------- | ---- | ---- | ------ |
| 1     | Gentle | singles only              | 5    | 3    | 2      |
| 2     | Easy   | locked candidates         | 4    | 3    | 2      |
| 3     | Steady | subsets and x-wing        | 4    | 2    | 1      |
| 4     | Tricky | one branch beyond logic   | 4    | 2    | 1      |
| 5     | Tough  | two branches beyond logic | 3    | 2    | 1      |
| 6     | Brutal | deep trial and error      | 3    | 1    | 1      |

Each grid is graded at several dig depths (`digLadder`) and the generator
keeps the rung closest to the level's ask, so the givens count floats with
the logic grade rather than being fixed per level.

Deals are deterministic: level + number always produces the same givens, deck
order and jokers, so deal numbers can be shared (`?p=3-10` links work).

## Development

```
npm install
npm run dev        # vite dev server
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build + service worker
npm run icons      # regenerate public/icons/*.png
```

No runtime dependencies; the UI is hand-built DOM. Generation runs on a web
worker with a localStorage cache, and the built site is an offline-capable PWA.
