import { emitSanitizedGameUpdate } from "./gameUtils.js";
import { handleEndTurn } from "./gameHandeler2.js";
import { getRandomCards } from "./gameUtils.js";

export async function generateBotDeck() {
  try {
    const deck = await getRandomCards({
      count: 30,
      mode: "deck",
      type: "HERO",
    });
    console.log("GUARDA DECK", deck);
    return deck;
  } catch (err) {
    console.error("Errore nella generazione del mazzo bot:", err.message);
    return [];
  }
}

export function simulateBotMove(gameId, botId, games, io) {
  const game = games[gameId];
  if (!game || game.status === "ended") return;

  const hand = game.hands[botId] || [];
  const crystals = game.crystals[botId] || 0;
  const board = game.boards[botId] || [];
  const enemyId = game.allPlayers.find((u) => u !== botId);

  // Prova a giocare una carta
  const playable = hand.find((c) => c.cost <= crystals);
  if (playable) {
    const withId = { ...playable, id: Date.now() + Math.random() };
    game.hands[botId] = hand.filter((c) => c !== playable);
    board.push(withId);
  }

  // Prova ad attaccare (uno solo per semplicità)
  // const targets = game.boards[enemyId] || [];
  // if (board.length && targets.length) {
  //   const attacker = board[0];
  //   const target = targets[0];
  //   target.defense -= attacker.attack;
  //   attacker.defense -= target.attack;
  // }

  // Fine turno
  const result = handleEndTurn({ gameId, userId: botId, games });

  console.log(result, "end:turn");

  if (!result?.game) return;

  emitSanitizedGameUpdate(io, result.game);
  io.to(result.game.id).emit("turn-update", {
    currentPlayerId: result.nextPlayer,
    crystals: result.game.crystals[result.nextPlayer],
  });

  // Se tocca ancora al bot → mossa successiva
  if (result.nextPlayer === botId) {
    setTimeout(() => simulateBotMove(gameId, botId, games, io), 1000);
  }
}
