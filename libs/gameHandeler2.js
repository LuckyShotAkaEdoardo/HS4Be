import { canAttack, handleDivineShield, hasAbility } from "./card-helpers.js";
import {
  EffectTriggers,
  emitPassiveTrigger,
  registerPassiveEffects,
  triggerEffects,
  unregisterPassiveEffectsByCard,
} from "./effectEngine.js";
import {
  checkVictoryConditions,
  endGame,
  addVisualEvent,
} from "./gameUtils.js";
import { checkDeadCards } from "./gameUtils.js";

export async function handlePlayCard({
  gameId,
  card,
  index,
  userId,
  games,
  ioInstance,
}) {
  const g = games[gameId];
  // console.log("[DEBUG] handlePlayCard - gameId:", gameId);
  if (!g || g.status === "ended") return { error: "Partita non valida" };
  if (userId !== g.currentPlayerId) return { error: "Non è il tuo turno" };
  // console.log("[DEBUG] userId:", userId);
  const realCard = g.hands[userId].find((c) => c.id === card.id);
  // console.log("[DEBUG] hands:", g?.hands?.[userId]);
  if (!realCard) return { error: "La carta non è nella tua mano" };

  if (realCard.cost > (g.crystals[userId] || 0)) {
    return { error: "Non hai abbastanza cristalli" };
  }

  g.hands[userId] = g.hands[userId].filter((c) => c.id !== realCard.id);
  g.crystals[userId] -= realCard.cost;

  if (realCard.type === "HERO") {
    g.boards[userId] = g.boards[userId] || [];
    if (g.boards[userId].length >= 6) {
      g.hands[userId].push(realCard);
      g.crystals[userId] += realCard.cost;
      return { error: "Hai già 6 carte sul campo" };
    }

    const insertIndex = Math.max(
      0,
      Math.min(index ?? g.boards[userId].length, g.boards[userId].length)
    );

    // for (const c of g.boards[userId] || []) {
    //   if (c.frozenFor && c.frozenFor > 0) c.frozenFor--;
    //   if (c.stunnedFor && c.stunnedFor > 0) c.stunnedFor--;
    // }
    g.boards[userId].splice(insertIndex, 0, {
      ...realCard,
      restingUntilTurn: g.currentTurn + 1,
      //   canAttack:
      //     hasAbility(card, "CHARGE") || hasAbility(card, "RUSH") || false,
    });
    addVisualEvent(g, {
      type: "SUMMON",
      cardId: realCard.id,
      owner: userId,
    });

    emitPassiveTrigger(EffectTriggers.ON_ENTER_BOARD, g, {
      target: realCard.id,
      source: userId,
    });

    await triggerEffects({
      trigger: EffectTriggers.ON_PLAY,
      game: g,
      card: realCard,
      source: userId,
      target: realCard.targetId ?? null,
    });
  } else if (realCard.type === "MAGIC") {
    await triggerEffects({
      trigger: EffectTriggers.ON_PLAY,
      game: g,
      card: realCard,
      source: userId,
      target: realCard.targetId ?? null,
    });

    await emitPassiveTrigger(EffectTriggers.ON_ENTER_BOARD, g, {
      source: userId,
      target: userId,
      value: card,
    });
  }

  if (realCard.effect && realCard.effect.trigger !== EffectTriggers.ON_PLAY) {
    registerPassiveEffects(gameId, [
      { effect: realCard.effect, card: realCard, owner: userId },
    ]);
  }

  emitPassiveTrigger(EffectTriggers.ON_CARD_PLAYED, g, {
    target: realCard.id,
    source: userId,
  });

  checkDeadCards(gameId, g);
  checkVictoryConditions(gameId, games, (gid, w, l) =>
    endGame(gid, games, ioInstance, w, l)
  );

  return {
    game: g,
    log: {
      type: "PLAY_CARD",
      actor: userId,
      details: {
        cardId: realCard.id,
        cardName: realCard.name,
        index,
      },
    },
  };
}
export function handleAttack({
  gameId,
  attacker,
  target,
  userId,
  games,
  ioInstance,
}) {
  const g = games[gameId];
  if (!g || g.status === "ended") return { error: "Partita non valida" };
  if (userId !== g.currentPlayerId) return { error: "Non è il tuo turno" };

  const myBoard = g.boards[userId] || [];
  const realAttacker = myBoard.find((c) => c.id === attacker.id);
  if (!realAttacker) return { error: "Attaccante non valido" };

  const { allowed, reason } = canAttack(realAttacker, target, g, userId);
  if (!allowed) {
    return { error: reason || "Questa pedina non può attaccare questo turno" };
  }
  emitPassiveTrigger(EffectTriggers.ON_ATTACK, g, {
    source: userId,
    target,
    value: realAttacker.attack,
  });

  if (target.type === "HERO") {
    const defBoard = g.boards[target.playerId] || [];
    const realTarget = defBoard.find((c) => c.id === target.id);
    if (!realTarget) return { error: "Bersaglio non trovato" };

    emitPassiveTrigger(EffectTriggers.ON_ATTACKED, g, {
      source: userId,
      target: realTarget.id,
      value: realAttacker.attack,
    });

    const shielded = handleDivineShield(realTarget, realAttacker);
    if (!shielded) {
      realTarget.defense -= realAttacker.attack;
      realAttacker.defense -= realTarget.attack;

      addVisualEvent(g, {
        type: "DAMAGE",
        cardId: realTarget.id,
        amount: realAttacker.attack,
        source: userId,
      });

      addVisualEvent(g, {
        type: "DAMAGE",
        cardId: realAttacker.id,
        amount: realTarget.attack,
        source: target.playerId,
      });
    }

    if (
      !shielded &&
      hasAbility(realAttacker, "LIFESTEAL") &&
      realAttacker.attack > 0
    ) {
      g.health[userId] = Math.min(
        20,
        (g.health[userId] || 0) + realAttacker.attack
      );
      addVisualEvent(g, {
        type: "LIFESTEAL",
        source: userId,
        amount: realAttacker.attack,
      });
    }

    realAttacker.abilities = realAttacker.abilities?.filter(
      (a) => a !== "STEALTH"
    );
    realTarget.abilities = realTarget.abilities?.filter((a) => a !== "STEALTH");

    if (realTarget.defense <= 0) {
      unregisterPassiveEffectsByCard(gameId, realTarget.id);
      emitPassiveTrigger(EffectTriggers.ON_DEATH, g, {
        target: realTarget.id,
        source: userId,
      });
    }
    if (realAttacker.defense <= 0) {
      unregisterPassiveEffectsByCard(gameId, realAttacker.id);
      emitPassiveTrigger(EffectTriggers.ON_DEATH, g, {
        target: realAttacker.id,
        source: userId,
      });
    }
  } else if (target.type === "FACE") {
    g.health[target.playerId] -= realAttacker.attack;

    if (hasAbility(realAttacker, "LIFESTEAL") && realAttacker.attack > 0) {
      g.health[userId] = Math.min(
        20,
        (g.health[userId] || 0) + realAttacker.attack
      );
    }

    emitPassiveTrigger(EffectTriggers.ON_DAMAGE_RECEIVED, g, {
      target: target.playerId,
      value: realAttacker.attack,
    });

    if (g.health[target.playerId] <= 0) {
      endGame(gameId, games, ioInstance, userId, target.playerId);
    }
  }

  const updatedAtt = g.boards[userId]?.find((c) => c.id === realAttacker.id);
  if (updatedAtt) updatedAtt.justPlayed = true;
  realAttacker.hasAttackedThisTurn = true;

  checkDeadCards(gameId, g);
  checkVictoryConditions(gameId, games, (gid, w, l) =>
    endGame(gid, games, ioInstance, w, l)
  );

  return {
    game: g,
    log: {
      type: "ATTACK",
      actor: userId,
      details: {
        attackerId: attacker.id,
        targetId: target.id,
      },
    },
  };
}

