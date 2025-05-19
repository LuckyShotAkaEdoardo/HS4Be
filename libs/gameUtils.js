// gameUtils.js
// gameUtils.js
import { createEmptyGame } from "../model/gameModel.js";
import Card from "./../model/Card.js";
import {
  unregisterPassiveEffectsByCard,
  emitPassiveTrigger,
  EffectTriggers,
} from "./effectEngine.js";

function decorateBoardWithCanAttack(game, board = [], playerId, target) {
  return board.map((card) => ({
    ...card,
    canAttack: canAttackThisTurn(card, game, playerId),
  }));
}
function canAttackThisTurn(card, game, playerId) {
  if (!card || !game || !playerId) return false;
  if (card.defense <= 0) return false;

  const needsRest =
    card.restingUntilTurn != null &&
    card.restingUntilTurn > (game.currentTurn ?? 0);
  const frozen = card.frozenFor > 0;
  const stunned = card.stunnedFor > 0;
  const hasAttacked = card.hasAttackedThisTurn;

  return !needsRest && !frozen && !stunned && !hasAttacked;
}

export function emitSanitizedGameUpdate(io, game) {
  for (const userId of game.userIds) {
    const socketId = game.userSockets?.[userId];

    if (!socketId) {
      console.warn(`⚠️ Nessun socketId per ${userId} in game ${game.id}`);
      continue;
    }

    if (typeof socketId === "string" && socketId.startsWith("bot:")) {
      continue; // skip bot
    }

    const socket = io.sockets.sockets.get(socketId);
    if (!socket) {
      console.warn(`⚠️ Socket non trovato per ${userId} (id: ${socketId})`);
      continue;
    }

    const view = sharedGameView(game, userId);

    if (game._visualEvents?.[userId]) {
      view.visualEvents = game._visualEvents[userId];
    }
    console.log("[DEBUG] view:", view);
    socket.emit("game-update", view);
  }

  game._visualEvents = {};
}

export function isGameReady(game, userIdToSocketId, ioInstance) {
  if (!game || !game.teams || game.teams.length < 2) return false;
  const connectedPlayers = game.teams
    .flatMap((t) => t.players)
    .filter(
      (p) =>
        userIdToSocketId[p] &&
        ioInstance.sockets.sockets.has(userIdToSocketId[p])
    );
  return connectedPlayers.length >= 2;
}

export function checkVictoryConditions(gameId, games, endGameFn) {
  const game = games[gameId];
  if (!game || game.status === "ended") return;

  for (const userId of game.userIds) {
    if (game.health[userId] <= 0) {
      const winnerId = game.userIds.find((u) => u !== userId);
      endGameFn(gameId, winnerId, userId);
      break;
    }
  }
}

export function endGame(gameId, games, ioInstance, winnerId, loserId) {
  const game = games[gameId];
  if (!game || game.status === "ended") return;

  game.status = "ended";

  const winnerSocketId = game.userSockets[winnerId];
  const loserSocketId = game.userSockets[loserId];

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

  ioInstance
    .to(game.id)
    .emit("game-over", { winner: winnerId, loser: loserId });
}

export function assignUniqueIds(deck) {
  return deck.map((card) => {
    if (!card || typeof card !== "object" || !card._id) {
      throw new Error(`❌ Carta non valida: ${JSON.stringify(card)}`);
    }

    return {
      ...card,
      id: crypto.randomUUID(),
    };
  });
}

export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function createGame1v1(
  userId1,
  socket1,
  deck1,
  frame1,
  userId2,
  socket2,
  deck2,
  frame2
) {
  if (!deck1.every((c) => c && typeof c === "object" && (c._id || c.id))) {
    console.error("❗ Deck1 contiene carte invalide:", deck1);
  }
  if (!deck2.every((c) => c && typeof c === "object" && (c._id || c.id))) {
    console.error("❗ Deck2 contiene carte invalide:", deck2);
  }

  const fullDeck1 = assignUniqueIds(shuffle([...deck1]));
  const fullDeck2 = assignUniqueIds(shuffle([...deck2]));
  const hand1 = fullDeck1.splice(0, 4);
  const hand2 = fullDeck2.splice(0, 4);

  const game = createEmptyGame();
  game.id = Math.random().toString(36).substring(2, 9);
  game.name = "1v1 Match";
  game.status = "started";

  // ⚠️ usernames è solo per display
  game.usernames = {
    [userId1]: socket1.username,
    [userId2]: socket2.username,
  };

  game.userSockets = {
    [userId1]: socket1.id,
    [userId2]: socket2.id,
  };
  // game.userSockets = {
  //   [u1]: s1 && s1.id ? s1.id : u1,
  //   [u2]: s2 && s2.id ? s2.id : u2,
  // };

  game.userIds = [userId1, userId2];
  game.currentTurnIndex = 0;
  game.currentTurn = 0;
  game.currentPlayerId = userId1;

  game.teams = [
    { name: "Squadra 1", userId: userId1, players: [userId1] },
    { name: "Squadra 2", userId: userId2, players: [userId2] },
  ];

  game.crystals = { [userId1]: 1, [userId2]: 1 };
  game.maxCrystals = { [userId1]: 1, [userId2]: 1 };
  game.health = { [userId1]: 20, [userId2]: 20 };
  game.barrier = { [userId1]: 0, [userId2]: 0 };
  game.allPlayers = [userId1, userId2];

  game.decks = { [userId1]: fullDeck1, [userId2]: fullDeck2 };
  game.hands = { [userId1]: hand1, [userId2]: hand2 };
  game.boards = { [userId1]: [], [userId2]: [] };
  game.frames = { [userId1]: frame1, [userId2]: frame2 };

  return {
    game,
    sockets: { [userId1]: socket1, [userId2]: socket2 },
  };
}

