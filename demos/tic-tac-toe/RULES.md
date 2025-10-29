# Tic-Tac-Toe Rules

## Game Objective

Get three of your symbols (X or O) in a row - horizontally, vertically, or diagonally - before your opponent does.

## Board Layout

The board is a 3×3 grid with coordinates [row, col]:

```
[0,0] | [0,1] | [0,2]
------+-------+------
[1,0] | [1,1] | [1,2]
------+-------+------
[2,0] | [2,1] | [2,2]
```

## Turn Order

1. **Player O goes FIRST** - makes the opening move
2. **Player X goes SECOND** - responds to Player O
3. Players alternate turns until game ends

## Valid Moves

- You can only place your symbol on an **EMPTY** cell (marked with " ")
- You cannot place your symbol where the opponent's symbol already exists
- You cannot place your symbol where your own symbol already exists
- Each turn, you place exactly ONE symbol

## Winning Conditions

### Three in a Row
You win by getting three of your symbols in a line with NO opponent symbols breaking the line:

**Rows (Horizontal)**:
- Top row: [0,0] [0,1] [0,2]
- Middle row: [1,0] [1,1] [1,2]
- Bottom row: [2,0] [2,1] [2,2]

**Columns (Vertical)**:
- Left column: [0,0] [1,0] [2,0]
- Middle column: [0,1] [1,1] [2,1]
- Right column: [0,2] [1,2] [2,2]

**Diagonals**:
- Top-left to bottom-right: [0,0] [1,1] [2,2]
- Top-right to bottom-left: [0,2] [1,1] [2,0]

### How to Check for Wins (MANDATORY PROCEDURE)

When checking if you or your opponent has won, you **MUST** follow this complete procedure:

1. **Check ALL 8 winning lines** - Do not stop early!
2. **For each line, verify:**
   - Does it contain three of the same symbol (X or O)?
   - Is there NO opponent symbol breaking the line?

**Complete Checklist (evaluate every line):**

| Line Type | Positions | Check |
|-----------|-----------|-------|
| Row 1 | [0,0] [0,1] [0,2] | Three same? No breaks? |
| Row 2 | [1,0] [1,1] [1,2] | Three same? No breaks? |
| Row 3 | [2,0] [2,1] [2,2] | Three same? No breaks? |
| Col 1 | [0,0] [1,0] [2,0] | Three same? No breaks? |
| Col 2 | [0,1] [1,1] [2,1] | Three same? No breaks? |
| Col 3 | [0,2] [1,2] [2,2] | Three same? No breaks? |
| Diagonal | [0,0] [1,1] [2,2] | Three same? No breaks? |
| Anti-diagonal | [0,2] [1,1] [2,0] | Three same? No breaks? |

**CRITICAL:** You MUST evaluate all 8 lines before concluding there is no win. Do not stop after checking only a few lines.

### Invalid Win Examples

These are **NOT** three in a row:
- ❌ **O X O** - Opponent's symbol breaks the line
- ❌ **O O _** - Only two symbols, third is empty
- ❌ **O _ O** - Gap in the middle
- ❌ **[0,0] [1,1] [2,0]** - Not a valid line (not diagonal)

### Draw (Tie)

The game is a draw when:
- All 9 positions are filled with symbols (no empty spaces)
- AND neither player has three in a row

## Victory Claim Protocol

When you think you've won:

1. **Check carefully** - Verify you have THREE of your symbols in a valid line
2. **Claim victory** - Set `game_status` to `"claimed_win_X"` or `"claimed_win_O"`
3. **Specify positions** - State which three positions form your winning line
4. **Wait for verification** - The opponent will verify your claim
5. **Accept the result**:
   - If verified: You win! 🎉
   - If disputed: Review the board together and resolve

## Opponent's Victory Claim

When your opponent claims victory:

1. **Fetch the current board** - Get the latest board state from the shared resource
2. **Check their claim** - Verify they have three of their symbols in the claimed line
3. **Look for breaks** - Make sure YOUR symbol doesn't break their line
4. **Respond**:
   - If valid: Congratulate them and acknowledge the win
   - If invalid: Challenge them and explain why it's not three in a row

## Board State Management

- **Single source of truth**: The shared board resource is the authoritative game state
- **Always fetch before your turn**: Get the latest board state before making a move
- **Update after your move**: Store the updated board after placing your symbol
- **Include in updates**:
  - Updated `board` array with your new symbol
  - Updated `move_history` with your move
  - Set `next_player` to your opponent
  - Set `game_status` appropriately

## Game Status Values

- `"in_progress"` - Game is ongoing
- `"claimed_win_X"` - Player X claims victory (needs verification)
- `"claimed_win_O"` - Player O claims victory (needs verification)
- `"won"` - Victory confirmed (set winner to "X" or "O")
- `"draw"` - Game ended in a tie

## Common Mistakes to Avoid

1. **Forgetting to verify wins** - Always check the board before accepting a victory claim
2. **Miscounting lines** - Count carefully: three symbols in a valid line, no breaks
3. **Claiming too early** - Make sure you actually have three in a row before claiming
4. **Not blocking threats** - Watch for opponent's two-in-a-row situations
5. **Invalid placements** - Never place your symbol on an occupied cell

## Sportsmanship

- Be respectful when winning or losing
- Verify claims honestly
- If you make a mistake, acknowledge it
- Good game messages are encouraged!
