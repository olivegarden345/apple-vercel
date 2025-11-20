class FruitBoxGame {
    constructor() {
        this.ROWS = 10;
        this.COLS = 17;
        this.TARGET_SUM = 10;
        
        // Check if socket.io is available
        if (typeof io === 'undefined') {
            console.error('Socket.io not loaded! Make sure the server is running.');
            this.socket = null;
        } else {
            // Initialize socket.io - use current origin for connection
            const socketUrl = window.location.origin;
            console.log('Connecting to socket.io at:', socketUrl);
            this.socket = io(socketUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000,
                forceNew: false
            });
        }
        this.roomId = null;
        this.playerNumber = null;
        this.board = [];
        this.selectedCells = new Set();
        this.score = 0;
        this.timeRemaining = 120;
        this.gameActive = false;
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.selectionBox = null;
        this.finished = false;
        this.opponentFinished = false;
        this.opponentScore = 0;
        this.zenMode = false;
        this.refillInterval = null;
        
        this.initializeElements();
        this.attachEventListeners();
        this.setupSocketListeners();
    }
    
    initializeElements() {
        this.gameBoard = document.getElementById('gameBoard');
        this.score1El = document.getElementById('score1');
        this.score2El = document.getElementById('score2');
        this.timerEl = document.getElementById('timer');
        this.indicator1 = document.getElementById('indicator1');
        this.indicator2 = document.getElementById('indicator2');
        this.startBtn = document.getElementById('startBtn');
        this.exitZenModeBtn = document.getElementById('exitZenModeBtn');
        this.gameOverModal = document.getElementById('gameOverModal');
        this.winnerMessage = document.getElementById('winnerMessage');
        this.playAgainBtn = document.getElementById('playAgainBtn');
        this.lobbyModal = document.getElementById('lobbyModal');
        this.gameWrapper = document.querySelector('.game-wrapper');
        
        // Lobby elements
        this.zenModeBtn = document.getElementById('zenModeBtn');
        this.createRoomBtn = document.getElementById('createRoomBtn');
        this.joinRoomBtn = document.getElementById('joinRoomBtn');
        this.roomIdInput = document.getElementById('roomIdInput');
        this.roomInfo = document.getElementById('roomInfo');
        this.displayRoomId = document.getElementById('displayRoomId');
        this.shareLink = document.getElementById('shareLink');
        this.copyLinkBtn = document.getElementById('copyLinkBtn');
        this.waitingText = document.getElementById('waitingText');
        this.currentRoomId = document.getElementById('currentRoomId');
        this.roomDisplay = document.getElementById('roomDisplay');
        
        // Debug: Check if buttons exist
        if (!this.createRoomBtn) {
            console.error('Create Room button not found!');
        }
        if (!this.joinRoomBtn) {
            console.error('Join Room button not found!');
        }
        console.log('Elements initialized:', {
            createRoomBtn: !!this.createRoomBtn,
            joinRoomBtn: !!this.joinRoomBtn
        });
    }
    
    setupSocketListeners() {
        if (!this.socket) {
            console.warn('Socket not initialized - server may not be running');
            return;
        }
        
        // Connection status
        this.socket.on('connect', () => {
            console.log('Connected to server');
            // If we were in a game, try to rejoin
            if (this.roomId && this.playerNumber) {
                console.log('Reconnected - attempting to rejoin room:', this.roomId);
                // The server should handle reconnection, but we can emit a rejoin event if needed
            }
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from server. Reason:', reason);
            // Only show alert if it's not a manual disconnect or if we're in an active game
            if (this.gameActive && reason !== 'io client disconnect') {
                console.warn('Unexpected disconnect during game. Attempting to reconnect...');
                // Don't show alert immediately - let reconnection handle it
            }
        });
        
        this.socket.on('reconnect', (attemptNumber) => {
            console.log('Reconnected to server after', attemptNumber, 'attempts');
            // If we were in a game, we might need to rejoin
            if (this.roomId && this.playerNumber && !this.gameActive) {
                // Try to rejoin the room
                this.socket.emit('join-room', this.roomId);
            }
        });
        
        this.socket.on('reconnect_attempt', (attemptNumber) => {
            console.log('Reconnection attempt', attemptNumber);
        });
        
        this.socket.on('reconnect_error', (error) => {
            console.error('Reconnection error:', error);
        });
        
        this.socket.on('reconnect_failed', () => {
            console.error('Failed to reconnect to server');
            alert('Lost connection to server and could not reconnect. Please refresh the page.');
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            // Don't show alert on initial connection error if we're in zen mode
            if (!this.zenMode) {
                alert('Cannot connect to server. Make sure the server is running on port 3000.\n\nTo start the server, run:\nnpm install\nnpm start');
            }
        });
        
        this.socket.on('room-created', (roomId) => {
            console.log('Room created:', roomId);
            this.roomId = roomId;
            this.playerNumber = 1;
            this.displayRoomId.textContent = roomId;
            this.currentRoomId.textContent = roomId;
            this.shareLink.value = `${window.location.origin}?room=${roomId}`;
            this.roomInfo.style.display = 'block';
            this.waitingText.textContent = 'Waiting for player 2...';
            // Show game area for player 1 so they can see the start button when player 2 joins
            this.roomDisplay.style.display = 'block';
        });
        
        this.socket.on('room-joined', ({ roomId, playerNumber }) => {
            this.roomId = roomId;
            this.playerNumber = playerNumber;
            this.currentRoomId.textContent = roomId;
            this.roomDisplay.style.display = 'block';
            this.lobbyModal.classList.remove('show');
            this.gameWrapper.style.display = 'flex';
            // Start button will be shown when player-joined event fires
        });
        
        this.socket.on('join-error', (message) => {
            alert(message);
        });
        
        this.socket.on('player-joined', ({ playerCount }) => {
            if (playerCount === 2) {
                if (this.playerNumber === 1) {
                    this.waitingText.textContent = 'Player 2 joined! Click Start Game when ready.';
                    // Hide lobby and show game area for player 1
                    this.lobbyModal.classList.remove('show');
                    this.gameWrapper.style.display = 'flex';
                } else {
                    // Player 2 - hide lobby and show game area
                    this.lobbyModal.classList.remove('show');
                    this.gameWrapper.style.display = 'flex';
                }
                this.startBtn.style.display = 'block';
            }
        });
        
        this.socket.on('player-left', () => {
            alert('Other player left the game');
            this.resetToLobby();
        });
        
        this.socket.on('game-started', ({ board, playerNumber }) => {
            this.board = board;
            this.gameActive = true;
            this.finished = false;
            this.opponentFinished = false;
            this.score = 0;
            this.timeRemaining = 120;
            this.startBtn.style.display = 'none';
            this.renderBoard();
            this.updateScores();
            this.updatePlayerIndicators();
        });
        
        this.socket.on('timer-update', ({ timeRemaining, playerNumber }) => {
            if (playerNumber === this.playerNumber) {
                this.timeRemaining = timeRemaining;
                this.timerEl.textContent = timeRemaining;
                if (timeRemaining <= 10) {
                    this.timerEl.classList.add('warning');
                }
            }
        });
        
        this.socket.on('cells-cleared', ({ cells, score, playerNumber }) => {
            if (playerNumber === this.playerNumber) {
                cells.forEach(({ row, col }) => {
                    this.board[row][col].cleared = true;
                });
                this.score = score;
                this.renderBoard();
                this.updateScores();
            }
        });
        
        this.socket.on('opponent-score-update', ({ score, playerNumber }) => {
            // Update opponent's score in real-time
            if (playerNumber !== this.playerNumber) {
                this.opponentScore = score;
                this.updateScores();
            }
        });
        
        this.socket.on('invalid-selection', () => {
            this.showInvalidSelection();
        });
        
        this.socket.on('player-finished', ({ playerNumber, score, waiting }) => {
            if (playerNumber === this.playerNumber) {
                this.finished = true;
                this.gameActive = false;
                // Show waiting screen if opponent hasn't finished yet
                if (!this.opponentFinished) {
                    this.showWaitingScreen();
                }
            }
        });
        
        this.socket.on('opponent-finished', ({ opponentScore, opponentPlayerNumber }) => {
            this.opponentFinished = true;
            this.opponentScore = opponentScore;
            this.updateScores();
            
            // If we're also finished, the game-ended event will handle the final screen
            // Otherwise, we're still playing
        });
        
        this.socket.on('game-ended', ({ scores, winner }) => {
            this.finished = true;
            this.gameActive = false;
            this.endGame(scores, winner);
        });
        
        this.socket.on('opponent-wants-play-again', () => {
            // Update the play again button to show opponent is ready
            if (this.playAgainBtn) {
                const originalText = this.playAgainBtn.textContent;
                this.playAgainBtn.textContent = 'Opponent Ready - Click to Play Again!';
                this.playAgainBtn.style.backgroundColor = '#4caf50';
                setTimeout(() => {
                    if (this.playAgainBtn) {
                        this.playAgainBtn.textContent = originalText;
                        this.playAgainBtn.style.backgroundColor = '';
                    }
                }, 2000);
            }
        });
        
        this.socket.on('game-reset', ({ message }) => {
            // Reset game state
            this.gameActive = false;
            this.finished = false;
            this.opponentFinished = false;
            this.board = [];
            this.score = 0;
            this.opponentScore = 0;
            this.selectedCells.clear();
            this.isSelecting = false;
            this.selectionStart = null;
            this.selectionEnd = null;
            
            // Hide game over modal
            this.gameOverModal.classList.remove('show');
            
            // Clear the board display
            this.gameBoard.innerHTML = '';
            
            // Reset scores and timer display
            this.updateScores();
            this.timerEl.textContent = '120';
            this.timerEl.classList.remove('warning');
            
            // Show start button
            this.startBtn.style.display = 'block';
            
            // Re-enable play again button
            if (this.playAgainBtn) {
                this.playAgainBtn.textContent = 'Play Again';
                this.playAgainBtn.disabled = false;
            }
            
            // Update player indicators
            this.indicator1.textContent = this.playerNumber === 1 ? 'Your Turn' : 'Waiting';
            this.indicator2.textContent = this.playerNumber === 2 ? 'Your Turn' : 'Waiting';
            this.indicator1.classList.remove('active');
            this.indicator2.classList.remove('active');
            
            console.log('Game reset:', message);
        });
    }
    
    attachEventListeners() {
        this.zenModeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.startZenMode();
        });
        
        this.createRoomBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Create Room button clicked');
            console.log('Socket state:', {
                socket: this.socket,
                connected: this.socket?.connected,
                ioAvailable: typeof io !== 'undefined'
            });
            
            if (!this.socket) {
                const errorMsg = 'Socket.io not loaded. Please refresh the page and make sure the server is running.';
                console.error('Socket is null', errorMsg);
                alert(errorMsg);
                return;
            }
            if (!this.socket.connected) {
                const errorMsg = 'Not connected to server. Please make sure the server is running.';
                console.error('Socket not connected', errorMsg);
                alert(errorMsg);
                return;
            }
            console.log('Creating room...');
            this.socket.emit('create-room');
        });
        
        this.joinRoomBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Join Room button clicked');
            console.log('Socket state:', {
                socket: this.socket,
                connected: this.socket?.connected,
                ioAvailable: typeof io !== 'undefined'
            });
            
            if (!this.socket) {
                const errorMsg = 'Socket.io not loaded. Please refresh the page and make sure the server is running.';
                console.error('Socket is null', errorMsg);
                alert(errorMsg);
                return;
            }
            if (!this.socket.connected) {
                const errorMsg = 'Not connected to server. Please make sure the server is running.';
                console.error('Socket not connected', errorMsg);
                alert(errorMsg);
                return;
            }
            const roomId = this.roomIdInput.value.trim().toUpperCase();
            if (roomId.length === 6) {
                console.log('Joining room:', roomId);
                this.socket.emit('join-room', roomId);
            } else {
                alert('Please enter a valid 6-character room ID');
            }
        });
        
        this.copyLinkBtn.addEventListener('click', () => {
            this.shareLink.select();
            document.execCommand('copy');
            alert('Link copied!');
        });
        
        // Check for room ID in URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
            this.roomIdInput.value = roomParam.toUpperCase();
        }
        
        this.startBtn.addEventListener('click', () => {
            if (this.roomId && this.playerNumber) {
                this.socket.emit('start-game', {
                    roomId: this.roomId,
                    playerNumber: this.playerNumber
                });
            }
        });
        
        this.exitZenModeBtn.addEventListener('click', () => {
            if (this.zenMode) {
                this.resetToLobby();
            }
        });
        
        this.playAgainBtn.addEventListener('click', () => {
            if (this.roomId && this.playerNumber) {
                // Emit play-again request to server
                this.socket.emit('play-again', {
                    roomId: this.roomId,
                    playerNumber: this.playerNumber
                });
                
                // Update button to show waiting state
                this.playAgainBtn.textContent = 'Waiting for opponent...';
                this.playAgainBtn.disabled = true;
            } else {
                // If no room, go back to lobby
                this.gameOverModal.classList.remove('show');
                this.resetToLobby();
            }
        });
        
        // Mouse events for selection - attach to game board, not just cells
        this.gameBoard.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        document.addEventListener('mousemove', (e) => {
            if (this.isSelecting) {
                this.handleMouseMove(e);
            }
        });
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.gameBoard.addEventListener('mouseleave', () => {
            // Don't cancel on mouse leave, allow selection to continue outside
        });
        
        // Touch events for mobile
        this.gameBoard.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            // Use position-based calculation for better accuracy
            const fakeEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {},
                stopPropagation: () => {},
                target: e.target
            };
            this.handleMouseDown(fakeEvent);
        });
        this.gameBoard.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            // Use position-based calculation for better accuracy
            const fakeEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY
            };
            this.handleMouseMove(fakeEvent);
        });
        this.gameBoard.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleMouseUp(e);
        });
    }
    
    generateBoard() {
        const board = [];
        for (let row = 0; row < this.ROWS; row++) {
            board[row] = [];
            for (let col = 0; col < this.COLS; col++) {
                board[row][col] = {
                    value: Math.floor(Math.random() * 9) + 1,
                    cleared: false
                };
            }
        }
        return board;
    }
    
    startZenMode() {
        this.zenMode = true;
        this.gameActive = true;
        this.finished = false;
        this.score = 0;
        this.board = this.generateBoard();
        
        // Hide lobby
        this.lobbyModal.classList.remove('show');
        this.gameWrapper.style.display = 'flex';
        
        // Hide score and timer displays
        this.score1El.parentElement.parentElement.style.display = 'none';
        this.score2El.parentElement.parentElement.style.display = 'none';
        this.timerEl.parentElement.style.display = 'none';
        this.indicator1.style.display = 'none';
        this.indicator2.style.display = 'none';
        this.startBtn.style.display = 'none';
        this.roomDisplay.style.display = 'none';
        this.exitZenModeBtn.style.display = 'block';
        
        // Render the board
        this.renderBoard();
        
        console.log('Zen mode started');
    }
    
    checkAndRefillIfNeeded() {
        // Count cleared cells
        let clearedCount = 0;
        for (let row = 0; row < this.ROWS; row++) {
            for (let col = 0; col < this.COLS; col++) {
                if (this.board[row][col].cleared) {
                    clearedCount++;
                }
            }
        }
        
        // Refill if there are at least 50 cleared cells
        if (clearedCount >= 50) {
            this.refillClearedCells();
        }
    }
    
    refillClearedCells() {
        let refilledCount = 0;
        for (let row = 0; row < this.ROWS; row++) {
            for (let col = 0; col < this.COLS; col++) {
                if (this.board[row][col].cleared) {
                    // Refill with new random number
                    this.board[row][col].value = Math.floor(Math.random() * 9) + 1;
                    this.board[row][col].cleared = false;
                    refilledCount++;
                }
            }
        }
        
        // Re-render the board to show refilled cells
        this.renderBoard();
        
        if (refilledCount > 0) {
            console.log(`Refilled ${refilledCount} cells`);
        }
    }
    
    renderBoard() {
        this.gameBoard.innerHTML = '';
        for (let row = 0; row < this.ROWS; row++) {
            for (let col = 0; col < this.COLS; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                const cellData = this.board[row][col];
                if (cellData.cleared) {
                    cell.classList.add('cleared');
                } else {
                    cell.textContent = cellData.value;
                }
                
                this.gameBoard.appendChild(cell);
            }
        }
    }
    
    getCellIndex(cell) {
        if (!cell || !cell.dataset.row) return null;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        return { row, col };
    }
    
    handleMouseDown(e) {
        if (!this.gameActive || this.finished) return;
        
        // Allow starting selection anywhere, including cleared cells and negative space
        e.preventDefault();
        e.stopPropagation();
        this.isSelecting = true;
        
        // Get the cell index from exact cursor position
        const index = this.getCellFromPosition(e);
        
        if (index) {
            this.selectionStart = index;
            this.selectedCells.clear();
            this.createSelectionBox();
            // Initialize with the start cell (if not cleared) so box shows immediately
            const cellData = this.board[index.row][index.col];
            if (!cellData.cleared) {
                this.addToSelection(index);
            } else {
                // Even if cleared, show the box at the start position
                this.updateSelectionBox();
            }
        }
    }
    
    handleMouseMove(e) {
        if (!this.isSelecting || !this.gameActive || this.finished) return;
        
        // Calculate cell from exact cursor position
        const index = this.getCellFromPosition(e);
        if (index && this.selectionStart) {
            this.selectionEnd = index;
            // Update selection to include all cells in the box
            this.updateSelection(this.selectionStart, index);
        }
    }
    
    getCellFromPosition(e) {
        // First try to get the exact cell element under the cursor
        const element = document.elementFromPoint(e.clientX, e.clientY);
        if (element) {
            // Check if it's a cell or inside a cell
            const cell = element.closest('.cell');
            if (cell && cell.dataset.row !== undefined) {
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                if (!isNaN(row) && !isNaN(col)) {
                    return { row, col };
                }
            }
        }
        
        // Fallback: calculate which cell the point falls into based on position
        const rect = this.gameBoard.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Account for padding (2px) on game board
        const padding = 2;
        const gap = 2;
        
        // Calculate available space (total minus padding)
        const availableWidth = rect.width - (padding * 2);
        const availableHeight = rect.height - (padding * 2);
        
        // Calculate cell dimensions including gap
        const cellWidth = (availableWidth - (gap * (this.COLS - 1))) / this.COLS;
        const cellHeight = (availableHeight - (gap * (this.ROWS - 1))) / this.ROWS;
        
        // Adjust coordinates to account for padding
        const adjustedX = x - padding;
        const adjustedY = y - padding;
        
        // Determine which cell contains this point
        // Use floor to find the cell that contains the point
        let col = Math.floor(adjustedX / (cellWidth + gap));
        let row = Math.floor(adjustedY / (cellHeight + gap));
        
        // Clamp to valid range
        col = Math.max(0, Math.min(this.COLS - 1, col));
        row = Math.max(0, Math.min(this.ROWS - 1, row));
        
        return { row, col };
    }
    
    createSelectionBox() {
        if (this.selectionBox) {
            this.selectionBox.remove();
        }
        this.selectionBox = document.createElement('div');
        this.selectionBox.className = `selection-box player${this.playerNumber}`;
        this.gameBoard.appendChild(this.selectionBox);
    }
    
    updateSelectionBox() {
        if (!this.selectionBox) {
            this.createSelectionBox();
        }
        
        // Determine box bounds from selection start and end
        let minRow, maxRow, minCol, maxCol;
        
        if (this.selectionStart && this.selectionEnd) {
            // Use start and end to show the full box being drawn
            minRow = Math.min(this.selectionStart.row, this.selectionEnd.row);
            maxRow = Math.max(this.selectionStart.row, this.selectionEnd.row);
            minCol = Math.min(this.selectionStart.col, this.selectionEnd.col);
            maxCol = Math.max(this.selectionStart.col, this.selectionEnd.col);
        } else if (this.selectedCells.size > 0) {
            // Fallback to selected cells if no end position yet
            const cells = Array.from(this.selectedCells).map(key => {
                const [row, col] = key.split(',').map(Number);
                return { row, col };
            });
            
            const rows = cells.map(c => c.row);
            const cols = cells.map(c => c.col);
            minRow = Math.min(...rows);
            maxRow = Math.max(...rows);
            minCol = Math.min(...cols);
            maxCol = Math.max(...cols);
        } else if (this.selectionStart) {
            // If no cells selected but we have a start position, show box at start
            minRow = maxRow = this.selectionStart.row;
            minCol = maxCol = this.selectionStart.col;
        } else {
            this.selectionBox.style.display = 'none';
            return;
        }
        
        const rect = this.gameBoard.getBoundingClientRect();
        const padding = 2;
        const gap = 2;
        
        // Calculate available space (total minus padding)
        const availableWidth = rect.width - (padding * 2);
        const availableHeight = rect.height - (padding * 2);
        
        // Calculate cell dimensions including gap
        const cellWidth = (availableWidth - (gap * (this.COLS - 1))) / this.COLS;
        const cellHeight = (availableHeight - (gap * (this.ROWS - 1))) / this.ROWS;
        
        // Calculate position accounting for padding
        const left = padding + minCol * (cellWidth + gap);
        const top = padding + minRow * (cellHeight + gap);
        const width = (maxCol - minCol + 1) * cellWidth + (maxCol - minCol) * gap;
        const height = (maxRow - minRow + 1) * cellHeight + (maxRow - minRow) * gap;
        
        this.selectionBox.style.left = `${left}px`;
        this.selectionBox.style.top = `${top}px`;
        this.selectionBox.style.width = `${width}px`;
        this.selectionBox.style.height = `${height}px`;
        this.selectionBox.style.display = 'block';
    }
    
    handleMouseUp(e) {
        if (!this.isSelecting) return;
        this.isSelecting = false;
        this.selectionEnd = null;
        
        if (this.selectedCells.size > 0) {
            const cells = Array.from(this.selectedCells).map(key => {
                const [row, col] = key.split(',').map(Number);
                return { row, col };
            });
            
            if (this.zenMode) {
                // Handle selection in zen mode (client-side only)
                this.handleZenModeSelection(cells);
            } else if (this.roomId && this.playerNumber) {
                // Handle selection in multiplayer mode (via socket)
                this.socket.emit('select-cells', {
                    roomId: this.roomId,
                    cells: cells,
                    playerNumber: this.playerNumber
                });
            }
        }
        this.clearSelection();
    }
    
    handleZenModeSelection(cells) {
        // Calculate sum
        let sum = 0;
        const selectedIndices = [];
        
        cells.forEach(({ row, col }) => {
            const cellData = this.board[row][col];
            if (!cellData.cleared) {
                sum += cellData.value;
                selectedIndices.push({ row, col });
            }
        });
        
        // If sum equals 10, clear the cells
        if (sum === 10 && selectedIndices.length > 0) {
            selectedIndices.forEach(({ row, col }) => {
                this.board[row][col].cleared = true;
            });
            
            // Re-render the board to show cleared cells
            this.renderBoard();
            
            // Check if we need to refill (at least 50 cleared cells)
            this.checkAndRefillIfNeeded();
        } else {
            // Invalid selection - show feedback
            this.showInvalidSelection();
        }
    }
    
    cancelSelection() {
        this.isSelecting = false;
        this.clearSelection();
    }
    
    addToSelection(index) {
        const key = `${index.row},${index.col}`;
        if (!this.selectedCells.has(key)) {
            this.selectedCells.add(key);
            const cell = this.getCellElement(index.row, index.col);
            if (cell && !cell.classList.contains('cleared')) {
                cell.classList.add('selected');
                cell.classList.add(`player${this.playerNumber}`);
            }
        }
        this.updateSelectionBox();
    }
    
    updateSelection(start, end) {
        this.clearSelection();
        this.selectedCells.clear();
        
        const minRow = Math.min(start.row, end.row);
        const maxRow = Math.max(start.row, end.row);
        const minCol = Math.min(start.col, end.col);
        const maxCol = Math.max(start.col, end.col);
        
        // Select all cells in the box (only non-cleared ones)
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cellData = this.board[row][col];
                if (!cellData.cleared) {
                    const key = `${row},${col}`;
                    this.selectedCells.add(key);
                    const cell = this.getCellElement(row, col);
                    if (cell) {
                        cell.classList.add('selected');
                        cell.classList.add(`player${this.playerNumber}`);
                    }
                }
            }
        }
        
        this.updateSelectionBox();
    }
    
    clearSelection() {
        this.selectedCells.forEach(key => {
            const [row, col] = key.split(',').map(Number);
            const cell = this.getCellElement(row, col);
            if (cell) {
                cell.classList.remove('selected', 'player1', 'player2');
            }
        });
        this.selectedCells.clear();
        if (this.selectionBox) {
            this.selectionBox.style.display = 'none';
        }
    }
    
    getCellElement(row, col) {
        return this.gameBoard.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    }
    
    showInvalidSelection() {
        const cells = Array.from(this.selectedCells);
        cells.forEach(key => {
            const [row, col] = key.split(',').map(Number);
            const cell = this.getCellElement(row, col);
            if (cell) {
                cell.style.background = '#f44336';
                setTimeout(() => {
                    if (cell) {
                        cell.style.background = '';
                    }
                }, 300);
            }
        });
    }
    
    updatePlayerIndicators() {
        if (this.gameActive && !this.finished) {
            if (this.playerNumber === 1) {
                this.indicator1.classList.add('active');
                this.indicator1.textContent = 'Playing';
                this.indicator2.classList.remove('active');
                this.indicator2.textContent = 'Playing';
            } else {
                this.indicator2.classList.add('active');
                this.indicator2.textContent = 'Playing';
                this.indicator1.classList.remove('active');
                this.indicator1.textContent = 'Playing';
            }
        }
    }
    
    updateScores() {
        if (this.playerNumber === 1) {
            this.score1El.textContent = this.score;
            // Always show opponent's score if we have it (real-time updates)
            if (this.opponentScore !== undefined && this.opponentScore !== null) {
                this.score2El.textContent = this.opponentScore;
            } else {
                this.score2El.textContent = '0';
            }
        } else {
            this.score2El.textContent = this.score;
            // Always show opponent's score if we have it (real-time updates)
            if (this.opponentScore !== undefined && this.opponentScore !== null) {
                this.score1El.textContent = this.opponentScore;
            } else {
                this.score1El.textContent = '0';
            }
        }
    }
    
    showWaitingScreen() {
        this.winnerMessage.innerHTML = `
            <div style="margin-bottom: 15px;">
                <div>Your Score: ${this.score} points</div>
                <div style="margin-top: 10px; font-weight: bold; color: #2e7d32;">
                    Waiting for opponent to finish...
                </div>
            </div>
        `;
        this.gameOverModal.classList.add('show');
    }
    
    endGame(scores, winner) {
        let winnerText = '';
        const myScore = this.playerNumber === 1 ? scores[1] : scores[2];
        const opponentScore = this.playerNumber === 1 ? scores[2] : scores[1];
        
        if (winner === 0) {
            winnerText = `It's a tie! Both players scored ${myScore} points.`;
        } else if (winner === this.playerNumber) {
            winnerText = `You win! You scored ${myScore} points vs ${opponentScore} points.`;
        } else {
            winnerText = `You lose! You scored ${myScore} points vs ${opponentScore} points.`;
        }
        
        this.winnerMessage.innerHTML = `
            <div style="margin-bottom: 15px;">
                <div>Player 1: ${scores[1]} points</div>
                <div>Player 2: ${scores[2]} points</div>
            </div>
            <div style="font-weight: bold; color: #2e7d32; font-size: 1.2em;">
                ${winnerText}
            </div>
        `;
        
        this.gameOverModal.classList.add('show');
    }
    
    resetToLobby() {
        // Clear zen mode interval if active (no longer needed, but keeping for cleanup)
        if (this.refillInterval) {
            clearInterval(this.refillInterval);
            this.refillInterval = null;
        }
        
        this.gameActive = false;
        this.finished = false;
        this.opponentFinished = false;
        this.zenMode = false;
        this.board = [];
        this.score = 0;
        this.opponentScore = 0;
        this.selectedCells.clear();
        this.isSelecting = false;
        this.roomId = null;
        this.playerNumber = null;
        this.gameBoard.innerHTML = '';
        this.updateScores();
        this.lobbyModal.classList.add('show');
        this.gameWrapper.style.display = 'none';
        this.startBtn.style.display = 'none';
        this.roomInfo.style.display = 'none';
        this.roomDisplay.style.display = 'none';
        this.roomIdInput.value = '';
        this.timerEl.textContent = '120';
        this.timerEl.classList.remove('warning');
        
        // Show score and timer displays again (in case they were hidden in zen mode)
        this.score1El.parentElement.parentElement.style.display = '';
        this.score2El.parentElement.parentElement.style.display = '';
        this.timerEl.parentElement.style.display = '';
        this.indicator1.style.display = '';
        this.indicator2.style.display = '';
        this.exitZenModeBtn.style.display = 'none';
    }
}

