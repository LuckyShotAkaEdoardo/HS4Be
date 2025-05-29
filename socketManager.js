// socketManager.js aggiornato con GameHandler e GameUtils
import { Server } from "socket.io";
// import { games, usernameToSocketId } from "./GameState.js";
import {
  emitSanitizedGameUpdate,
  createGame1v1,
  sharedGameView,
  endGame,
  finalizeGameUpdate,
} from "./libs/gameUtils.js";
import {
  handlePlayCard,
  handleAttack,
  handleEndTurn,
} from "./libs/gameHandeler2.js";
import { generateBotDeck, simulateBotMove } from "./libs/botEngine.js";
import { getSelectedDeckAndFrame } from "./libs/deck-service.js";
import jwt from "jsonwebtoken";
// assicurati che sia importato

getSelectedDeckAndFrame;

let ioInstance;
let games = {};
const userIdToSocketId = {};

const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";
const matchmakingQueues = {
  "1v1": [],
  "2v2": [],
  vsBot: [],
};

let isMatching = false;
const disconnectTimeouts = {}; // { username: Timeout }
const lastActionTimestamp = new Map();

export const initializeSocket = (server) => {
  ioInstance = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  ioInstance.on("connection", (socket) => {
    socket.emit("do-login");

    socket.on("login", ({ token }) => {
      let userId, username;

      try {
        const payload = jwt.verify(token, JWT_SECRET);

        userId = `${payload.username}---${payload.id}`.toLowerCase();
        username = payload.username?.trim();

        if (!userId || !username) throw new Error("Token incompleto");
      } catch (err) {
        socket.emit("login-error", "Token non valido");
        return;
      }

      const existingSocketId = userIdToSocketId[userId];
      if (existingSocketId && existingSocketId !== socket.id) {
        const oldSocket = ioInstance.sockets.sockets.get(existingSocketId);
        if (oldSocket?.connected) oldSocket.disconnect(true);
      }

      for (const mode in matchmakingQueues) {
        matchmakingQueues[mode] = matchmakingQueues[mode].filter(
          (entry) => entry.userId !== userId
        );
      }

      userIdToSocketId[userId] = socket.id;
      socket.userId = userId;
      socket.username = username;

      console.log(
        `[LOGIN] ${username} (id: ${userId}) connesso con socket ID ${socket.id}`
      );
      socket.emit("login-succes", true);

      if (disconnectTimeouts[userId]) {
        clearTimeout(disconnectTimeouts[userId]);
        delete disconnectTimeouts[userId];
      }

      const rejoinGame = Object.values(games).find(
        (g) =>
          isValidGame(g) && g.userIds.includes(userId) && g.status !== "ended"
      );
      if (rejoinGame) {
        rejoinGame.userSockets[userId] = socket.id;
        socket.join(rejoinGame.id);

        console.log(
          `[REJOIN] ${username} rientra nella partita ${rejoinGame.id}`
        );
        rejoinGame.userSockets[userId] = socket.id;
        startNewGameForPlayer(socket, rejoinGame, userId);

        return;
      }
    });

    socket.on("matchmaking", async ({ mode }) => {
      const userId = socket.userId;
      const username = socket.username;
      console.log(
        `[MATCHMAKING] Richiesta da ${username} (${userId}) in modalità ${mode}`
      );

      if (!userId || !username) return socket.emit("abort-match");
      console.log(
        `[MATCHMAKING] Richiesta da ${username} (${userId}) in modalità ${mode}`
      );

      if (!["1v1", "vsBot"].includes(mode)) {
        return socket.emit("matchmaking-error", {
          error: "Modalità non valida",
        });
      }

      try {
        const { frame, cards } = await getSelectedDeckAndFrame(userId);

        if (mode === "vsBot") {
          const botUsername = `bot:${Math.floor(Math.random() * 1000)}`;
          const botSocket = { id: `bot:${userId}` };
          const botFrame = "teck.png";
          const botDeck = await generateBotDeck();

          const { game, sockets } = createGame1v1(
            userId,
            socket,
            cards,
            frame,
            botUsername,
            botSocket,
            botDeck,
            botFrame
          );

          games[game.id] = game;
          game.history = [];
          socket.join(game.id);
          socket.emit("player-id", userId);
          socket.emit("game-started", sharedGameView(game, userId));
          console.log("✅ Partita creata:", game.id);
          console.log("📦 Stato globale:", Object.keys(games));
          emitSanitizedGameUpdate(ioInstance, game);

          if (game.currentPlayerId === botUsername) {
            setTimeout(
              () => simulateBotMove(game.id, botUsername, games, ioInstance),
              5000
            );
          }

          return;
        }

        const playerData = { userId, username, socket, deck: cards, frame };
        const queue = matchmakingQueues["1v1"];

        const alreadyInQueue = queue.some((e) => e.userId === userId);
        if (alreadyInQueue) {
          matchmakingQueues["1v1"] = queue.map((e) =>
            e.userId === userId ? playerData : e
          );
          return socket.emit("matchmaking-waiting", {
            message: "Già in coda, aggiornato il socket",
          });
        }

        queue.push(playerData);

        if (!isMatching && queue.length >= 2) {
          isMatching = true;

          const [first, second] = [queue.shift(), queue.shift()];

          if (!first.socket.connected) {
            queue.unshift(second);
            isMatching = false;
            return;
          }
          if (!second.socket.connected) {
            queue.unshift(first);
            isMatching = false;
            return;
          }

          const { game, sockets } = createGame1v1(
            first.userId,
            first.socket,
            first.deck,
            first.frame,
            second.userId,
            second.socket,
            second.deck,
            second.frame
          );

          games[game.id] = game;
          console.log(
            `🟢 Match avviato tra ${first.username} e ${second.username}`
          );
          console.log("✅ Partita creata:", game.id);
          game.initialState = serializeGame(game); // snapshot iniziale
          game.history = [];
          console.log("📦 Stato globale:", Object.keys(games));
          [first, second].forEach((p) => {
            const sock = sockets[p.userId];
            if (!sock) return;
            sock.join(game.id);
            sock.emit("player-id", p.username);
            sock.emit("game-started", sharedGameView(game, p.userId));
          });

          setTimeout(() => {
            emitSanitizedGameUpdate(ioInstance, game);
            ioInstance.to(game.id).emit("turn-update", {
              currentPlayerId: game.currentPlayerId,
              crystals: game.crystals[game.currentPlayerId],
            });
          }, 500);

          isMatching = false;
        }
      } catch (err) {
        socket.emit("matchmaking-error", { error: err.message });
      }
    });

    socket.on("play-card", ({ gameId, cardId, index, targets = [] }) => {
      if (throttleAction(socket)) return;

      const userId = socket.userId;
      const game = games[gameId];
      if (!game) return socket.emit("error", "Partita non trovata");

      const card = game.hands[userId]?.find((c) => c.id === cardId);
      if (!card)
        return socket.emit("error", "Carta non trovata nella tua mano");

      wrapSafeAction(
        socket,
        async ({ gameId, card }) => {
          const result = await handlePlayCard({
            gameId,
            card,
            index,
            userId,
            games,
            ioInstance, // 🔐 lasciato per usi interni nel motore
            targets,
          });

          if (result?.game) {
            await finalizeGameUpdate({
              game: result.game,
              ioInstance,
              log: result.log,
            });
          }

          return result;
        },
        { gameId, card }
      );
    });

    socket.on("attack", async ({ gameId, attacker, target }) => {
      if (throttleAction(socket)) return;

      const userId = socket.userId;

      wrapSafeAction(
        socket,
        async ({ gameId, attacker, target }) => {
          const result = await handleAttack({
            gameId,
            attacker,
            target,
            userId,
            games,
            ioInstance, // 🔒 mantenuto per logiche interne (es. win/lose)
          });

          if (result?.game) {
            await finalizeGameUpdate({
              game: result.game,
              ioInstance,
              log: result.log,
            });
          }

          return result;
        },
        { gameId, attacker, target }
      );
    });

    socket.on("end-turn", (gameId) => {
      if (throttleAction(socket)) return;

      const userId = socket.userId;
      const result = handleEndTurn({
        gameId,
        userId,
        games,
        ioInstance,
      });

      if (result?.error) return socket.emit("error", result.error);

      const updatedGame = result.game;
      finalizeGameUpdate({
        game: updatedGame,
        ioInstance,
        log: result.log,
      });
      emitSanitizedGameUpdate(ioInstance, updatedGame);
      const nextPlayer = updatedGame.currentPlayerId;
      const socketId = updatedGame.userSockets?.[nextPlayer];
      const drawnCard = result.effects?.drawnCard ?? null;
      const deckLength = updatedGame.decks[nextPlayer]?.length ?? 0;
      const frame = updatedGame.frames?.[nextPlayer] || "";

      ioInstance.to(updatedGame.id).emit("turn-update", {
        currentPlayerId: nextPlayer,
        crystals: updatedGame.crystals[nextPlayer],
      });

      if (socketId && drawnCard) {
        ioInstance.to(socketId).emit("card-drawn", {
          card: drawnCard,
          frame: frame,
          deckLength,
        });
      }

      if (typeof nextPlayer === "string" && nextPlayer.startsWith("bot:")) {
        setTimeout(() => {
          simulateBotMove(gameId, nextPlayer, games, ioInstance);
        }, 5000);
      }
    });

    socket.on("leave-game", (gameId) => {
      const g = games[gameId];
      const userId = socket.userId;
      if (!g || !userId) return;
      const opponent = g.userIds.find((u) => u !== userId);
      if (opponent) {
        endGame(gameId, games, ioInstance, opponent, userId);
      }
    });
    socket.on("cancel-matchmaking", () => {
      const userId = socket.userId;
      if (!userId) return;

      for (const mode in matchmakingQueues) {
        matchmakingQueues[mode] = matchmakingQueues[mode].filter(
          (entry) => entry.userId !== userId
        );
      }

      console.log(`[MATCHMAKING] ${userId} ha annullato la coda`);
      socket.emit("matchmaking-cancelled", true);
    });

    socket.on("disconnect", () => {
      const userId = socket.userId;
      if (!userId) return;

      const gameId = Object.keys(games).find((id) =>
        games[id].userIds?.includes(userId)
      );

      if (!gameId) return;

      const game = games[gameId];
      const opponent = game.userIds.find((u) => u !== userId);
      const opponentSocketId = userIdToSocketId[opponent];
      const opponentSocket = ioInstance.sockets.sockets.get(opponentSocketId);

      if (opponentSocket?.connected) {
        opponentSocket.emit("opponent-disconnected", {
          message: `${socket.username} si è disconnesso`,
        });
      }

      disconnectTimeouts[userId] = setTimeout(() => {
        const stillDisconnected = !ioInstance.sockets.sockets.get(
          userIdToSocketId[userId]
        )?.connected;

        if (stillDisconnected && games[gameId]) {
          delete games[gameId];

          if (opponentSocket?.connected) {
            endGame(gameId, games, ioInstance, opponent, userId);
            // opponentSocket.emit("game-ended", {
            //   reason: "opponent-left",
            //   winner: opponent,
            // });
          }
        }
      }, 120000);
    });
  });
};
function isInAnyQueue(username) {
  return Object.values(matchmakingQueues).some((queue) =>
    queue.some((e) => e.username === username)
  );
}
// function isBot(player) {
//   return player.toLowerCase().startsWith("bot");
// }
export function cleanupOldGames() {
  for (const [gameId, game] of Object.entries(games)) {
    if (game.status === "ended") {
      console.log(`[CLEANUP] Rimuovo partita terminata ${gameId}`);
      delete games[gameId];
    }
  }
}
// export function cleanupOldGames() {
//   for (const [gameId, game] of Object.entries(games)) {
//     const players = game.allPlayers || game.userIds || [];

