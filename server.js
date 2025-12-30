const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    transports: ['websocket'],
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// --- Game Data and State ---

const POINT_CARDS = [
    { name: 'クルーズ船', value: 600, img: 'クルーズ船.png' },
    { name: 'ダイヤ', value: 800, img: 'ダイヤ.png' },
    { name: 'タワーマンション', value: 700, img: 'タワーマンション.png' },
    { name: 'プライベートアイランド', value: 1000, img: 'プライベートアイランド.png' },
    { name: 'ロケット', value: 900, img: 'ロケット.png' },
    { name: 'ワイン', value: 200, img: 'ワイン.png' },
    { name: '絵画', value: 400, img: '絵画.png' },
    { name: '空中庭園都市', value: 500, img: '空中庭園都市.png' },
    { name: '未公開株', value: 300, img: '未公開株.png' },
    { name: '大暴落', value: -500, img: '大暴落.png' }, // This card has a special effect
];

const MONEY_CARDS = {
    '100億': 100,
    '500億': 500,
    '1000億': 1000,
};

let gameState = {
    players: {}, // Key: socket.id
    deck: [],
    auctionMaster: null,
    currentAuctionCard: null,
    highestBid: {
        bidder: null,
        amount: 0,
    },
    gamePhase: 'waiting', // waiting, auction, bidding, result
};

// --- Socket.IO Connection Handling ---

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // Add new player
    const playerNumber = Object.keys(gameState.players).length + 1;
    gameState.players[socket.id] = {
        id: socket.id,
        name: `プレイヤー ${playerNumber}`,
        money: 0,
        pointCards: [],
        dealtCard: null,
    };
    console.log(`Current players: ${Object.keys(gameState.players).length}`);
    io.emit('update-game-state', gameState); // Notify clients of new player

    // Start game when 3 players have joined
    if (Object.keys(gameState.players).length === 3 && gameState.gamePhase === 'waiting') {
        startGame();
    }

    socket.on('declare-auction-item', ({ itemName }) => {
        if (socket.id === gameState.auctionMaster && gameState.gamePhase === 'auction') {
            console.log(`Master ${socket.id} declared item: ${itemName}`);
            gameState.declaredItemName = itemName;
            gameState.gamePhase = 'bidding';
            io.emit('update-game-state', gameState);
            io.emit('new-declaration', `親が「${itemName}」のオークションを開始しました！`);
        }
    });

    socket.on('place-bid', ({ amount }) => {
        const player = gameState.players[socket.id];

        // Validations
        if (gameState.gamePhase !== 'bidding') {
            socket.emit('error', '入札フェーズではありません。');
            return;
        }
        if (socket.id === gameState.auctionMaster) {
            socket.emit('error', '親は入札できません。');
            return;
        }
        if (amount <= gameState.highestBid.amount) {
            socket.emit('error', `入札額は現在の最高入札額 ${gameState.highestBid.amount}億 より大きくする必要があります。`);
            return;
        }
        if (amount > player.money) {
            socket.emit('error', `所持金が足りません。現在の所持金は ${player.money}億 です。`);
            return;
        }

        gameState.highestBid.amount = amount;
        gameState.highestBid.bidder = socket.id;
        io.emit('update-game-state', gameState);
        io.emit('new-bid', `${player.name}が${amount}億で入札しました！`);
        console.log(`${player.name} bid ${amount}億`);
    });

    socket.on('call-liar', () => {
        const caller = gameState.players[socket.id];
        if (gameState.gamePhase !== 'bidding') {
            socket.emit('error', 'ライアーコールは入札フェーズでのみ行えます。');
            return;
        }
        if (gameState.highestBid.bidder === null) {
            socket.emit('error', 'まだ誰も入札していません。');
            return;
        }
        if (socket.id === gameState.auctionMaster) {
            socket.emit('error', '親はライアーコールできません。');
            return;
        }

        console.log(`${caller.name} called LIAR!`);
        resolveLiarCall(socket.id);
    });

    socket.on('end-bidding', () => {
        if (socket.id !== gameState.auctionMaster || gameState.gamePhase !== 'bidding') {
            return; // Ignore if not from master or not in bidding phase
        }
        
        if (gameState.highestBid.bidder === null) {
            io.emit('auction-result', '入札者がいなかったため、オークションは終了しました。');
             setTimeout(() => startNextRound(), 3000);
            return;
        }
        
        gameState.gamePhase = 'result';
        const master = gameState.players[gameState.auctionMaster];
        const highestBidder = gameState.players[gameState.highestBid.bidder];
        const bidAmount = gameState.highestBid.amount;
        const masterCard = master.dealtCard;

        highestBidder.money -= bidAmount;
        master.money += bidAmount;
        highestBidder.pointCards.push(masterCard);
        
        gameState.currentAuctionCard = masterCard;

        const message = `親が入札を終了しました。\n最高入札者(${highestBidder.name})が${bidAmount}億で「${gameState.declaredItemName}」(実際のカードは「${masterCard.name}」)を落札しました。`;

        io.emit('update-game-state', gameState);
        io.emit('auction-result', message);

        setTimeout(() => startNextRound(), 5000);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        delete gameState.players[socket.id];
        // TODO: Handle disconnection during a game (e.g., reset game)
        io.emit('update-game-state', gameState); // Notify clients of player leaving
    });
});