// Initialize game when page loads
console.log('game.js loaded, waiting for DOM...');
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing game...');
    
    // Wait a bit for socket.io to load if it's loading from CDN
    function initGame() {
        console.log('Initializing game, io available:', typeof io !== 'undefined');
        try {
            window.gameInstance = new FruitBoxGame();
            console.log('Game initialized successfully');
        } catch (error) {
            console.error('Error initializing game:', error);
            alert('Error initializing game: ' + error.message + '\n\nPlease check the console for details.');
        }
    }
    
    // Try to initialize immediately, or wait if socket.io isn't ready
    if (typeof io !== 'undefined') {
        console.log('Socket.io already available, initializing immediately');
        initGame();
    } else {
        console.log('Socket.io not available, waiting...');
        // Wait up to 3 seconds for socket.io to load
        let attempts = 0;
        const maxAttempts = 30;
        const checkInterval = setInterval(() => {
            attempts++;
            if (typeof io !== 'undefined') {
                clearInterval(checkInterval);
                console.log('Socket.io loaded after', attempts * 100, 'ms');
                initGame();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                console.error('Socket.io failed to load after 3 seconds');
                console.log('Initializing game anyway (buttons will show connection errors)');
                // Initialize anyway so buttons at least show error messages
                try {
                    window.gameInstance = new FruitBoxGame();
                    console.log('Game initialized without socket.io');
                } catch (error) {
                    console.error('Error initializing game:', error);
                    alert('Error initializing game: ' + error.message);
                }
            }
        }, 100);
    }
});
