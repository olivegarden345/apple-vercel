const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Explicit route handler for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Game state storage
const games = new Map(); // roomId -> game state

// Generate random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Generate board (landscape: 17 cols x 10 rows)
function generateBoard() {
    const ROWS = 10;
    const COLS = 17;
    const board = [];
    for (let row = 0; row < ROWS; row++) {
        board[row] = [];
        for (let col = 0; col < COLS; col++) {
            board[row][col] = {
                value: Math.floor(Math.random() * 9) + 1,
                cleared: false
            };
        }
    }
    return board;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', () => {
        const roomId = generateRoomId();
        socket.join(roomId);
        socket.emit('room-created', roomId);
        
        // Initialize game state with shared board
        const sharedBoard = generateBoard();
        games.set(roomId, {
            roomId,
            players: [{ id: socket.id, playerNumber: 1 }],
            sharedBoard: sharedBoard, // One board for both players
            playerGames: {
                1: { board: null, score: 0, timeRemaining: 120, gameActive: false, finished: false, timerInterval: null },
                2: { board: null, score: 0, timeRemaining: 120, gameActive: false, finished: false, timerInterval: null }
            },
            playerCount: 1,
            bothFinished: false,
            playAgainRequests: new Set() // Track who wants to play again
        });
        
        console.log(`Room created: ${roomId} by ${socket.id}`);
    });

    socket.on('join-room', (roomId) => {
        const game = games.get(roomId);
        
        if (!game) {
            socket.emit('join-error', 'Room not found');
            return;
        }
        
        if (game.players.length >= 2) {
            socket.emit('join-error', 'Room is full');
            return;
        }
        
        socket.join(roomId);
        game.players.push({ id: socket.id, playerNumber: 2 });
        game.playerCount = 2;
        
        socket.emit('room-joined', { roomId, playerNumber: 2 });
        
        // Notify both players that game is ready
        io.to(roomId).emit('player-joined', {
            playerCount: 2
        });
        
        console.log(`Player joined room: ${roomId}`);
    });

    socket.on('start-game', ({ roomId, playerNumber }) => {
        const game = games.get(roomId);
        if (!game) {
            socket.emit('start-error', 'Room not found');
            return;
        }
        
        const playerGame = game.playerGames[playerNumber];
        if (playerGame.gameActive) {
            return; // Already started
        }
        
        // Use the shared board for this player (both players get the same board)
        // Deep clone the board so each player's cleared state is independent
        const board = JSON.parse(JSON.stringify(game.sharedBoard));
        playerGame.board = board;
        playerGame.gameActive = true;
        playerGame.score = 0;
        playerGame.timeRemaining = 120;
        playerGame.finished = false;
        
        // Send game started to this player only
        socket.emit('game-started', {
            board: board,
            playerNumber: playerNumber
        });
        
        // Start timer for this player
        if (playerGame.timerInterval) {
            clearInterval(playerGame.timerInterval);
        }
        
        playerGame.timerInterval = setInterval(() => {
            playerGame.timeRemaining--;
            socket.emit('timer-update', {
                timeRemaining: playerGame.timeRemaining,
                playerNumber: playerNumber
            });
            
            if (playerGame.timeRemaining <= 0) {
                clearInterval(playerGame.timerInterval);
                playerGame.timerInterval = null;
                playerGame.gameActive = false;
                playerGame.finished = true;
                
                // Notify this player they finished
                socket.emit('player-finished', {
                    playerNumber: playerNumber,
                    score: playerGame.score,
                    waiting: false
                });
                
                // Notify the other player that their opponent finished
                const otherPlayerNumber = playerNumber === 1 ? 2 : 1;
                const otherPlayer = game.players.find(p => p.playerNumber === otherPlayerNumber);
                if (otherPlayer) {
                    io.to(otherPlayer.id).emit('opponent-finished', {
                        opponentScore: playerGame.score,
                        opponentPlayerNumber: playerNumber
                    });
                }
                
                // Check if both players finished
                const bothFinished = game.playerGames[1].finished && game.playerGames[2].finished;
                
                if (bothFinished) {
                    game.bothFinished = true;
                    const scores = {
                        1: game.playerGames[1].score,
                        2: game.playerGames[2].score
                    };
                    const winner = scores[1] > scores[2] ? 1 : scores[2] > scores[1] ? 2 : 0;
                    
                    io.to(roomId).emit('game-ended', {
                        scores: scores,
                        winner: winner
                    });
                    
                    // Reset play-again requests when game ends
                    game.playAgainRequests = new Set();
                }
            }
        }, 1000);
        
        console.log(`Player ${playerNumber} started game in room ${roomId}`);
    });

    socket.on('select-cells', ({ roomId, cells, playerNumber }) => {
        const game = games.get(roomId);
        if (!game) return;
        
        const playerGame = game.playerGames[playerNumber];
        if (!playerGame || !playerGame.gameActive || !playerGame.board) {
            return;
        }
        
        // Calculate sum
        let sum = 0;
        const selectedIndices = [];
        
        cells.forEach(({ row, col }) => {
            const cellData = playerGame.board[row][col];
            if (!cellData.cleared) {
                sum += cellData.value;
                selectedIndices.push({ row, col });
            }
        });
        
        // If sum equals 10, clear the cells
        if (sum === 10 && selectedIndices.length > 0) {
            const clearedCount = selectedIndices.length;
            selectedIndices.forEach(({ row, col }) => {
                playerGame.board[row][col].cleared = true;
            });
            
            playerGame.score += clearedCount;
            
            // Send update to this player only
            socket.emit('cells-cleared', {
                cells: selectedIndices,
                score: playerGame.score,
                playerNumber: playerNumber
            });
        } else {
            // Invalid selection
            socket.emit('invalid-selection');
        }
    });

    socket.on('play-again', ({ roomId, playerNumber }) => {
        const game = games.get(roomId);
        if (!game) {
            socket.emit('play-again-error', 'Room not found');
            return;
        }
        
        // Add this player to play-again requests
        game.playAgainRequests.add(playerNumber);
        
        // Notify other player that this player wants to play again
        const otherPlayerNumber = playerNumber === 1 ? 2 : 1;
        const otherPlayer = game.players.find(p => p.playerNumber === otherPlayerNumber);
        if (otherPlayer) {
            io.to(otherPlayer.id).emit('opponent-wants-play-again');
        }
        
        // If both players want to play again, reset the game
        if (game.playAgainRequests.size === 2) {
            // Clear all timers
            if (game.playerGames[1].timerInterval) {
                clearInterval(game.playerGames[1].timerInterval);
            }
            if (game.playerGames[2].timerInterval) {
                clearInterval(game.playerGames[2].timerInterval);
            }
            
            // Generate new shared board
            const newSharedBoard = generateBoard();
            game.sharedBoard = newSharedBoard;
            
            // Reset player game states
            game.playerGames[1] = {
                board: null,
                score: 0,
                timeRemaining: 120,
                gameActive: false,
                finished: false,
                timerInterval: null
            };
            game.playerGames[2] = {
                board: null,
                score: 0,
                timeRemaining: 120,
                gameActive: false,
                finished: false,
                timerInterval: null
            };
            
            game.bothFinished = false;
            game.playAgainRequests = new Set();
            
            // Notify both players that game is reset and ready
            io.to(roomId).emit('game-reset', {
                message: 'New game ready! Click Start Game when ready.'
            });
            
            console.log(`Game reset in room ${roomId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Clean up games
        for (const [roomId, game] of games.entries()) {
            const playerIndex = game.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const playerNumber = game.players[playerIndex].playerNumber;
                
                // Clear timer for this player
                const playerGame = game.playerGames[playerNumber];
                if (playerGame && playerGame.timerInterval) {
                    clearInterval(playerGame.timerInterval);
                }
                
                game.players.splice(playerIndex, 1);
                game.playerCount = game.players.length;
                
                if (game.players.length === 0) {
                    games.delete(roomId);
                } else {
                    io.to(roomId).emit('player-left');
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
