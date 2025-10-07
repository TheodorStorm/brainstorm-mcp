# Player O Instructions

You are **Player O** in a game of tic-tac-toe. You will play against Player X using the brainstorm MCP server to coordinate moves.

## Your Role

- You play as **O**
- You go **FIRST** (you make the opening move)
- You join an existing game project

## Step-by-Step Instructions

### 1. Join the Game Project

Join the existing tic-tac-toe project:

```
Join the tic-tac-toe project as agent name: player-o
```

### 2. Get the Game Board

Retrieve the initial board state:

```
Get the game-board resource from project tic-tac-toe
```

### 3. Make Your First Move

1. **Analyze the empty board**
2. **Display the empty board prominently** - show the user what it looks like before your move
3. **Choose your opening position** [row, col] where row and col are 0, 1, or 2
4. **Update the board**:
   - Place your O at the chosen position
   - Update move_history to include your move
   - Set next_player to "X"
5. **Display the updated board prominently** - show what it looks like after your move
6. **Store the updated board** as the `game-board` resource:
   ```
   Store resource with:
   - project_id: tic-tac-toe
   - resource_id: game-board
   - name: Tic-Tac-Toe Board
   - creator_agent: player-o
   - content: { "board": [[...]], "next_player": "X", "move_history": [...], "game_status": "in_progress" }
   - permissions: { read: ["*"], write: ["player-x", "player-o"] }
   ```
7. **Send a message to player-x**:
   ```
   Send message with:
   - to_agent: player-x
   - type: event
   - payload: {
       move: [row, col],
       board_state: "visual representation",
       message: "I played O at position [row, col]. Your turn!"
     }
   ```

### 4. Wait for Player X's Response

Use long-polling to wait for Player X's move:

```
Receive messages with:
- project_id: tic-tac-toe
- agent_name: player-o
- wait: true
- timeout_seconds: 300
```

### 5. Game Loop

When you receive a message:

1. **Acknowledge the message**
2. **Get the current board state** from the `game-board` resource
3. **Display the current board prominently** - show the full board visualization to the user
4. **Check if the game is over**:
   - If someone won or it's a draw, follow the "Game Over" section below
5. **Analyze the board and make your move**:
   - Choose an empty position [row, col] where row and col are 0, 1, or 2
   - Update the board with your O
   - Update move_history
   - Set next_player to "X"
6. **Check for win/draw CAREFULLY** using these rules:
   - **Win**: Check if ANY of these have three matching symbols:
     - All 3 rows: [0,0]-[0,1]-[0,2], [1,0]-[1,1]-[1,2], [2,0]-[2,1]-[2,2]
     - All 3 columns: [0,0]-[1,0]-[2,0], [0,1]-[1,1]-[2,1], [0,2]-[1,2]-[2,2]
     - 2 diagonals: [0,0]-[1,1]-[2,2], [0,2]-[1,1]-[2,0]
   - **Draw**: All 9 positions filled with no winner
   - Update game_status to "won" (with winner: "X" or "O") or "draw" if applicable
7. **Display the updated board prominently** - show what it looks like after your move
8. **Store the updated board** as the `game-board` resource
9. **Send a message to player-x** describing your move:
   ```
   Send message with:
   - to_agent: player-x
   - type: event
   - payload: {
       move: [row, col],
       board_state: "visual representation",
       message: "I played O at position [row, col]. Your turn!"
     }
   ```
10. **Wait for the next move** (go back to step 1)

## Board Format

The board uses a 2D array with coordinates:
```
[0,0] | [0,1] | [0,2]
------+-------+------
[1,0] | [1,1] | [1,2]
------+-------+------
[2,0] | [2,1] | [2,2]
```

## Game Over

### Win Verification Protocol

**IMPORTANT**: Before declaring victory, you MUST verify your win claim:

1. **Check for three in a row**: Verify you have three O's in a row (horizontally, vertically, or diagonally) with NO X's breaking the line
2. **Double-check the board state**: Look at the actual board array, not just your assumption
3. **If you think you won**:
   - Set `game_status` to `"claimed_win_O"` (NOT "won")
   - Set `winner` to `"O"`
   - Send message: "I believe I won with three O's in a row at [positions]. Please verify!"
   - Wait for Player X's response

### If Player X Claims Victory

1. **Verify their claim**: Check the board for three X's in a row
2. **If valid**:
   - Send message: "Congratulations Player X! I confirm you won. Well played!"
   - Stop receiving messages
3. **If invalid** (X is not actually three in a row):
   - Send message: "I don't see three X's in a row. Let's verify the board state together. Should we continue playing or start a new game?"
   - Discuss resolution with Player X

### If Your Win is Confirmed
1. Player X will verify and congratulate you
2. Stop receiving messages

### If Your Win is Disputed
1. Review the board state together
2. If you were wrong: Apologize and continue the game from the last valid state
3. If there's confusion: Agree to start a new game

### If It's a Draw
1. Send a message: "It's a draw! Good game, Player X!"
2. Stop receiving messages

## Tips

- Always visualize the board state in your messages so both players can follow along
- Check for wins after each move (3 in a row horizontally, vertically, or diagonally)
- A draw occurs when the board is full and no one has won
- Be a good sport! Thank your opponent when the game ends
- Consider strategy: corners and center are typically strong opening moves

## Example Board Visualization

```
 X | O | X
---+---+---
 O | X | O
---+---+---
   | X |
```

## Ready to Play?

Follow the steps above to join the game and make your first move. Player X is waiting!
