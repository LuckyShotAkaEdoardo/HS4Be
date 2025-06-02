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
  checkDeadCards,
  getValidTargetIds,
} from "./gameUtils.js";

export async function handlePlayCard({
  gameId,
  card,
  index,
  userId,
  games,
  ioInstance,
  targets,
}) {
  const g = games[gameId];
  if (!g || g.status === "ended") return { error: "Partita non valida" };
  if (userId !== g.currentPlayerId) return { error: "Non è il tuo turno" };

  const realCard = g.hands[userId].find((c) => c.id === card.id);
  if (!realCard) return { error: "La carta non è nella tua mano" };
  if (realCard.cost > (g.crystals[userId] || 0)) {
    return { error: "Non hai abbastanza cristalli" };
  }
  var effectsResult = [];
  // 🏹 Validazione e assegnazione target
  if (targets?.length > 0 && realCard.effect?.target.includes("CHOOSE")) {
    // console.log("guarda qui", realCard.effect.target, userId, g);
    const validTargets = getValidTargetIds(realCard.effect.target, userId, g);
    // console.log("guarda i valids target", validTargets);
    const invalidTargets = targets.filter((t) => !validTargets.includes(t));
    if (invalidTargets.length > 0) {
      return { error: `Target non valido: ${invalidTargets.join(", ")}` };
    }
    realCard.effect.target = [...targets]; // Salvo sul vero oggetto in uso

    // console.log("guarda quello che arriva da fe", targets);
    // console.log("guarda quello che trova be", realCard.effect.target);
  }

  // ✂️ Rimuovo carta dalla mano e cristalli
  g.hands[userId] = g.hands[userId].filter((c) => c.id !== realCard.id);
  g.crystals[userId] -= realCard.cost;
  if (realCard.type === "MAGIC") {
  }
  // 🧱 Solo se HERO → inserisci in board
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

    realCard.restingUntilTurn = g.currentTurn + 1;
    g.boards[userId].splice(insertIndex, 0, realCard);

    addVisualEvent(g, {
      type: "SUMMON",
      cardId: realCard.id,
      owner: userId,
    });

    const effectsRe = await triggerEffects({
      trigger: EffectTriggers.ON_ENTER_BOARD,
      game: g,
      card: realCard,
      source: userId,
      target: realCard.effect?.target ?? realCard.id, // fallback
    });
    if (effectsRe) {
      effectsResult.push(effectsRe);
    }
    console.log("risultato effetto", effectsResult); // 🔥 Trigger effetto attivo
  }

  if (realCard.effect?.trigger === EffectTriggers.ON_PLAY) {
    const effectsRe = await triggerEffects({
      trigger: EffectTriggers.ON_PLAY,
      game: g,
      card: realCard,
      source: userId,
      target: realCard.effect.target ?? null,
    });
    if (effectsRe) {
      effectsResult.push(effectsRe);
    }
    console.log("risultato effetto", effectsResult); // 🔥 Trigger effetto attivo
  }

  // 🌀 Registra effetti passivi non ON_PLAY
  if (realCard.effect && realCard.effect.trigger !== EffectTriggers.ON_PLAY) {
    //  console.log("REAL REGISTER EFFECT", JSON.stringify(realCard.effect));

    registerPassiveEffects(gameId, [
      { effect: realCard.effect, card: realCard, owner: userId },
    ]);
  }

  // 🎯 Trigger globali
  emitPassiveTrigger(EffectTriggers.ON_CARD_PLAYED, g, {
    target: realCard.id,
    source: userId,
  });

  checkDeadCards(gameId, g);
  checkVictoryConditions(gameId, games, (gid, w, l) =>
    endGame(gid, games, ioInstance, w, l)
  );
  const passiveEffects = g.effectResults ?? [];
  g.effectResults = []; // svuota il buffer

  return {
    game: g,
    log: {
      type: "PLAY_CARD",
      actor: userId,
      details: {
        cardId: realCard.id,
        cardName: realCard.name,
        index,
        effects: [...effectsResult, ...passiveEffects], // <<--- qui aggiungi anche gli effetti applicati
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
    //realTarget.abilities = realTarget.abilities?.filter((a) => a !== "STEALTH");

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
  const passiveEffects = g.effectResults ?? [];
  g.effectResults = []; // svuota il buffer
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
        target: target.id,
      },
      effects: [...passiveEffects],
    },
  };
}

export function handleEndTurn({ gameId, userId, games }) {
  const g = games[gameId];
  if (!g) return { error: "Partita non trovata" };
  if (g.status === "ended") return { error: "La partita è terminata" };
  if (!g.userIds.includes(userId)) return { error: "Giocatore non valido" };
  if (g.currentPlayerId !== userId) return { error: "Non è il tuo turno" };

  emitPassiveTrigger(EffectTriggers.ON_TURN_END, g, { actor: userId });
  emitPassiveTrigger(EffectTriggers.ON_END_TURN, g, { actor: userId });
  // 🔥 Tick: applica danno da bruciatura a tutte le carte che ne hanno una attiva
  for (const userId of g.userIds) {
    for (const card of g.boards[userId] || []) {
      if (card.burning && card.burning.duration > 0) {
        const damage = card.burning.value || 1;
        card.defense -= damage;

        addVisualEvent(g, {
          type: "BURN_TICK",
          cardId: card.id,
          amount: damage,
          source: "system",
        });

        card.burning.duration -= 1;

        if (card.burning.duration <= 0) {
          delete card.burning;
        }

        if (card.defense <= 0) {
          unregisterPassiveEffectsByCard(gameId, card.id);
          emitPassiveTrigger(EffectTriggers.ON_DEATH, g, {
            target: card.id,
            source: "burn",
          });
        }
      }
    }
  }

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
  emitPassiveTrigger(EffectTriggers.ON_DRAW_PHASE, g, { actor: nextPlayerId });

  // 📥 Pesca carta
  const drawnCard = g.decks[nextPlayerId]?.shift() || null;
  if (drawnCard) {
    g.hands[nextPlayerId] = g.hands[nextPlayerId] || [];
    g.hands[nextPlayerId].push(drawnCard);
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
    actor: nextPlayerId,
  });
  const passiveEffects = g.effectResults ?? [];
  g.effectResults = []; // svuota il buffer
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
    effects: [...passiveEffects],
    endTurn: {
      drawnCard: drawnCard ? { cardId: drawnCard.id } : null,
    },
  };
}
