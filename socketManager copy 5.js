import { Server } from "socket.io";
import { handleMatchmaking1v1 } from "./matchmaking1v1.js";
import { handleMatchmaking2v2 } from "./matchmaking2v2.js";
import { handleMatchmakingVsNpc } from "./matchmakingVsNpc.js";

let games = {};

export const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    console.log(`Giocatore connesso: ${socket.id}`);

    // Matchmaking invariato
    socket.on("matchmaking-1v1", (deck) =>
      handleMatchmaking1v1(io, socket, games, deck)
    );
    socket.on("matchmaking-2v2", (data) =>
      handleMatchmaking2v2(io, socket, games, data)
    );
    socket.on("matchmaking-vs-npc", () =>
      handleMatchmakingVsNpc(io, socket, games)
    );

    socket.on("join-game", (gameId) => {
      const g = games[gameId];
      if (!g) return socket.emit("error", "Partita non trovata");
      socket.join(gameId);
      io.to(gameId).emit("game-update", g);
    });

    // Giocata di carte (HERO o MAGIC)
    socket.on("play-card", ({ gameId, card }) =>
      handlePlayCard(io, socket, games, gameId, card)
    );

    // Attacco
    socket.on("attack", ({ gameId, attacker, target }) =>
      handleAttack(io, socket, games, gameId, attacker, target)
    );

    // Fine turno
    socket.on("end-turn", (gameId) => handleEndTurn(io, games, gameId));

    socket.on("leave-game", (gameId) =>
      handleLeave(io, games, gameId, socket.id)
    );
    socket.on("disconnect", () => console.log(`Disconnesso ${socket.id}`));
  });
};

// Handler: play-card
function handlePlayCard(io, socket, games, gameId, card) {
  const g = games[gameId];
  if (!g) return;
  const pid = socket.id;
  // Rimuovi dalla mano
  g.hands[pid] = g.hands[pid].filter((c) => c.id !== card.id);
  // Se HERO, evoca con justPlayed=true
  if (card.type === "HERO") {
    if (!g.boards[pid]) g.boards[pid] = [];
    if (g.boards[pid].length < 6) {
      g.boards[pid].push({ ...card, justPlayed: true });
    }
  }
  // Se MAGIC, applica effetto (da implementare)
  // Emetti update
  io.to(gameId).emit("game-update", g);
}

// Handler: attacco
function handleAttack(io, socket, games, gameId, attacker, target) {
  const g = games[gameId];
  if (!g) return;

  const pid = socket.id;
  const board = g.boards[pid] || [];
  const att = board.find((c) => c.id === attacker.id);

  if (!att || att.justPlayed) {
    return socket.emit("error", "Non puoi attaccare");
  }

  if (target.type === "CREATURE") {
    const oppBoard = g.boards[target.playerId] || [];
    const def = oppBoard.find((c) => c.id === target.id);
    if (!def) return;

    if (att.attack >= def.defense) {
      g.boards[target.playerId] = oppBoard.filter((c) => c.id !== def.id);
    }
    if (def.attack >= att.defense) {
      g.boards[pid] = board.filter((c) => c.id !== att.id);
    }
  } else if (target.type === "HERO") {
    g.health[target.playerId] -= att.attack;
    if (g.health[target.playerId] <= 0) {
      io.to(gameId).emit("game-over", { winner: pid });
    }
  }

  att.justPlayed = true;
  io.to(gameId).emit("game-update", g);
}
function handleEndTurn(io, games, gameId) {
  const g = games[gameId];
  if (!g) return;

  // Passa il turno
  g.currentTurnIndex = (g.currentTurnIndex + 1) % g.allPlayers.length;
  const current = g.allPlayers[g.currentTurnIndex];
  g.currentPlayerId = current;

  // Assicura che boards, decks, hands siano inizializzati per current
  g.boards = g.boards || {};
  g.decks = g.decks || {};
  g.hands = g.hands || {};
  g.crystals = g.crystals || {};

  g.boards[current] = g.boards[current] || [];
  g.decks[current] = g.decks[current] || 0;
  g.hands[current] = g.hands[current] || [];

  // Pesca 1 carta
  const card = g.decks[current].shift();
  if (card) g.hands[current].push(card);

  // Cristallo +1 (max 10)
  g.crystals[current] = Math.min((g.crystals[current] || 0) + 1, 10);

  // Rimuove summoning sickness
  g.boards[current].forEach((c) => (c.justPlayed = false));

  // Aggiorna client
  io.to(gameId).emit("turn-update", {
    currentPlayerId: current,
    crystals: g.crystals[current],
  });
  io.to(gameId).emit("game-update", g);
}

// Handler: leave
function handleLeave(io, games, gameId, pid) {
  const g = games[gameId];
  if (!g) return;
  g.allPlayers = g.allPlayers.filter((id) => id !== pid);
  delete g.boards[pid];
  delete g.hands[pid];
  delete g.crystals[pid];
  io.to(gameId).emit("game-update", g);
}