export function handleEndTurn({ gameId, userId, games }) {
  const g = games[gameId];
  if (!g) return { error: "Partita non trovata" };
  if (g.status === "ended") return { error: "La partita è terminata" };
  if (!g.userIds.includes(userId)) return { error: "Giocatore non valido" };
  if (g.currentPlayerId !== userId) return { error: "Non è il tuo turno" };

  emitPassiveTrigger(EffectTriggers.ON_TURN_END, g, { target: userId });

  // 🔄 Cambia il turno
  g.currentTurnIndex = (g.currentTurnIndex + 1) % g.userIds.length;
  const nextPlayerId = g.userIds[g.currentTurnIndex];
  g.currentPlayerId = nextPlayerId;

  // 🔢 Incrementa turno globale solo a fine ciclo
  if (g.currentTurnIndex === 0) {
    g.currentTurn = (g.currentTurn ?? 0) + 1;
  }

  // 💠 Aggiorna cristalli
  const maxCrystals = Math.min((g.maxCrystals[nextPlayerId] || 0) + 1, 10);
  g.maxCrystals[nextPlayerId] = maxCrystals;
  g.crystals[nextPlayerId] = maxCrystals;

  // 🎯 Trigger pre-pesca
  emitPassiveTrigger(EffectTriggers.ON_DRAW_PHASE, g, { target: nextPlayerId });

  // 📥 Pesca carta
  const drawnCard = g.decks[nextPlayerId]?.shift() || null;
  if (drawnCard) {
    g.hands[nextPlayerId] = g.hands[nextPlayerId] || [];
    g.hands[nextPlayerId].push(drawnCard);
    addVisualEvent(g, {
      type: "DRAW",
      cardId: drawnCard.id,
      owner: nextPlayerId,
    });
  }

  // 🔁 Reset stato creature
  for (const c of g.boards[nextPlayerId] || []) {
    c.hasAttackedThisTurn = false;

    // 🔻 Riduci durata effetti negativi
    if (c.frozenFor && c.frozenFor > 0) c.frozenFor--;
    if (c.stunnedFor && c.stunnedFor > 0) c.stunnedFor--;
  }

  // 🚀 Trigger di inizio turno
  emitPassiveTrigger(EffectTriggers.ON_TURN_START, g, {
    target: nextPlayerId,
  });

  // ✅ Risultato finale
  return {
    game: g,
    log: {
      type: "END_TURN",
      actor: userId,
      details: {
        nextPlayer: nextPlayerId,
        turn: g.currentTurn,
      },
    },
    effects: {
      drawnCard,
    },
  };
}