export function sharedGameView(game, userId) {
  const opponentId = game.userIds.find((u) => u !== userId);
  const isYourTurn = game.currentPlayerId === userId;
  const username = game.usernames[userId];
  const opponentName = game.usernames[opponentId];

  if (!opponentId) {
    console.warn(`[WARN] Nessun opponent trovato per ${userId}`, game.userIds);
  }

  return {
    gameId: game.id,
    status: game.status,
    teams: game.teams,
    userId,
    username,
    opponentId,
    opponentName,
    userIds: game.userIds,
    maxCrystals: game.maxCrystals,

    health: {
      [userId]: game.health[userId],
      [opponentId]: game.health[opponentId],
    },
    barrier: {
      [userId]: game.barrier?.[userId] || 0,
      [opponentId]: game.barrier?.[opponentId] || 0,
    },
    crystals: {
      [userId]: game.crystals[userId],
      [opponentId]: game.crystals[opponentId],
    },

    turnInfo: {
      currentPlayerId: game.currentPlayerId,
      crystals: game.crystals[game.currentPlayerId],
      isYourTurn,
    },

    frames: {
      [userId]: game.frames?.[userId] || "",
      [opponentId]: game.frames?.[opponentId] || "",
    },

    boards: {
      [userId]: decorateBoardWithCanAttack(game, game.boards[userId], userId),
      [opponentId]: decorateBoardWithCanAttack(
        game,
        game.boards[opponentId],
        userId
      ),
    },

    hands: {
      [userId]: game.hands[userId],
      [opponentId]: game.hands[opponentId]?.length ?? 0,
    },

    decks: {
      [userId]: game.decks[userId]?.length || 0,
      [opponentId]: game.decks[opponentId]?.length || 0,
    },
    currentTurnIndex: game.currentTurnIndex,
    currentTurn: game.currentTurn,
  };
}

export function checkDeadCards(gameId, game) {
  for (const userId of game.userIds) {
    const board = game.boards[userId];
    if (!board) continue;

    for (const card of [...board]) {
      if (card.defense <= 0) {
        unregisterPassiveEffectsByCard(gameId, card._id.toString(), true);

        emitPassiveTrigger(EffectTriggers.ON_DEATH, game, {
          target: card.id,
          source: "system",
        });

        game.boards[userId] = game.boards[userId].filter(
          (c) => c.id !== card.id
        );
      }
    }
  }
}

export async function getRandomCards({ count, mode = "deck", type = "ALL" }) {
  if (isNaN(count) || count <= 0) throw new Error("Numero non valido");
  if (!["deck", "summon"].includes(mode))
    throw new Error("Modalità non valida");
  if (!["HERO", "MAGIC", "ALL"].includes(type))
    throw new Error("Tipo non valido");

  const filter = type === "ALL" ? {} : { type };
  const cards = await Card.find(filter).lean();

  if (!cards.length) throw new Error(`Nessuna carta ${type} trovata`);

  const validCards = cards.filter((card, i) => {
    const isValid =
      card &&
      typeof card === "object" &&
      typeof card.cost === "number" &&
      typeof card.attack === "number" &&
      typeof card.defense === "number" &&
      (card._id || card.id);

    if (!isValid) {
      console.warn(`❌ Carta malformata in posizione ${i}:`, card);
    }

    return isValid;
  });

  const shuffled = [...validCards].sort(() => 0.5 - Math.random());
  const result = [];
  const maxCopies = mode === "deck" ? 2 : 1;
  const used = {};

  for (const card of shuffled) {
    const key = card._id?.toString() || card.id;
    if (!key) continue;

    used[key] = used[key] || 0;
    if (used[key] < maxCopies) {
      result.push(card);
      used[key]++;
    }

    if (result.length >= count) break;
  }

  if (result.length < count) {
    throw new Error(
      `Solo ${result.length} carte valide trovate su ${count} richieste`
    );
  }

  return assignUniqueIds(result);
}

export function addVisualEvent(game, event) {
  game.visualEvents ||= [];
  game.visualEvents.push(event);
}
