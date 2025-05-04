const matchmakingQueue2v2 = [];

export const handleMatchmaking2v2 = (io, socket, games) => {
  console.log("Richiesta matchmaking 2v2 da", socket.id);

  matchmakingQueue2v2.push(socket);

  if (matchmakingQueue2v2.length >= 4) {
    const players = [
      matchmakingQueue2v2.shift(),
      matchmakingQueue2v2.shift(),
      matchmakingQueue2v2.shift(),
      matchmakingQueue2v2.shift(),
    ];

    const gameId = Math.random().toString(36).substring(2, 9);
    const team1 = [players[0].id, players[2].id]; // Alternati
    const team2 = [players[1].id, players[3].id];

    const game = {
      id: gameId,
      name: "2v2 Match",
      teams: [
        { name: "Squadra 1", players: team1 },
        { name: "Squadra 2", players: team2 },
      ],
      status: "started",
      currentTurnIndex: 0,
      allPlayers: [players[0].id, players[1].id, players[2].id, players[3].id], // ordine turni
    };

    games[gameId] = game;

    players.forEach((playerSocket) => {
      playerSocket.join(gameId);
      const team = game.teams.find((t) => t.players.includes(playerSocket.id));
      io.to(playerSocket.id).emit("game-started", {
        gameId,
        team: team.name,
      });
    });

    const firstPlayer = game.allPlayers[0];
    io.to(gameId).emit("turn-update", {
      currentPlayerId: firstPlayer,
    });

    console.log(`2v2 partita avviata: ${gameId}`);
  }
};