//     const bots = players.filter((p) => p.toLowerCase().startsWith("bot"));
//     const humans = players.filter((p) => !p.toLowerCase().startsWith("bot"));

//     const activeHumans = humans.filter((p) => {
//       const sid = userIdToSocketId[p];
//       return sid && ioInstance.sockets.sockets.has(sid);
//     });

//     const isBotGame = bots.length > 0;
//     const shouldDelete =
//       game.status === "ended" ||
//       (isBotGame && activeHumans.length === 0) ||
//       (!isBotGame && activeHumans.length < humans.length);

//     if (shouldDelete) {
//       console.log(`[CLEANUP] Rimuovo partita ${gameId} (${game.status})`);
//       delete games[gameId];
//     }
//   }

//   // Pulizia code matchmaking: rimuove socket non più validi
//   for (const [mode, queue] of Object.entries(matchmakingQueues)) {
//     matchmakingQueues[mode] = queue.filter((entry) => {
//       const sid = entry.socket?.id;
//       return sid && ioInstance.sockets.sockets.has(sid);
//     });
//   }
// }

function throttleAction(socket, ms = 500) {
  const now = Date.now();
  const last = lastActionTimestamp.get(socket.username) || 0;

  if (now - last < ms) {
    return true; // blocca l’azione
  }

  lastActionTimestamp.set(socket.username, now);
  return false; // consenti
}
export function logStatus() {
  // console.log("======= SERVER STATUS =======");
  // console.log(`🎮 Partite attive: ${Object.keys(games).length}`);
  // for (const [id, game] of Object.entries(games)) {
  //   const players = game.allPlayers || [];
  //   const connected = players.filter((p) => {
  //     const sid = userIdToSocketId[p];
  //     return sid && ioInstance.sockets.sockets.has(sid);
  //   });
  //   console.log(
  //     `- Partita ${id}: ${players.length} totali, ${connected.length} connessi`
  //   );
  // }
  // for (const [mode, queue] of Object.entries(matchmakingQueues)) {
  //   console.log(`🎯 In matchmaking ${mode}: ${queue.length} giocatore/i`);
  // }
  // console.log("================================");
}

