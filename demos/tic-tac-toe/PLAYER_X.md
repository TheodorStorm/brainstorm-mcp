# Player X Instructions

You are **Player X** in a game of tic-tac-toe. You will play against Player O using the brainstorm MCP server to coordinate moves.

## Your Role

- You play as **X**
- You go **SECOND** (Player O makes the first move)
- You create and set up the game project

## Step-by-Step Instructions

### 1. Check for Existing Project

First, check if the tic-tac-toe project already exists:

```
Get project info for project_id: tic-tac-toe
```

If the project exists:
- Delete it using the delete_project tool with project_id: tic-tac-toe

### 2. Create the Game Project

Create a fresh project for the tic-tac-toe game:

```
Create a project with:
- project_id: tic-tac-toe
- name: Tic-Tac-Toe Game
- description: A game of tic-tac-toe between two agents
- context: { rules: "Standard 3x3 tic-tac-toe. Player O goes first, Player X goes second. Win by getting 3 in a row." }
```

### 3. Join as Player X

```
Join the tic-tac-toe project as agent name: player-x
```

### 4. Initialize the Game Board

Store the initial empty game board as a shared resource:

```
Store a resource with:
- project_id: tic-tac-toe
- resource_id: game-board
- name: Tic-Tac-Toe Board
- creator_agent: player-x
- content:
  {
    "board": [
      [" ", " ", " "],
      [" ", " ", " "],
      [" ", " ", " "]
    ],
    "next_player": "O",
    "move_history": [],
    "game_status": "in_progress"
  }
- permissions: { read: ["*"], write: ["player-x", "player-o"] }
```

### 5. Wait for Player O to Join and Make First Move

Use long-polling to wait for Player O's move:

```
Receive messages with:
- project_id: tic-tac-toe
- agent_name: player-x
- wait: true
- timeout_seconds: 300
```

### 6. Game Loop

When you receive a message:

1. **Acknowledge the message**
2. **Get the current board state** from the `game-board` resource
3. **Display the current board prominently** - show the full board visualization to the user
4. **Check if the game is over**:
   - If someone won or it's a draw, follow the "Game Over" section below
5. **Analyze the board and make your move**:
   - Choose an empty position [row, col] where row and col are 0, 1, or 2
   - Update the board with your X
   - Update move_history
   - Set next_player to "O"
6. **Check for win/draw CAREFULLY** using these rules:
   - **Win**: Check if ANY of these have three matching symbols:
     - All 3 rows: [0,0]-[0,1]-[0,2], [1,0]-[1,1]-[1,2], [2,0]-[2,1]-[2,2]
     - All 3 columns: [0,0]-[1,0]-[2,0], [0,1]-[1,1]-[2,1], [0,2]-[1,2]-[2,2]
     - 2 diagonals: [0,0]-[1,1]-[2,2], [0,2]-[1,1]-[2,0]
   - **Draw**: All 9 positions filled with no winner
   - Update game_status to "won" (with winner: "X" or "O") or "draw" if applicable
7. **Display the updated board prominently** - show what it looks like after your move
8. **Store the updated board** as the `game-board` resource
9. **Send a message to player-o** describing your move:
   ```
   Send message with:
   - to_agent: player-o
   - type: event
   - payload: {
       move: [row, col],
       board_state: "visual representation",
       message: "I played X at position [row, col]. Your turn!"
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

1. **Check for three in a row**: Verify you have three X's in a row (horizontally, vertically, or diagonally) with NO O's breaking the line
2. **Double-check the board state**: Look at the actual board array, not just your assumption
3. **If you think you won**:
   - Set `game_status` to `"claimed_win_X"` (NOT "won")
   - Set `winner` to `"X"`
   - Send message: "I believe I won with three X's in a row at [positions]. Please verify!"
   - Wait for Player O's response

### If Player O Claims Victory

1. **Verify their claim**: Check the board for three O's in a row
2. **If valid**:
   - Send message: "Congratulations Player O! I confirm you won. Well played!"
   - Stop receiving messages
3. **If invalid** (O is not actually three in a row):
   - Send message: "I don't see three O's in a row. Let's verify the board state together. Should we continue playing or start a new game?"
   - Discuss resolution with Player O

### If Your Win is Confirmed
1. Player O will verify and congratulate you
2. Stop receiving messages

### If Your Win is Disputed
1. Review the board state together
2. If you were wrong: Apologize and continue the game from the last valid state
3. If there's confusion: Agree to start a new game

### If It's a Draw
1. Send a message: "It's a draw! Good game, Player O!"
2. Stop receiving messages

## Tips

- Always visualize the board state in your messages so both players can follow along
- Check for wins after each move (3 in a row horizontally, vertically, or diagonally)
- A draw occurs when the board is full and no one has won
- Be a good sport! Thank your opponent when the game ends

## Example Board Visualization

```
 X | O | X
---+---+---
 O | X | O
---+---+---
   | X |
```

## Ready to Play?

Follow the steps above to start the game. Player O will join shortly and make the first move!
