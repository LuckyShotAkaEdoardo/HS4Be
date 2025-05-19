import { getRandomCards } from "./gameUtils.js";

export function hasAbility(card, ability) {
  return card.abilities?.includes(ability);
}

export function canAttack(attacker, target, game, userId) {
  if (!attacker || !game || !userId) return false;

  // 🛡️ Non può attaccare se è morto
  if (attacker.defense <= 0) return false;

  // ❌ Se ha già attaccato in questo turno
  if (attacker.hasAttackedThisTurn) return false;

  // 🔁 Se è in "quiete" (cioè appena evocato), blocca l'attacco
  const needsRest =
    attacker.restingUntilTurn != null &&
    attacker.restingUntilTurn > (game.currentTurn ?? 0);

  const hasCharge = hasAbility(attacker, "CHARGE");
  const hasRush = hasAbility(attacker, "RUSH");

  if (needsRest && !hasCharge && !hasRush) return false;

  // ❄️ Effetti di controllo
  if (attacker.frozenFor > 0 || attacker.stunnedFor > 0) return false;

  // 🚫 Rush non può attaccare il FACE
  if (hasRush && target?.type === "FACE") return false;

  // 🧱 Se attacca il FACE e ci sono WALL nemici, blocca
  if (target?.type === "FACE") {
    const opponentId = game.allPlayers.find((u) => u !== userId);
    const enemyBoard = game.boards[opponentId] || [];
    const wallExists = enemyBoard.some((c) => hasAbility(c, "WALL"));
    if (wallExists) return false;
  }

  return true;
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
