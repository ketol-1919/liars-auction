const socket = io();
let myPlayerId = null;

socket.on('connect', () => {
    console.log('Connected to server!');
    myPlayerId = socket.id;
});

socket.on('game-started', (gameState) => {
    addLogMessage('ゲームが開始されました！');
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game-container').style.display = 'grid';
});

socket.on('update-game-state', (gameState) => {
    window.gameState = gameState; // Keep global state in sync
    console.log('Received game state update:', gameState);
    if (gameState.gamePhase === 'waiting') {
        renderLobby(gameState);
    } else {
        renderGameUI(gameState);
    }
});

socket.on('new-declaration', (message) => {
    addLogMessage(message);
});

socket.on('new-bid', (message) => {
    addLogMessage(message);
});

socket.on('liar-result', (message) => {
    addLogMessage(message, 'result');
});

socket.on('auction-result', (message) => {
    addLogMessage(message, 'result');
});

socket.on('new-round', (message) => {
    addLogMessage(message);
});

socket.on('game-over', (message) => {
    addLogMessage(message, 'result');
});

socket.on('error', (message) => {
    addLogMessage('エラー: ' + message, 'error');
    alert('エラー: ' + message); // Keep alert for immediate feedback on errors

    // If the host gets an error after trying to start, reset the button
    if (myPlayerId === window.gameState.hostId) {
        const startButton = document.getElementById('start-game-button');
        startButton.disabled = false;
        startButton.textContent = 'ゲーム開始 (3-4人)';
    }
});

function addLogMessage(message, type = 'info') {
    const logContainer = document.getElementById('game-log');
    const newLog = document.createElement('p');
    newLog.textContent = message.replace(/\n/g, ' '); // Replace newlines for better log format
    if (type === 'error') {
        newLog.style.color = 'red';
        newLog.style.fontWeight = 'bold';
    }
    if (type === 'result') {
        newLog.style.backgroundColor = '#e6ffe6';
        newLog.style.fontWeight = 'bold';
    }
    logContainer.appendChild(newLog);
    // Auto-scroll to the bottom
    logContainer.scrollTop = logContainer.scrollHeight;
}

document.getElementById('start-game-button').addEventListener('click', () => {
    const startButton = document.getElementById('start-game-button');
    startButton.disabled = true;
    startButton.textContent = '読み込み中...';
    socket.emit('request-start-game');
});

// Store gameState globally to access it in the error handler
window.gameState = {};

function renderLobby(gameState) {
    window.gameState = gameState; // Update global state
    const lobbyPlayerList = document.getElementById('lobby-player-list');
    const startButton = document.getElementById('start-game-button');
    const startMessage = document.getElementById('start-game-message');

    lobbyPlayerList.innerHTML = '';
    for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        const playerItem = document.createElement('li');
        let text = player.name;
        if (player.id === myPlayerId) {
            text += ' (あなた)';
        }
        if (player.id === gameState.hostId) {
            text += ' ★ホスト';
        }
        playerItem.textContent = text;
        lobbyPlayerList.appendChild(playerItem);
    }

    if (myPlayerId === gameState.hostId) {
        startButton.style.display = 'block';
        startMessage.style.display = 'none';
    } else {
        startButton.style.display = 'none';
        startMessage.style.display = 'block';
    }
}

document.getElementById('declare-item').addEventListener('click', () => {
    const itemName = document.getElementById('declare-item-name').value;
    if (itemName) {
        socket.emit('declare-auction-item', { itemName });
    } else {
        alert('宣言するカード名を入力してください。');
    }
});

document.getElementById('place-bid').addEventListener('click', () => {
    const bidAmountInput = document.getElementById('bid-amount');
    const bidAmount = parseInt(bidAmountInput.value, 10);

    if (isNaN(bidAmount) || bidAmount <= 0) {
        alert('有効な入札額を入力してください。');
        return;
    }
    socket.emit('place-bid', { amount: bidAmount });
    bidAmountInput.value = ''; // Clear input after bidding
});

