import { Server } from "socket.io";
import { matchmakingQueue1v1, handleMatchmaking1v1 } from "./matchmaking1v1.js";
import { handleMatchmaking2v2 } from "./matchmaking2v2.js";
import { handleMatchmakingVsNpc } from "./matchmakingVsNpc.js";

let games = {};
const usernameToSocketId = {};

export const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    console.log(`Giocatore connesso: ${socket.id}`);
    socket.emit("do-login");
    socket.on("login", ({ username }) => {
      if (!username || typeof username !== "string") return;

      // 🔒 Protezione: se username già connesso, blocca il nuovo login
      const existingSocketId = usernameToSocketId[username];
      if (existingSocketId && existingSocketId !== socket.id) {
        const stillConnected = io.sockets.sockets.has(existingSocketId);
        if (stillConnected) {
          socket.emit("login-error", "Questo username è già in uso.");
          return;
        } else {
          // Se il socket precedente non è più attivo, rimuovilo
          delete usernameToSocketId[username];
        }
      }

      // ✅ Registra l'username sul socket e nella mappa globale
      socket.username = username;
      usernameToSocketId[username] = socket.id;
      console.log(`[LOGIN] ${username} collegato con socket ID ${socket.id}`);

      // 🔁 Controlla se deve rientrare in una partita attiva
      const rejoinGame = Object.values(games).find((g) =>
        g.allPlayers?.includes(username)
      );

      if (rejoinGame) {
        rejoinGame.usernames[username] = socket.id;
        if (!rejoinGame.allPlayers.includes(username)) {
          rejoinGame.allPlayers.push(username);
        }

        socket.join(rejoinGame.id);
        socket.emit("player-id", username);

        const team = rejoinGame.teams.find((t) => t.players.includes(username));

        socket.emit("game-started", {
          gameId: rejoinGame.id,
          team: {
            name: team.name,
            username: team.username,
          },
          crystals: rejoinGame.crystals[username],
          health: rejoinGame.health,
          hand: rejoinGame.hands[username],
          deckLength: rejoinGame.decks[username]?.length || 0,
        });

        socket.emit("turn-update", {
          currentPlayerId: rejoinGame.currentPlayerId,
          crystals: rejoinGame.crystals[rejoinGame.currentPlayerId],
        });

        emitSanitizedGameUpdate(io, rejoinGame);
        return;
      }

      // 🕐 Se è in coda matchmaking, aggiorna il socket
      const existing = matchmakingQueue1v1.find(
        (e) => e.socket.username === username
      );
      if (existing) {
        existing.socket = socket;
        socket.emit("matchmaking-waiting", {
          message: "Riconnesso alla coda 1v1",
        });
      }

      // Altrimenti il login è completato ma in attesa
    });

    socket.on("matchmaking-1v1", (deck) =>
      handleMatchmaking1v1(io, socket, games, deck, emitSanitizedGameUpdate)
    );
    socket.on("matchmaking-2v2", (data) =>
      handleMatchmaking2v2(io, socket, games, data)
    );
    socket.on("matchmaking-vs-npc", () =>
      handleMatchmakingVsNpc(io, socket, games)
    );

    socket.on("play-card", ({ gameId, card }) => {
      const g = games[gameId];
      const username = socket.username;
      if (!g || !username) return;
      const playerCrystals = g.crystals[username] || 0;
      if (card.cost > playerCrystals) {
        return socket.emit(
          "error",
          "Non hai abbastanza cristalli per giocare questa carta."
        );
      }
      // 🔻 Rimuovi la carta dalla mano
      g.hands[username] = g.hands[username]?.filter((c) => c.id !== card.id);

      // 🔻 Sottrai il costo in cristalli (min 0)
      g.crystals[username] = Math.max(
        (g.crystals[username] || 0) - card.cost,
        0
      );

      // 🔻 Aggiungi alla board se è HERO
      if (card.type === "HERO") {
        g.boards[username] = g.boards[username] || [];
        if (g.boards[username].length < 6) {
          g.boards[username].push({ ...card, justPlayed: true });
        }
      }

      emitSanitizedGameUpdate(io, g);
    });
    socket.on("attack", ({ gameId, attacker, target }) => {
      const g = games[gameId];
      const username = socket.username;
      if (!g || !username || !attacker || !target) return;
      console.log("STAI ATTACCANDO", attacker, target);
      const board = g.boards[username] || [];
      const att = board.find((c) => c.id === attacker.id);
      if (!att || att.justPlayed) {
        return socket.emit("error", "Non puoi attaccare");
      }

      if (target.type === "HERO") {
        const defBoard = g.boards[target.playerId] || [];
        const def = defBoard.find((c) => c.id === target.id);
        if (!def) return;

        // 🔻 Attacco
        def.defense -= att.attack;
        att.defense -= def.attack;

        // 🔄 Aggiorna board difensore (rimuove se morto)
        g.boards[target.playerId] = defBoard
          .map((c) => (c.id === def.id ? def : c))
          .filter((c) => c.defense > 0);

        // 🔄 Aggiorna board attaccante (rimuove se morto)
        g.boards[username] = board
          .map((c) => (c.id === att.id ? att : c))
          .filter((c) => c.defense > 0);
      } else if (target.type === "FACE") {
        g.health[target.playerId] -= att.attack;

        if (g.health[target.playerId] <= 0) {
          io.to(g.id).emit("game-over", { winner: username });
        }
      }

      // ✅ Blocca doppio attacco nello stesso turno
      const updatedAtt = g.boards[username]?.find((c) => c.id === att.id);
      if (updatedAtt) updatedAtt.justPlayed = true;

      emitSanitizedGameUpdate(io, g);
    });

    socket.on("end-turn", (gameId) => {
      const g = games[gameId];
      if (!g) return;

      // Passa al prossimo giocatore
      g.currentTurnIndex = (g.currentTurnIndex + 1) % g.allPlayers.length;
      const current = g.allPlayers[g.currentTurnIndex];
      g.currentPlayerId = current;

      // ✅ Aumenta maxCrystals (fino a 10) e resetta i cristalli disponibili
      g.maxCrystals[current] = Math.min((g.maxCrystals[current] || 0) + 1, 10);
      g.crystals[current] = g.maxCrystals[current];
      // Pesca una carta dal mazzo
      const card = g.decks[current].shift();
      if (card) {
        g.hands[current].push(card);
      }

      // ✅ RESET di tutti i justPlayed di tutte le carte di ogni giocatore
      g.allPlayers.forEach((p) => {
        g.boards[p]?.forEach((c) => (c.justPlayed = false));
      });

      // Aggiorna il client
      emitSanitizedGameUpdate(io, g);

      // Notifica il nuovo giocatore della carta pescata
      io.to(g.usernames[current]).emit("card-drawn", {
        card,
        deckLength: g.decks[current].length,
      });

      // Notifica tutti del nuovo turno
      io.to(g.id).emit("turn-update", {
        currentPlayerId: current,
        crystals: g.crystals[current],
      });
    });

    socket.on("leave-game", (gameId) => {
      const g = games[gameId];
      const username = socket.username;
      if (!g || !username) return;
      g.allPlayers = g.allPlayers.filter((u) => u !== username);
      delete g.boards[username];
      delete g.hands[username];
      delete g.crystals[username];
      delete g.usernames[username];
      emitSanitizedGameUpdate(io, g);
    });

    socket.on("disconnect", () => {
      const username = socket.username;
      if (usernameToSocketId[username] === socket.id)
        delete usernameToSocketId[username];
      for (const g of Object.values(games)) {
        if (g.usernames) delete g.usernames[username];
      }
    });
  });
};

function emitSanitizedGameUpdate(io, game) {
  game.allPlayers.forEach((username) => {
    const socketId = game.usernames[username];
    const sanitized = sanitizeGameForPlayer(game, username);
    if (socketId) io.to(socketId).emit("game-update", sanitized);
  });
}

function sanitizeGameForPlayer(game, username) {
  const opponent = game.allPlayers.find((u) => u !== username);
  return {
    id: game.id,
    teams: game.teams,
    status: game.status,
    currentTurnIndex: game.currentTurnIndex,
    currentPlayerId: game.currentPlayerId,
    maxCrystals: game.maxCrystals,
    health: game.health,
    crystals: game.crystals,
    boards: {
      [username]: game.boards[username] || [],
      [opponent]: game.boards[opponent] || [],
    },
    hands: {
      [username]: game.hands[username],
      [opponent]: game.hands[opponent]?.length ?? 0,
    },
    decks: {
      [username]: game.decks[username]?.length ?? 0,
    },
    opponentId: opponent,
    username,
  };
}
