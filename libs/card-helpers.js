// cardHelpers.js

export function hasAbility(card, ability) {
  return card.abilities?.includes(ability);
}

export function canAttack(attacker, target, game, username) {
  if (
    attacker.justPlayed &&
    !hasAbility(attacker, "CHARGE") &&
    !hasAbility(attacker, "RUSH")
  )
    return false;
  if (hasAbility(attacker, "RUSH") && target.type === "FACE") return false;
  if (target.type === "FACE") {
    const opponent = game.allPlayers.find((u) => u !== username);
    const enemyBoard = game.boards[opponent] || [];
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

export function summonRandomHeroes(game, owner, count, from = "deck") {
  const pool = game[from]?.[owner] || [];
  const heroes = pool.filter((c) => c.type === "HERO");
  const selected = shuffle([...heroes]).slice(0, count);

  game.boards[owner] = game.boards[owner] || [];
  for (const card of selected) {
    card.justPlayed = true;
    game.boards[owner].push(card);
  }
  game[from][owner] = pool.filter((c) => !selected.includes(c));
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