document.getElementById('call-liar').addEventListener('click', () => {
    // Confirmation before calling liar
    if (confirm('本当に「ライアー！」とコールしますか？')) {
        socket.emit('call-liar');
    }
});

document.getElementById('end-bidding').addEventListener('click', () => {
    socket.emit('end-bidding');
});

function renderGameUI(gameState) {
    const isMaster = gameState.auctionMaster === myPlayerId;

    // Render Players
    const playerListDiv = document.getElementById('player-list');
    playerListDiv.innerHTML = ''; // Clear existing players

    for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        const playerArea = document.createElement('div');
        playerArea.className = 'player-area';
        playerArea.id = `player-${player.id}`;
        if (player.id === myPlayerId) {
            playerArea.style.borderColor = '#007bff';
            playerArea.style.borderWidth = '3px';
        }
        if (player.id === gameState.auctionMaster) {
             playerArea.style.backgroundColor = '#fffbe6';
        }

        let playerHTML = `<h3>${player.name} ${player.id === myPlayerId ? '(あなた)' : ''} ${player.id === gameState.auctionMaster ? ' (親)' : ''}</h3>`;
        playerHTML += `<p>所持金: <span class="player-money-display">${player.money}億</span></p>`;

        if (player.id === myPlayerId && player.dealtCard) {
            playerHTML += `<h4>あなたのカード:</h4>
                           <img src="assets/ポイントカード/${player.dealtCard.img}" alt="${player.dealtCard.name}" class="card-image" title="${player.dealtCard.name}">`;
        }

        playerHTML += `<h4>獲得カード:</h4><div class="player-cards">`;
        player.pointCards.forEach(card => {
            playerHTML += `<img src="assets/ポイントカード/${card.img}" alt="${card.name}" class="card-image" title="${card.name}">`;
        });
        playerHTML += `</div>`;

        playerArea.innerHTML = playerHTML;
        playerListDiv.appendChild(playerArea);
    }

    // Render Game Info
    const masterName = gameState.auctionMaster ? gameState.players[gameState.auctionMaster].name : 'なし';
    document.getElementById('current-master').textContent = `現在の親: ${masterName}`;
    document.getElementById('current-bid').textContent = `現在の入札額: ${gameState.highestBid.amount}億`;

    // Render Controls
    const masterControls = document.getElementById('master-controls');
    const biddingControls = document.getElementById('bidding-controls');
    const declareItemButton = document.getElementById('declare-item');
    const declareItemInput = document.getElementById('declare-item-name');
    const endBiddingButton = document.getElementById('end-bidding');

    // Hide all controls first
    masterControls.style.display = 'none';
    biddingControls.style.display = 'none';
    declareItemButton.style.display = 'none';
    declareItemInput.style.display = 'none';
    endBiddingButton.style.display = 'none';

    if (isMaster) {
        masterControls.style.display = 'block';
        if (gameState.gamePhase === 'auction') {
            declareItemButton.style.display = 'inline-block';
            declareItemInput.style.display = 'inline-block';
        } else if (gameState.gamePhase === 'bidding') {
            endBiddingButton.style.display = 'inline-block';
        }
    } else { // Not the master
        if (gameState.gamePhase === 'bidding') {
            biddingControls.style.display = 'block';
        }
    }

    // Render Auction Item
    const currentAuctionCard = document.getElementById('current-auction-card');
    if (gameState.gamePhase === 'result' && gameState.currentAuctionCard) {
        currentAuctionCard.src = `assets/ポイントカード/${gameState.currentAuctionCard.img}`;
        currentAuctionCard.style.display = 'block';
    } else {
        currentAuctionCard.style.display = 'none';
    }
}

