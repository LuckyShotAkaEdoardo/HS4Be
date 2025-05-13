// socketManager.js (rifattorizzato, centralizzazione matchmaking inclusa)

import { Server } from "socket.io";
import { handleMatchmaking2v2 } from "./matchmaking2v2.js";
import { handleMatchmakingVsNpc } from "./matchmakingVsNpc.js";
import {
  triggerEffects,
  emitPassiveTrigger,
  registerPassiveEffects,
  unregisterPassiveEffectsByCard,
  clearPassiveEffects,
  EffectTriggers,
} from "./effectEngine.js";

let ioInstance;
let games = {};
const usernameToSocketId = {};
let matchmakingQueue1v1 = [];
const disconnectTimeouts = {}; // { username: Timeout }

export const initializeSocket = (server) => {
  ioInstance = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  ioInstance.on("connection", (socket) => {
    console.log(`Giocatore connesso: ${socket.id}`);
    socket.emit("do-login");

    socket.on("login", ({ username }) => {
      if (!username || typeof username !== "string") {
        socket.emit("login-error", "Questo username è già in uso.");
        return;
      }

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
      if (disconnectTimeouts[username]) {
        clearTimeout(disconnectTimeouts[username]);
        delete disconnectTimeouts[username];
      }

      if (rejoinGame && isGameReady(rejoinGame)) {
        rejoinGame.usernames[username] = socket.id;
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
    });

    socket.on("matchmaking-1v1", (playerDeck) => {
      const username = socket.username;
      if (!username) return socket.emit("abort-match");

      const existing = matchmakingQueue1v1.find((e) => e.username === username);
      if (existing) {
        existing.socket = socket;
        existing.deck = playerDeck;
        return socket.emit("matchmaking-waiting", {
          message: "Già in coda, aggiornato il socket",
        });
      }

      matchmakingQueue1v1.push({ username, socket, deck: playerDeck });

      if (matchmakingQueue1v1.length >= 2) {
        const {
          username: u1,
          socket: s1,
          deck: d1,
        } = matchmakingQueue1v1.shift();
        const nextIndex = matchmakingQueue1v1.findIndex(
          (e) => e.username !== u1
        );

        if (nextIndex === -1) {
          matchmakingQueue1v1.unshift({ username: u1, socket: s1, deck: d1 });
          return;
        }

        const {
          username: u2,
          socket: s2,
          deck: d2,
        } = matchmakingQueue1v1.splice(nextIndex, 1)[0];

        createGame1v1(u1, s1, d1, u2, s2, d2);
      }
    });

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
      if (username !== g.currentPlayerId) {
        return socket.emit("error", "Non è il tuo turno");
      }
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

      triggerEffects({
        trigger: EffectTriggers.ON_PLAY,
        game: g,
        card,
        source: username,
        target: card.targetId ?? null,
      });

      if (card.effect && card.effect.trigger !== EffectTriggers.ON_PLAY) {
        registerPassiveEffects(gameId, [
          { effect: card.effect, card, owner: username },
        ]);
      }

      emitSanitizedGameUpdate(ioInstance, g);
    });

    socket.on("attack", ({ gameId, attacker, target }) => {
      const g = games[gameId];
      const username = socket.username;
      if (!g || !username || !attacker || !target || g.status === "ended")
        return;
      if (username !== g.currentPlayerId) {
        return socket.emit("error", "Non è il tuo turno");
      }
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

        if (def.defense <= 0) {
          unregisterPassiveEffectsByCard(gameId, def.id);
        }
        if (att.defense <= 0) {
          unregisterPassiveEffectsByCard(gameId, att.id);
        }

        g.boards[target.playerId] = defBoard
          .map((c) => (c.id === def.id ? def : c))
          .filter((c) => c.defense > 0);

        g.boards[username] = board
          .map((c) => (c.id === att.id ? att : c))
          .filter((c) => c.defense > 0);
      } else if (target.type === "FACE") {
        g.health[target.playerId] -= att.attack;

        emitPassiveTrigger(EffectTriggers.ON_DAMAGE_RECEIVED, g, {
          target: target.playerId,
          value: att.attack,
        });

        if (g.health[target.playerId] <= 0) {
          endGame(gameId, username, target.playerId);
        }
      }

      const updatedAtt = g.boards[username]?.find((c) => c.id === att.id);
      if (updatedAtt) updatedAtt.justPlayed = true;

      emitSanitizedGameUpdate(ioInstance, g);
    });

    socket.on("end-turn", (gameId) => {
      const g = games[gameId];
      if (!g || g.status === "ended") return;
      if (socket.username !== g.currentPlayerId) {
        return socket.emit("error", "Non è il tuo turno");
      }
      g.currentTurnIndex = (g.currentTurnIndex + 1) % g.allPlayers.length;
      const current = g.allPlayers[g.currentTurnIndex];
      g.currentPlayerId = current;

      g.maxCrystals[current] = Math.min((g.maxCrystals[current] || 0) + 1, 10);
      g.crystals[current] = g.maxCrystals[current];

      const card = g.decks[current].shift();
      if (card) {
        g.hands[current].push(card);

        emitPassiveTrigger(EffectTriggers.ON_CARD_DRAWN, g, {
          target: current,
          value: 1,
        });
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
      const opponent = g.allPlayers.find((u) => u !== username);
      if (opponent) {
        endGame(gameId, opponent, username);
      }
    });

    socket.on("disconnect", () => {
      const username = socket.username;
      if (usernameToSocketId[username] === socket.id) {
        delete usernameToSocketId[username];
        const g = Object.values(games).find((g) =>
          g.allPlayers?.includes(username)
        );
        if (g) {
          const opponent = g.allPlayers.find((u) => u !== username);
          disconnectTimeouts[username] = setTimeout(() => {
            endGame(g.id, opponent, username);
            delete disconnectTimeouts[username];
          }, 30000); // ⏱️ 30 secondi
        }
      }
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
    allPlayers: game.allPlayers,
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

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

let globalCardId = 1;
function assignUniqueIds(deck) {
  return deck.map((card) => ({ ...card, id: globalCardId++ }));
}

function createGame1v1(u1, s1, deck1, u2, s2, deck2) {
  const fullDeck1 = assignUniqueIds(shuffle([...deck1]));
  const fullDeck2 = assignUniqueIds(shuffle([...deck2]));
  const hand1 = fullDeck1.splice(0, 4);
  const hand2 = fullDeck2.splice(0, 4);

  const gameId = Math.random().toString(36).substring(2, 9);
  const game = {
    id: gameId,
    name: "1v1 Match",
    status: "started",
    teams: [
      { name: "Squadra 1", username: u1, players: [u1] },
      { name: "Squadra 2", username: u2, players: [u2] },
    ],
    currentTurnIndex: 0,
    currentPlayerId: u1,
    allPlayers: [u1, u2],
    crystals: { [u1]: 1, [u2]: 1 },
    maxCrystals: { [u1]: 1, [u2]: 1 },
    health: { [u1]: 20, [u2]: 20 },
    decks: { [u1]: fullDeck1, [u2]: fullDeck2 },
    hands: { [u1]: hand1, [u2]: hand2 },
    boards: { [u1]: [], [u2]: [] },
    usernames: { [u1]: s1.id, [u2]: s2.id },
  };

  games[gameId] = game;
  console.log(`🟢 1v1 avviata tra ${u1} e ${u2} → gameId: ${gameId}`);

  [s1, s2].forEach((socket) => {
    const uname = socket.username;
    const team = game.teams.find((t) => t.players.includes(uname));
    socket.join(gameId);
    socket.emit("game-started", {
      gameId,
      team,
      crystals: game.crystals[uname],
      health: game.health,
      hand: game.hands[uname],
      deckLength: game.decks[uname]?.length || 0,
    });
    socket.emit("player-id", uname);
  });

  emitSanitizedGameUpdate(ioInstance, game);
  ioInstance.to(gameId).emit("turn-update", {
    currentPlayerId: u1,
    crystals: game.crystals[u1],
  });
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

function endGame(gameId, winner, loser) {
  const g = games[gameId];
  if (!g || g.status === "ended") return;

  g.status = "ended";

  const winnerSocketId = g.usernames[winner];
  const loserSocketId = g.usernames[loser];

  if (winnerSocketId) {
    ioInstance.to(winnerSocketId).emit("you-won", {
      message: "Hai vinto la partita!",
    });
  }

  if (loserSocketId) {
    ioInstance.to(loserSocketId).emit("you-lost", {
      message: "Hai perso la partita!",
    });
  }

  ioInstance.to(g.id).emit("game-over", { winner, loser });
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
