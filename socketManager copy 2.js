import { Server } from "socket.io";
import { matchmakingQueue1v1, handleMatchmaking1v1 } from "./matchmaking1v1.js";
import { handleMatchmaking2v2 } from "./matchmaking2v2.js";
import { handleMatchmakingVsNpc } from "./matchmakingVsNpc.js";

let games = {};
const usernameToSocketId = {};
let ioInstance;

export const initializeSocket = (server) => {
  ioInstance = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  ioInstance.on("connection", (socket) => {
    console.log(`Giocatore connesso: ${socket.id}`);
    socket.emit("do-login");

    socket.on("login", ({ username }) => {
      if (!username || typeof username !== "string") return;

      const existingSocketId = usernameToSocketId[username];
      if (existingSocketId && existingSocketId !== socket.id) {
        const stillConnected = ioInstance.sockets.sockets.has(existingSocketId);
        if (stillConnected) {
          socket.emit("login-error", "Questo username è già in uso.");
          return;
        } else {
          delete usernameToSocketId[username];
        }
      }

      socket.username = username;
      usernameToSocketId[username] = socket.id;
      console.log(`[LOGIN] ${username} collegato con socket ID ${socket.id}`);
      socket.emit("login-succes", true);

      const rejoinGame = Object.values(games).find((g) =>
        g.allPlayers?.includes(username)
      );

      if (rejoinGame && isGameReady(rejoinGame)) {
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

        emitSanitizedGameUpdate(ioInstance, rejoinGame);
        return;
      }

      const existing = matchmakingQueue1v1.find(
        (e) => e.socket.username === username
      );
      if (existing) {
        existing.socket = socket;
        socket.emit("matchmaking-waiting", {
          message: "Riconnesso alla coda 1v1",
        });
      }
    });

    socket.on("matchmaking-1v1", (deck) =>
      handleMatchmaking1v1(
        ioInstance,
        socket,
        games,
        deck,
        emitSanitizedGameUpdate
      )
    );
    socket.on("matchmaking-2v2", (data) =>
      handleMatchmaking2v2(ioInstance, socket, games, data)
    );
    socket.on("matchmaking-vs-npc", () =>
      handleMatchmakingVsNpc(ioInstance, socket, games)
    );

    socket.on("play-card", ({ gameId, card }) => {
      const g = games[gameId];
      const username = socket.username;
      if (!g || !username || g.status === "ended") return;

      if (card.cost > (g.crystals[username] || 0)) {
        return socket.emit(
          "error",
          "Non hai abbastanza cristalli per giocare questa carta."
        );
      }

      g.hands[username] = g.hands[username]?.filter((c) => c.id !== card.id);
      g.crystals[username] = Math.max(
        (g.crystals[username] || 0) - card.cost,
        0
      );

      if (card.type === "HERO") {
        g.boards[username] = g.boards[username] || [];
        if (g.boards[username].length < 6) {
          g.boards[username].push({ ...card, justPlayed: true });
        }
      }

      emitSanitizedGameUpdate(ioInstance, g);
    });

    socket.on("attack", ({ gameId, attacker, target }) => {
      const g = games[gameId];
      const username = socket.username;
      if (!g || !username || !attacker || !target || g.status === "ended")
        return;

      const board = g.boards[username] || [];
      const att = board.find((c) => c.id === attacker.id);
      if (!att || att.justPlayed)
        return socket.emit("error", "Non puoi attaccare");

      if (target.type === "HERO") {
        const defBoard = g.boards[target.playerId] || [];
        const def = defBoard.find((c) => c.id === target.id);
        if (!def) return;

        def.defense -= att.attack;
        att.defense -= def.attack;

        g.boards[target.playerId] = defBoard
          .map((c) => (c.id === def.id ? def : c))
          .filter((c) => c.defense > 0);

        g.boards[username] = board
          .map((c) => (c.id === att.id ? att : c))
          .filter((c) => c.defense > 0);
      } else if (target.type === "FACE") {
        g.health[target.playerId] -= att.attack;
        if (g.health[target.playerId] <= 0) {
          g.status = "ended";
          ioInstance.to(g.id).emit("game-over", {
            winner: username,
            loser: target.playerId,
          });

          const loserSocketId = g.usernames[target.playerId];
          if (loserSocketId) {
            ioInstance.to(loserSocketId).emit("you-lost", {
              message: "Hai perso la partita!",
            });
          }
          return;
        }
      }

      const updatedAtt = g.boards[username]?.find((c) => c.id === att.id);
      if (updatedAtt) updatedAtt.justPlayed = true;

      emitSanitizedGameUpdate(ioInstance, g);
    });

    socket.on("end-turn", (gameId) => {
      const g = games[gameId];
      if (!g || g.status === "ended") return;

      g.currentTurnIndex = (g.currentTurnIndex + 1) % g.allPlayers.length;
      const current = g.allPlayers[g.currentTurnIndex];
      g.currentPlayerId = current;

      g.maxCrystals[current] = Math.min((g.maxCrystals[current] || 0) + 1, 10);
      g.crystals[current] = g.maxCrystals[current];

      const card = g.decks[current].shift();
      if (card) {
        g.hands[current].push(card);
      }

      g.allPlayers.forEach((p) => {
        g.boards[p]?.forEach((c) => (c.justPlayed = false));
      });

      emitSanitizedGameUpdate(ioInstance, g);

      ioInstance.to(g.usernames[current]).emit("card-drawn", {
        card,
        deckLength: g.decks[current].length,
      });

      ioInstance.to(g.id).emit("turn-update", {
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
      emitSanitizedGameUpdate(ioInstance, g);
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

function isGameReady(game) {
  if (!game || !game.teams || game.teams.length < 2) return false;
  const connectedPlayers = game.teams
    .flatMap((t) => t.players)
    .filter(
      (p) =>
        usernameToSocketId[p] &&
        ioInstance.sockets.sockets.has(usernameToSocketId[p])
    );
  return connectedPlayers.length >= 2;
}

export function cleanupOldGames() {
  for (const [gameId, game] of Object.entries(games)) {
    const players = game.allPlayers || [];
    const activePlayers = players.filter((p) => {
      const sid = usernameToSocketId[p];
      return sid && ioInstance.sockets.sockets.has(sid);
    });

    const shouldDelete = activePlayers.length < 2 || game.status === "ended";

    if (shouldDelete) {
      console.log(`[CLEANUP] Rimuovo partita ${gameId} (${game.status})`);
      delete games[gameId];
    }
  }

  matchmakingQueue1v1.splice(
    0,
    matchmakingQueue1v1.length,
    ...matchmakingQueue1v1.filter((entry) => {
      return (
        entry.socket &&
        entry.socket.username &&
        ioInstance.sockets.sockets.has(entry.socket.id)
      );
    })
  );
}

export function logStatus() {
  console.log("======= SERVER STATUS =======");
  console.log(`🎩 Partite attive: ${Object.keys(games).length}`);
  for (const [id, game] of Object.entries(games)) {
    const players = game.allPlayers || [];
    const connected = players.filter((p) => {
      const sid = usernameToSocketId[p];
      return sid && ioInstance.sockets.sockets.has(sid);
    });
    console.log(
      `- Partita ${id}: ${players.length} totali, ${connected.length} connessi`
    );
  }
  console.log(`🎯 In matchmaking 1v1: ${matchmakingQueue1v1.length}`);
  console.log("================================");
}

export function logStatusAsText() {
  let output = `🎩 Partite attive: ${Object.keys(games).length}\n`;
  for (const [id, game] of Object.entries(games)) {
    const players = game.allPlayers || [];
    const connected = players.filter((p) => {
      const sid = usernameToSocketId[p];
      return sid && ioInstance.sockets.sockets.has(sid);
    });
    output += `- Partita \`${id}\`: ${players.length} totali, ${connected.length} connessi\n`;
  }
  output += `🎯 In matchmaking 1v1: ${matchmakingQueue1v1.length}`;
  return output;
}
