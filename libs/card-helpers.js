import { getRandomCards } from "./gameUtils.js";

export function hasAbility(card, ability) {
  return card.abilities?.includes(ability);
}

export function canAttack(attacker, target, game, userId) {
  if (!attacker || !game || !userId) {
    console.log("[BLOCK] Dati incompleti");
    return { allowed: false, reason: "Dati incompleti" };
  }

  if (attacker.defense <= 0) {
    console.log("[BLOCK] Carta morta");
    return { allowed: false, reason: "La carta è morta" };
  }

  if (attacker.hasAttackedThisTurn) {
    console.log("[BLOCK] Ha già attaccato");
    return { allowed: false, reason: "Ha già attaccato in questo turno" };
  }

  const needsRest =
    attacker.restingUntilTurn != null &&
    attacker.restingUntilTurn > (game.currentTurn ?? 0);

  const hasCharge = hasAbility(attacker, "CHARGE");
  const hasRush = hasAbility(attacker, "RUSH");

  if (needsRest && !hasCharge && !hasRush) {
    console.log(`[BLOCK] In quiete fino al turno ${attacker.restingUntilTurn}`);
    return {
      allowed: false,
      reason: `È in quiete fino al turno ${attacker.restingUntilTurn}`,
    };
  }

  if (attacker.frozenFor > 0) {
    console.log("[BLOCK] Congelata");
    return { allowed: false, reason: "È congelata" };
  }

  if (attacker.stunnedFor > 0) {
    console.log("[BLOCK] Stordita");
    return { allowed: false, reason: "È stordita" };
  }

  if (hasRush && target?.type === "FACE") {
    console.log("[BLOCK] RUSH vs FACE");
    return {
      allowed: false,
      reason: "RUSH può attaccare solo creature",
    };
  }

  if (target?.type === "FACE") {
    const opponentId = game.allPlayers.find((u) => u !== userId);
    const enemyBoard = game.boards[opponentId] || [];
    const wallExists = enemyBoard.some((c) => hasAbility(c, "WALL"));
    if (wallExists) {
      console.log("[BLOCK] WALL nemico presente");
      return {
        allowed: false,
        reason: "Il FACE è protetto da un WALL nemico",
      };
    }
  }

  console.log("[OK] Può attaccare");
  return { allowed: true };
}

export function handleDivineShield(defender, attacker) {
  if (hasAbility(defender, "DIVINE_SHIELD")) {
    defender.abilities = defender.abilities.filter(
      (a) => a !== "DIVINE_SHIELD"
    );
    attacker.defense -= defender.attack;
    return true;
  }
  return false;
}

export async function summonRandomHeroes(game, userId, count = 1) {
  const randomCards = await getRandomCards({
    count,
    mode: "summon",
    type: "HERO",
  });

  for (const card of randomCards) {
    if ((game.boards[userId]?.length || 0) >= 6) break;
    game.boards[userId].push(card);
  }
}
export function extractUsername(internalId) {
  const parts = internalId.split("---");
  parts.pop(); // Rimuove l'ultimo elemento (userId)
  return parts.join("---"); // Ricostruisce lo username
}
export function extractUserId(internalId) {
  const parts = internalId.split("---");
  return parseInt(parts[parts.length - 1], 10);
}