// --- Game Logic Functions ---

function resolveLiarCall(callerId) {
    gameState.gamePhase = 'result';
    const master = gameState.players[gameState.auctionMaster];
    const highestBidder = gameState.players[gameState.highestBid.bidder];
    const bidAmount = gameState.highestBid.amount;
    const masterCard = master.dealtCard;
    const wasLying = masterCard.name !== gameState.declaredItemName;

    let message = `「ライアー！」コール！ 親のカードは「${masterCard.name}」でした。\n`;
    message += `宣言は「${gameState.declaredItemName}」だったので…\n`;

    if (wasLying) {
        message += `親は嘘をついていました！\n`;
        message += `親(${master.name})が、最高入札者(${highestBidder.name})に${bidAmount}億を支払います。`;
        master.money -= bidAmount;
        highestBidder.money += bidAmount;
    } else {
        message += `親は真実を言っていました！\n`;
        message += `最高入札者(${highestBidder.name})が、親(${master.name})に${bidAmount}億を支払います。\n`;
        message += `${highestBidder.name}が「${masterCard.name}」を獲得しました。`;
        highestBidder.money -= bidAmount;
        master.money += bidAmount;
        highestBidder.pointCards.push(masterCard);
    }
    
    // Show the card that was up for auction
    gameState.currentAuctionCard = masterCard;

    io.emit('update-game-state', gameState);
    io.emit('liar-result', message);

    // Start next round after a delay
    setTimeout(() => {
        startNextRound();
    }, 5000); // 5 second delay
}

function startNextRound() {
    console.log("--- Starting Next Round ---");
    // Check for game end condition
    if (gameState.deck.length < Object.keys(gameState.players).length) {
        // Not enough cards to deal, end the game
        endGame();
        return;
    }

    // Reset round-specific state
    gameState.currentAuctionCard = null;
    gameState.declaredItemName = null;
    gameState.highestBid = { bidder: null, amount: 0 };
    gameState.gamePhase = 'auction';

    // Rotate auction master
    const playerIds = Object.keys(gameState.players);
    const currentMasterIndex = playerIds.indexOf(gameState.auctionMaster);
    const nextMasterIndex = (currentMasterIndex + 1) % playerIds.length;
    gameState.auctionMaster = playerIds[nextMasterIndex];

    // Deal new cards
    playerIds.forEach(id => {
        gameState.players[id].dealtCard = gameState.deck.pop();
    });

    io.emit('update-game-state', gameState);
    io.emit('new-round', `次のラウンドを開始します。新しい親は ${gameState.players[gameState.auctionMaster].name} です。`);
    console.log(`New master: ${gameState.players[gameState.auctionMaster].name}`);
}

function endGame() {
    console.log("--- Game Over ---");
    gameState.gamePhase = 'end';
    let finalStandings = [];

    for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        let totalValueFromCards = 0;
        let hasBigCrash = false;
        let mostValuableCardValue = 0;
        let cardsForCalc = [...player.pointCards];

        // Check for '大暴落' card
        const crashCardIndex = cardsForCalc.findIndex(card => card.name === '大暴落');
        if (crashCardIndex > -1) {
            hasBigCrash = true;
            // Remove the crash card itself to not count it as the most valuable
            const crashCard = cardsForCalc.splice(crashCardIndex, 1)[0];
            totalValueFromCards += crashCard.value; // Add its negative value
        }

        // Find the most valuable card if player has Big Crash
        if (hasBigCrash && cardsForCalc.length > 0) {
            cardsForCalc.sort((a, b) => b.value - a.value);
            mostValuableCardValue = cardsForCalc[0].value;
            cardsForCalc.shift(); // Remove the most valuable card from calculation
            console.log(`${player.name} had '大暴落', nullifying a card worth ${mostValuableCardValue}`);
        }
        
        // Calculate total value from remaining cards
        totalValueFromCards += cardsForCalc.reduce((sum, card) => sum + card.value, 0);
        
        player.finalAssets = player.money + totalValueFromCards;
        finalStandings.push({ name: player.name, assets: player.finalAssets });
    }

    // Sort by final assets to find winner
    finalStandings.sort((a, b) => b.assets - a.assets);
    const winner = finalStandings[0];

    let message = `ゲーム終了！\n---最終結果---\n`;
    finalStandings.forEach((player, index) => {
        message += `${index + 1}. ${player.name}: ${player.assets}億\n`;
    });
    message += `\n勝者は ${winner.name} です！`;

    io.emit('update-game-state', gameState);
    io.emit('game-over', message);
}


server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
