export const handleMatchmakingVsNpc = (io, socket, games) => {
  console.log("Avviando partita contro NPC...");

  const gameId = Math.random().toString(36).substring(2, 9);
  const npcId = "npc-" + Math.random().toString(36).substring(2, 9);

  const game = {
    id: gameId,
    name: "Partita contro NPC",
    teams: [
      { name: "Squadra 1", players: [socket.id] },
      { name: "Squadra 2", players: [npcId] },
    ],
    status: "started",
    currentTurnIndex: 0,
    allPlayers: [socket.id, npcId],
  };

  console.log("socket.id", socket.id);
  games[gameId] = game;

  socket.join(gameId);

  io.to(socket.id).emit("game-started", {
    gameId: game.id,
    team: "Squadra 1",
  });

  //   io.to(gameId).emit("turn-update", {
  //     currentPlayerId: game.allPlayers[0],
  //   });
  //   setTimeout(() => {
  //     io.to(gameId).emit("game-update", game);
  //   }, 100);

  //   // Gestisci la fine del turno
  //   socket.on("end-turn", (gameId) => {
  //     const game = games[gameId];
  //     if (!game) return;

  //     game.currentTurnIndex =
  //       (game.currentTurnIndex + 1) % game.allPlayers.length;
  //     const nextPlayerId = game.allPlayers[game.currentTurnIndex];

  //     io.to(gameId).emit("turn-update", {
  //       currentPlayerId: nextPlayerId,
  //     });
  //   });

  //   io.to(gameId).emit("game-update", game);
};
