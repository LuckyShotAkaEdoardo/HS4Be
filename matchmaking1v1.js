const matchmakingQueue1v1 = [];

export const handleMatchmaking1v1 = (io, socket, games, playerDeck) => {
  console.log("Richiesta matchmaking 1v1 da", socket.id);

  // Salva sia il socket sia il deck del giocatore
  matchmakingQueue1v1.push({ socket, deck: playerDeck });

  if (matchmakingQueue1v1.length >= 2) {
    const player1Data = matchmakingQueue1v1.shift();
    const player2Data = matchmakingQueue1v1.shift();

    const player1 = player1Data.socket;
    const player2 = player2Data.socket;

    const deck1 = player1Data.deck;
    const deck2 = player2Data.deck;

    const gameId = Math.random().toString(36).substring(2, 9);
    const game = {
      id: gameId,
      name: "1v1 Match",
      teams: [
        { name: "Squadra 1", players: [player1.id] },
        { name: "Squadra 2", players: [player2.id] },
      ],
      status: "started",
      currentTurnIndex: 0,
      allPlayers: [player1.id, player2.id],
      crystals: {
        [player1.id]: 1,
        [player2.id]: 1,
      },
      health: {
        [player1.id]: 20,
        [player2.id]: 20,
      },
      decks: {
        [player1.id]: deck1,
        [player2.id]: deck2,
      },
      hands: {
        [player1.id]: deck1.slice(0, 4),
        [player2.id]: deck2.slice(0, 4),
      },
    };
    game.currentPlayerId = game.allPlayers[game.currentTurnIndex];

    games[gameId] = game;

    player1.join(gameId);
    player2.join(gameId);

    [player1, player2].forEach((playerSocket) => {
      const team = game.teams.find((t) => t.players.includes(playerSocket.id));
      io.to(playerSocket.id).emit("game-started", {
        gameId,
        team: team.name,
        crystals: game.crystals[playerSocket.id],
        health: game.health,
        hand: game.hands[playerSocket.id],
      });
    });

    const firstPlayer = game.allPlayers[0];
    io.to(gameId).emit("turn-update", {
      currentPlayerId: firstPlayer,
      crystals: game.crystals[firstPlayer],
    });

    io.to(gameId).emit("game-update", game);
    console.log(`1v1 partita avviata: ${gameId}`);
  }
};
