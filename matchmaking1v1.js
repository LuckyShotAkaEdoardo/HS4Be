// ✅ matchmaking1v1.js (aggiornato con username al posto di socket.id)

export const matchmakingQueue1v1 = [];

export const handleMatchmaking1v1 = (
  io,
  socket,
  games,
  playerDeck,
  emitSanitizedGameUpdate
) => {
  const username = socket.username;
  if (!username) return;

  console.log("Richiesta matchmaking 1v1 da", username);
  matchmakingQueue1v1.push({ socket, deck: playerDeck });

  if (matchmakingQueue1v1.length >= 2) {
    const player1Data = matchmakingQueue1v1.shift();
    const player2Data = matchmakingQueue1v1.shift();

    const p1 = player1Data.socket;
    const p2 = player2Data.socket;
    const u1 = p1.username;
    const u2 = p2.username;

    const fullDeck1 = assignUniqueIds(shuffle([...player1Data.deck]));
    const fullDeck2 = assignUniqueIds(shuffle([...player2Data.deck]));
    const hand1 = fullDeck1.splice(0, 4);
    const hand2 = fullDeck2.splice(0, 4);

    const gameId = Math.random().toString(36).substring(2, 9);
    const game = {
      id: gameId,
      name: "1v1 Match",
      teams: [
        { name: "Squadra 1", username: u1, players: [u1] },
        { name: "Squadra 2", username: u2, players: [u2] },
      ],
      status: "started",
      currentTurnIndex: 0,
      allPlayers: [u1, u2],
      currentPlayerId: u1,
      crystals: {
        [u1]: 1,
        [u2]: 1,
      },
      maxCrystals: {
        [u1]: 1,
        [u2]: 1,
      },
      health: {
        [u1]: 20,
        [u2]: 20,
      },
      decks: {
        [u1]: fullDeck1,
        [u2]: fullDeck2,
      },
      hands: {
        [u1]: hand1,
        [u2]: hand2,
      },
      boards: {
        [u1]: [],
        [u2]: [],
      },
      usernames: {
        [u1]: p1.id,
        [u2]: p2.id,
      },
    };

    games[gameId] = game;

    [p1, p2].forEach((playerSocket) => {
      const uname = playerSocket.username;
      const team = game.teams.find((t) => t.players.includes(uname));

      playerSocket.join(gameId);

      // ✅ Evento di inizio partita personalizzato
      playerSocket.emit("game-started", {
        gameId,
        team: {
          name: team.name,
          username: team.username,
        },
        crystals: game.crystals[uname],
        health: game.health,
        hand: game.hands[uname],
        deckLength: game.decks[uname]?.length || 0,
      });

      // ✅ Invia player-id solo al rispettivo socket
      playerSocket.emit("player-id", uname);
    });

    // 🔄 Aggiorna turno
    const firstPlayer = game.allPlayers[0];
    io.to(gameId).emit("turn-update", {
      currentPlayerId: firstPlayer,
      crystals: game.crystals[firstPlayer],
    });

    emitSanitizedGameUpdate(io, game);
    console.log(`🟢 1v1 avviata tra ${u1} e ${u2} → gameId: ${gameId}`);
  }
};
export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
let globalCardId = 1; // contatore globale per ID univoci

function assignUniqueIds(deck) {
  return deck.map((card) => ({
    ...card,
    id: globalCardId++,
  }));
}
