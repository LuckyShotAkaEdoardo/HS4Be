import { getRandomCards } from "./gameUtils.js";
import {
  handlePlayCard,
  handleAttack,
  handleEndTurn,
} from "./gameHandeler2.js";
import { emitSanitizedGameUpdate } from "./gameUtils.js";
import { canAttack } from "./card-helpers.js";

export async function generateBotDeck() {
  try {
    const deck = await getRandomCards({
      count: 30,
      mode: "deck",
      type: "HERO",
    });
    return deck;
  } catch (err) {
    console.error("Errore nella generazione mazzo bot:", err.message);
    return [];
  }
}

export async function simulateBotMove(gameId, botId, games, ioInstance) {
  const game = games[gameId];
  if (!game || game.status === "ended") return;

  if (game.currentPlayerId !== botId) {
    console.log(`[BOT] Non è il turno del bot. Esco.`);
    return;
  }

  const fakeSocket = {
    id: game.userSockets[botId],
    userId: botId,
    username: "BOT",
    emit: () => {},
  };

  try {
    const hand = game.hands[botId] || [];
    const crystals = game.crystals[botId] || 0;
    const board = game.boards[botId] || [];
    const enemyId = game.allPlayers.find((u) => u !== botId);
    const enemyBoard = game.boards[enemyId] || [];

    // ▶️ 1. Gioca una carta se possibile
    const cardToPlay = hand.find((c) => c.cost <= crystals);
    if (cardToPlay) {
      await handlePlayCard({
        gameId,
        card: cardToPlay,
        index: board.length,
        userId: botId,
        games,
        ioInstance,
      });
    }

    // ⚔️ 2. Attacca se può
    const possibleTarget = enemyBoard.find((c) => c.defense > 0) || {
      type: "FACE",
      playerId: enemyId,
    };

    const attacker = game.boards[botId]?.find((c) =>
      canAttack(c, possibleTarget, game, botId)
    );

    if (attacker) {
      await handleAttack({
        gameId,
        attacker,
        target: possibleTarget,
        userId: botId,
        games,
        ioInstance,
      });
    }

    // 🕒 3. Passa il turno dopo un breve delay
    setTimeout(() => {
      const result = handleEndTurn({ gameId, userId: botId, games });
      if (result?.error) {
        console.error("[BOT] Errore passando il turno:", result.error);
        return;
      }

      const { socketId, drawnCard, deckLength, nextPlayer, game } = result;

      emitSanitizedGameUpdate(ioInstance, game);

      ioInstance.to(game.id).emit("turn-update", {
        currentPlayerId: nextPlayer,
        crystals: game.crystals[nextPlayer],
      });

      if (socketId) {
        const frame = game.frames?.[nextPlayer] || "";
        ioInstance.to(socketId).emit("card-drawn", {
          card: drawnCard,
          frame,
          deckLength,
        });
      }

      // Se il turno è ancora del bot, ricomincia
      if (nextPlayer?.startsWith("bot:")) {
        setTimeout(() => {
          simulateBotMove(gameId, nextPlayer, games, ioInstance);
        }, 1000);
      }
    }, 1000);
  } catch (err) {
    console.error("[BOT] Errore durante simulateBotMove:", err);
  }
}
