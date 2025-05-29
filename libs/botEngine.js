import { getRandomCards } from "./gameUtils.js";
import {
  handlePlayCard,
  handleAttack,
  handleEndTurn,
} from "./gameHandeler2.js";
import { emitSanitizedGameUpdate, finalizeGameUpdate } from "./gameUtils.js";
import { canAttack } from "./card-helpers.js";
import crypto from "crypto"; // se usi ES Modules (tipo `.mjs` o `"type": "module"`)
import { resolveTargets } from "./effectEngine.js";

export async function generateBotDeck() {
  try {
    const deck = await getRandomCards({
      count: 30,
      mode: "deck",
      type: "HERO",
    });

    while (deck.length < 30) {
      const baseCard = deck[deck.length % (deck.length || 1)];
      if (!baseCard) break; // prevenzione hard

      const clone = {
        ...baseCard,
        _id: baseCard._id || baseCard.id || `fallback-${Math.random()}`,
        id: crypto.randomUUID(),
      };
      deck.push(clone);
    }
    //console.log(deck);
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

  try {
    const hand = game.hands[botId] || [];
    const crystals = game.crystals[botId] || 0;
    const board = game.boards[botId] || [];
    const enemyId = game.allPlayers.find((u) => u !== botId);
    const enemyBoard = game.boards[enemyId] || [];

    // ▶️ 1. Gioca una carta se possibile
    const cardToPlay = hand.find((c) => c.cost <= crystals);
    if (cardToPlay) {
      const result = await handlePlayCard({
        gameId,
        card: cardToPlay,
        index: board.length,
        userId: botId,
        games,
        ioInstance,
      });

      if (result?.game) {
        await finalizeGameUpdate({
          game: result.game,
          ioInstance,
          log: result.log,
        });

        emitSanitizedGameUpdate(ioInstance, result.game); // 👈 aggiorna client dopo azione visibile
      }
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
      const result = await handleAttack({
        gameId,
        attacker,
        target: possibleTarget,
        userId: botId,
        games,
        ioInstance,
      });

      if (result?.game) {
        await finalizeGameUpdate({
          game: result.game,
          ioInstance,
          log: result.log,
        });

        emitSanitizedGameUpdate(ioInstance, result.game); // 👈 aggiorna client dopo attacco
      }
    }

    // 🕒 3. Passa il turno dopo un breve delay
    setTimeout(() => {
      const result = handleEndTurn({
        gameId,
        userId: botId,
        games,
        ioInstance,
      });

      if (result?.error) {
        console.error("[BOT] Errore passando il turno:", result.error);
        return;
      }
      emitSanitizedGameUpdate(ioInstance, game);
      finalizeGameUpdate({
        game: result.game,
        ioInstance,
        log: result.log,
      });

      const nextPlayer = result.game.currentPlayerId;
      const socketId = result.game.userSockets?.[nextPlayer];
      const frame = result.game.frames?.[nextPlayer] ?? "";
      const deckLength = result.game.decks[nextPlayer]?.length ?? 0;
      const drawnCard = result.effects?.drawnCard ?? null;

      ioInstance.to(result.game.id).emit("turn-update", {
        currentPlayerId: nextPlayer,
        crystals: result.game.crystals[nextPlayer],
      });

      if (socketId && drawnCard) {
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
