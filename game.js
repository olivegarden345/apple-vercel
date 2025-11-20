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
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });
        }
        this.roomId = null;
        this.playerNumber = null;
        this.board = [];
        this.selectedCells = new Set();
        this.score = 0;
        this.timeRemaining = 60;
        this.gameActive = false;
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionBox = null;
        this.finished = false;
        this.opponentFinished = false;
        this.opponentScore = 0;
        
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
        this.gameOverModal = document.getElementById('gameOverModal');
        this.winnerMessage = document.getElementById('winnerMessage');
        this.playAgainBtn = document.getElementById('playAgainBtn');
        this.lobbyModal = document.getElementById('lobbyModal');
        this.gameWrapper = document.querySelector('.game-wrapper');
        
        // Lobby elements
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
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            alert('Disconnected from server. Please refresh the page.');
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            alert('Cannot connect to server. Make sure the server is running on port 3000.\n\nTo start the server, run:\nnpm install\nnpm start');
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
            this.timeRemaining = 60;
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
    }
    
    attachEventListeners() {
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
        
        this.playAgainBtn.addEventListener('click', () => {
            this.gameOverModal.classList.remove('show');
            this.resetToLobby();
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
            const cell = document.elementFromPoint(touch.clientX, touch.clientY);
            if (cell && cell.classList.contains('cell')) {
                this.handleMouseDown({ target: cell, preventDefault: () => {} });
            }
        });
        this.gameBoard.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const cell = document.elementFromPoint(touch.clientX, touch.clientY);
            if (cell && cell.classList.contains('cell')) {
                this.handleMouseMove({ target: cell });
            }
        });
        this.gameBoard.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleMouseUp(e);
        });
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
        
        // Allow starting selection on the game board itself (negative space)
        const cell = e.target.closest('.cell');
        if (cell && cell.classList.contains('cleared')) return;
        
        e.preventDefault();
        this.isSelecting = true;
        
        // Get the cell index, or calculate from mouse position
        let index = null;
        if (cell && !cell.classList.contains('cleared')) {
            index = this.getCellIndex(cell);
        } else {
            // Calculate cell from mouse position on game board
            index = this.getCellFromPosition(e);
        }
        
        if (index) {
            this.selectionStart = index;
            this.selectedCells.clear();
            this.createSelectionBox();
            this.addToSelection(index);
            this.updateSelectionBox();
        }
    }
    
    handleMouseMove(e) {
        if (!this.isSelecting || !this.gameActive || this.finished) return;
        
        // Calculate cell from mouse position
        const index = this.getCellFromPosition(e);
        if (index && this.selectionStart) {
            this.updateSelection(this.selectionStart, index);
        }
    }
    
    getCellFromPosition(e) {
        const rect = this.gameBoard.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Calculate which cell the mouse is over
        const cellWidth = rect.width / this.COLS;
        const cellHeight = rect.height / this.ROWS;
        const gap = 2; // gap between cells
        
        const col = Math.floor((x + gap) / (cellWidth + gap));
        const row = Math.floor((y + gap) / (cellHeight + gap));
        
        if (row >= 0 && row < this.ROWS && col >= 0 && col < this.COLS) {
            return { row, col };
        }
        return null;
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
        
        if (this.selectedCells.size === 0) {
            this.selectionBox.style.display = 'none';
            return;
        }
        
        const cells = Array.from(this.selectedCells).map(key => {
            const [row, col] = key.split(',').map(Number);
            return { row, col };
        });
        
        if (cells.length === 0) {
            this.selectionBox.style.display = 'none';
            return;
        }
        
        const rows = cells.map(c => c.row);
        const cols = cells.map(c => c.col);
        const minRow = Math.min(...rows);
        const maxRow = Math.max(...rows);
        const minCol = Math.min(...cols);
        const maxCol = Math.max(...cols);
        
        const rect = this.gameBoard.getBoundingClientRect();
        const cellWidth = (rect.width - (this.COLS + 1) * 2) / this.COLS;
        const cellHeight = (rect.height - (this.ROWS + 1) * 2) / this.ROWS;
        const gap = 2;
        
        const left = minCol * (cellWidth + gap) + gap + 2; // +2 for padding
        const top = minRow * (cellHeight + gap) + gap + 2; // +2 for padding
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
        
        if (this.selectedCells.size > 0 && this.roomId && this.playerNumber) {
            const cells = Array.from(this.selectedCells).map(key => {
                const [row, col] = key.split(',').map(Number);
                return { row, col };
            });
            this.socket.emit('select-cells', {
                roomId: this.roomId,
                cells: cells,
                playerNumber: this.playerNumber
            });
        }
        this.clearSelection();
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
        
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cellData = this.board[row][col];
                if (!cellData.cleared) {
                    this.addToSelection({ row, col });
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
            if (this.opponentFinished) {
                this.score2El.textContent = this.opponentScore;
            }
        } else {
            this.score2El.textContent = this.score;
            if (this.opponentFinished) {
                this.score1El.textContent = this.opponentScore;
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
        this.gameActive = false;
        this.finished = false;
        this.opponentFinished = false;
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
        this.timerEl.textContent = '60';
        this.timerEl.classList.remove('warning');
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