document.getElementById('place-bid').addEventListener('click', () => {
    const bidAmountInput = document.getElementById('bid-amount');
    const bidAmount = parseInt(bidAmountInput.value, 10);

    if (isNaN(bidAmount) || bidAmount <= 0) {
        alert('有効な入札額を入力してください。');
        return;
    }
    socket.emit('place-bid', { amount: bidAmount });
    bidAmountInput.value = ''; // Clear input after bidding
});

document.getElementById('call-liar').addEventListener('click', () => {
    // Confirmation before calling liar
    if (confirm('本当に「ライアー！」とコールしますか？')) {
        socket.emit('call-liar');
    }
});

document.getElementById('end-bidding').addEventListener('click', () => {
    socket.emit('end-bidding');
});


function renderGameUI(gameState) {
    const isMaster = gameState.auctionMaster === myPlayerId;

    // Render Players
    const playerListDiv = document.getElementById('player-list');
    playerListDiv.innerHTML = ''; // Clear existing players

    for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        const playerArea = document.createElement('div');
        playerArea.className = 'player-area';
        playerArea.id = `player-${player.id}`;
        if (player.id === myPlayerId) {
            playerArea.style.borderColor = '#007bff';
            playerArea.style.borderWidth = '3px';
        }
        if (player.id === gameState.auctionMaster) {
             playerArea.style.backgroundColor = '#fffbe6';
        }

        let playerHTML = `<h3>${player.name} ${player.id === myPlayerId ? '(あなた)' : ''} ${player.id === gameState.auctionMaster ? ' (親)' : ''}</h3>`;
        playerHTML += `<p>所持金: <span class="player-money-display">${player.money}億</span></p>`;

        if (player.id === myPlayerId && player.dealtCard) {
            playerHTML += `<h4>あなたのカード:</h4>
                           <img src="assets/ポイントカード/${player.dealtCard.img}" alt="${player.dealtCard.name}" class="card-image" title="${player.dealtCard.name}">`;
        }

        playerHTML += `<h4>獲得カード:</h4><div class="player-cards">`;
        player.pointCards.forEach(card => {
            playerHTML += `<img src="assets/ポイントカード/${card.img}" alt="${card.name}" class="card-image" title="${card.name}">`;
        });
        playerHTML += `</div>`;

        playerArea.innerHTML = playerHTML;
        playerListDiv.appendChild(playerArea);
    }

    // Render Game Info
    const masterName = gameState.auctionMaster ? gameState.players[gameState.auctionMaster].name : 'なし';
    document.getElementById('current-master').textContent = `現在の親: ${masterName}`;
    document.getElementById('current-bid').textContent = `現在の入札額: ${gameState.highestBid.amount}億`;

    // Render Controls
    const masterControls = document.getElementById('master-controls');
    const biddingControls = document.getElementById('bidding-controls');
    const declareItemButton = document.getElementById('declare-item');
    const declareItemInput = document.getElementById('declare-item-name');
    const endBiddingButton = document.getElementById('end-bidding');

    // Hide all controls first
    masterControls.style.display = 'none';
    biddingControls.style.display = 'none';
    declareItemButton.style.display = 'none';
    declareItemInput.style.display = 'none';
    endBiddingButton.style.display = 'none';

    if (isMaster) {
        masterControls.style.display = 'block';
        if (gameState.gamePhase === 'auction') {
            declareItemButton.style.display = 'inline-block';
            declareItemInput.style.display = 'inline-block';
        } else if (gameState.gamePhase === 'bidding') {
            endBiddingButton.style.display = 'inline-block';
        }
    } else { // Not the master
        if (gameState.gamePhase === 'bidding') {
            biddingControls.style.display = 'block';
        }
    }

    // Render Auction Item
    const currentAuctionCard = document.getElementById('current-auction-card');
    if (gameState.gamePhase === 'result' && gameState.currentAuctionCard) {
        currentAuctionCard.src = `assets/ポイントカード/${gameState.currentAuctionCard.img}`;
        currentAuctionCard.style.display = 'block';
    } else {
        currentAuctionCard.style.display = 'none';
    }
}

