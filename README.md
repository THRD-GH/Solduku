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
- **Hand and free cells** — tap the draw pile to fill open hand slots; free
  cells park awkward cards, FreeCell-style.
- **Joker pile** — each level has its own visible joker pile. Jokers are
  fully wild and are drawn into an open hand slot when you choose.
- **Scoring** — +1 per card placed, +10 per completed row/column/box, and
  +12 per played card when a completed unit is a flush (every card you played
  into it shares one suit, three cards minimum, jokers wild).
- **Dead deal** — nothing in the hand or free cells can be placed and there is
  nowhere to stash. Undo or restart.
- **Safe-move preview** — optional: when a card is selected, green destinations keep a
  winning continuation; red destinations are legal but cannot finish with the
  remaining cards. Turn it off in Settings to play blind.
- **Joker aid** — optional Assist and Generous settings raise the joker count
  in the separate pile for new deals while keeping the number deck intact.
- **Joker bank** — the first win of a deal earns one single-use joker. Banked
  jokers can be added to a new deal from Settings or loaded into the Joker
  Pile during play; either way, they are spent.
- **Bonus free slots** — every tenth first-time deal win earns one single-use
  bonus free slot, which can be added from its own pile during a deal.

## Levels

Difficulty is graded by the solving techniques the underlying sudoku demands,
using the shared technique stack (`src/core/techniques.ts`):

| Level | Belt   | Grade   | Logic required            | Hand | Free | Jokers |
| ----- | ------ | ------- | ------------------------- | ---- | ---- | ------ |
| 1     | White  | 5th Kyū | singles only              | 5    | 3    | 2      |
| 2     | Yellow | 4th Kyū | locked candidates         | 4    | 3    | 2      |
| 3     | Green  | 3rd Kyū | subsets and x-wing        | 4    | 2    | 1      |
| 4     | Blue   | 2nd Kyū | one branch beyond logic   | 4    | 2    | 1      |
| 5     | Brown  | 1st Kyū | two branches beyond logic | 3    | 2    | 1      |
| 6     | Black  | 1st Dan | deep trial and error      | 3    | 1    | 1      |

Each grid is graded at several dig depths (`digLadder`) and the generator
keeps the rung closest to the level's ask, so the givens count floats with
the logic grade rather than being fixed per level.

Deals are deterministic: level + number always produces the same givens, deck
order and jokers, so deal numbers can be shared (`?p=3-10` links work).

## Development

```
npm install
npm run dev        # vite dev server
npm test           # game, scoring and completability regressions
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build + service worker
npm run icons      # regenerate public/icons/*.png
```

`npm test` runs the rules that are easy to break and hard to notice: that undo
always rewinds a deal, that `canUndo` never offers an undo `undo` refuses, that
a restart keeps bank tokens already spent, that every trophy band is reachable
and none is free, that aids are counted from all three sources, and — the one
that has caught the most — that a deal played straight to its solution is never
declared unwinnable, jokers included.

No runtime dependencies; the UI is hand-built DOM. Generation runs on a web
worker with a localStorage cache, and the built site is an offline-capable PWA.