export function logStatusAsText() {
  let output = `🎮 Partite attive: ${Object.keys(games).length}\n`;
  for (const [id, game] of Object.entries(games)) {
    const players = game.allPlayers || [];
    const connected = players.filter((p) => {
      const sid = userIdToSocketId[p];
      return sid && ioInstance.sockets.sockets.has(sid);
    });
    output += `- Partita \`${id}\`: ${players.length} totali, ${connected.length} connessi\n`;
  }

  for (const [mode, queue] of Object.entries(matchmakingQueues)) {
    output += `🎯 In matchmaking ${mode}: ${queue.length} giocatore/i\n`;
  }

  return output;
}
function isBot(player) {
  return player.toLowerCase().startsWith("bot");
}

function startNewGameForPlayer(socket, game, userId) {
  if (!game || !userId) {
    socket.emit("error", "Errore interno: partita o utente mancanti.");
    return;
  }

  const socketId = socket.id;
  game.userSockets[userId] = socketId;
  socket.join(game.id);

  // Invia anche lo username (solo per frontend/display)
  const username = game.usernames?.[userId] || "???";
  socket.emit("player-id", username);

  try {
    const view = sharedGameView(game, userId);
    socket.emit("game-started", view);

    emitSanitizedGameUpdate(ioInstance, game);

    socket.emit("history-data", [...(game.history || [])]);

    socket.emit("turn-update", {
      currentPlayerId: game.currentPlayerId,
      crystals: game.crystals[game.currentPlayerId],
    });
  } catch (err) {
    console.error(`❌ Errore nel reinvio stato a ${username}:`, err);
    socket.emit("error", "Errore durante il ripristino della partita.");
  }
}
export async function wrapSafeAction(socket, handler, payload) {
  try {
    const userId = socket.userId;
    const result = await handler({ ...payload, userId });

    if (result?.error) {
      socket.emit("action-error", { error: result.error });
      return;
    }

    if (!result?.game) {
      console.warn("⚠️ Nessun game restituito dall'handler:", handler.name);
      socket.emit("action-error", {
        error: "Errore interno: nessuna partita attiva.",
      });
      return;
    }

    emitSanitizedGameUpdate(ioInstance, result.game);
  } catch (err) {
    console.error(`❌ Errore in ${handler.name}:`, err);
    socket.emit("action-error", {
      error: err?.message || "Errore interno: azione non completata.",
      stack: err?.stack || null,
    });
  }
}

function isValidGame(game) {
  return (
    game &&
    typeof game === "object" &&
    Array.isArray(game.userIds) &&
    game.status !== "ended"
  );
}
