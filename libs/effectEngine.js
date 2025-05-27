import { getRandomCards, matchesFilter } from "./gameUtils.js";
import { hasAbility } from "./card-helpers.js";

const passiveEffectRegistry = new Map(); // gameId => { trigger => [ { card, effect, owner } ] }

export const EffectTriggers = {
  ON_PLAY: "ON_PLAY",
  ON_END_TURN: "ON_END_TURN",
  ON_CARD_DRAWN: "ON_CARD_DRAWN",
  ON_DAMAGE_RECEIVED: "ON_DAMAGE_RECEIVED",
  ON_TURN_START: "ON_TURN_START",
  ON_ENTER_BOARD: "ON_ENTER_BOARD",
  ON_LEAVE_BOARD: "ON_LEAVE_BOARD",
  ON_CARD_PLAYED: "ON_CARD_PLAYED",
  ON_CARD_DESTROYED: "ON_CARD_DESTROYED",
  ON_CRYSTALS_GAINED: "ON_CRYSTALS_GAINED",
  ON_ATTACK: "ON_ATTACK",
  ON_ATTACKED: "ON_ATTACKED",
  ON_DRAW_PHASE: "ON_DRAW_PHASE",
  ON_TURN_END: "ON_TURN_END",
  ON_DEATH: "ON_DEATH",
};

const effectHandlers = {
  KILL: ({ game, card, source, target }) => {
    const applyKill = (t) => {
      for (const userId of game.allPlayers) {
        const board = game.boards[userId];
        if (!board) continue;
        const removed = board.find((c) => c.id === t);
        game.boards[userId] = board.filter((c) => c.id !== t);
        if (removed) {
          unregisterPassiveEffectsByCard(game.id, t);
          emitPassiveTrigger(EffectTriggers.ON_DEATH, game, {
            target: t,
            source,
            value: null,
          });
          break;
        }
      }
    };
    if (target === "ALL") {
      for (const userId of game.allPlayers) {
        for (const c of [...game.boards[userId]]) {
          applyKill(c.id);
        }
      }
    } else if (Array.isArray(target)) {
      target.forEach(applyKill);
    } else if (target) {
      applyKill(target);
    }
  },

  DAMAGE: ({ game, card, source, target, value }) => {
    const apply = (t) => {
      const damage = value ?? card.effect.value;
      const hasAntiBarrier = hasAbility?.(card, "ANTI_SHIELD");

      if (!hasAntiBarrier && game.barrier?.[t] > 0) {
        const absorb = Math.min(game.barrier[t], damage);
        game.barrier[t] -= absorb;
        const remaining = damage - absorb;
        if (remaining > 0) {
          game.health[t] = Math.max(0, game.health[t] - remaining);
        }
      } else {
        game.health[t] = Math.max(0, game.health[t] - damage);
      }
    };

    if (target === "ALL") {
      Object.keys(game.health).forEach(apply);
    } else if (Array.isArray(target)) {
      target.forEach(apply);
    } else if (target) {
      apply(target);
    }
  },

  HEAL: ({ game, card, source, target, value }) => {
    const apply = (t) => {
      game.health[t] = Math.min(
        20,
        (game.health[t] || 0) + (value ?? card.effect.value)
      );
    };
    if (target === "ALL") {
      Object.keys(game.health).forEach(apply);
    } else if (Array.isArray(target)) {
      target.forEach(apply);
    } else if (target) {
      apply(target);
    }
  },

  DRAW: ({ game, source, value }) => {
    const drawn = game.decks[source].splice(0, value ?? 1);
    game.hands[source].push(...drawn);
  },

  SUMMON: async ({ game, card, source, value, target }) => {
    const player = target || source;
    const board = game.boards[player] || [];

    const maxSummonable = 6 - board.length;
    if (maxSummonable <= 0) return;

    const count = Math.min(value ?? 1, maxSummonable);
    const effect = card.effect || {};
    let summoned = [];

    // 🔷 cardIds diretti
    if (Array.isArray(effect.cardIds) && effect.cardIds.length > 0) {
      const fullCards = await getCardsByIds(effect.cardIds);
      summoned = fullCards.slice(0, count);
    }

    // 🔷 pool + filtro
    else if (Array.isArray(effect.pool) && effect.pool.length > 0) {
      let pool = await getCardsByIds(effect.pool);
      if (effect.filter) {
        pool = pool.filter((c) => matchesFilter(c, effect.filter));
      }
      summoned = pickRandom(pool, count);
    }

    // 🔷 fallback: tipo + filtro (casuale da DB)
    else {
      let all = await getRandomCards({
        count: 100,
        type: effect.subtype || "HERO",
      }); // prendi un campione ampio
      if (effect.filter) {
        all = all.filter((c) =>
          Object.entries(effect.filter).every(([key, val]) => c[key] === val)
        );
      }
      summoned = pickRandom(all, count);
    }

    game.boards[player].push(...summoned);
  },
  SHIELD: ({ game, target, value = 1 }) => {
    const targets = Array.isArray(target) ? target : [target];
    for (const t of targets) {
      game.barrier[t] = (game.barrier[t] || 0) + value;
    }
  },
  CRYSTALS: ({ game, source, value = 1, card }) => {
    const mode = card.effect.mode || "available";
    if (mode === "max") {
      game.maxCrystals[source] = Math.min(
        10,
        (game.maxCrystals[source] || 0) + value
      );
    } else {
      game.crystals[source] = Math.min(
        game.maxCrystals[source] || 10,
        (game.crystals[source] || 0) + value
      );
    }
  },

  BUFF_ATTACK: ({ game, target, value }) => {
    const targets = Array.isArray(target) ? target : [target];
    for (const uid of game.userIds) {
      for (const card of game.boards[uid] || []) {
        if (targets.includes(card.id)) {
          card.attack += value;
        }
      }
    }
  },

  BUFF_DEFENSE: ({ game, target, value }) => {
    const targets = Array.isArray(target) ? target : [target];
    for (const uid of game.userIds) {
      for (const card of game.boards[uid] || []) {
        if (targets.includes(card.id)) {
          card.defense += value;
        }
      }
    }
  },
  SILENCE: ({ game, target }) => {
    const targets = Array.isArray(target) ? target : [target];
    for (const uid of game.userIds) {
      for (const card of game.boards[uid] || []) {
        if (targets.includes(card.id)) {
          card.abilities = [];
        }
      }
    }
  },

  COPY_CARD: ({ game, source, target }) => {
    const opponentId = game.userIds.find((u) => u !== source);
    const cardToCopy = game.boards[opponentId]?.find((c) => c.id === target);
    if (cardToCopy && game.hands[source].length < 10) {
      const clone = {
        ...cardToCopy,
        id: `${cardToCopy.id}-copy-${Date.now()}`,
      };
      game.hands[source].push(clone);
    }
  },

  STEAL_CARD: ({ game, source }) => {
    const opponentId = game.userIds.find((u) => u !== source);
    const card = game.hands[opponentId]?.shift();
    if (card && game.hands[source].length < 10) {
      game.hands[source].push(card);
    }
  },

  MILL: ({ game, source, value = 1 }) => {
    const opponentId = game.userIds.find((u) => u !== source);
    game.decks[opponentId]?.splice(0, value);
  },

  REMOVE_EFFECTS: ({ game, target }) => {
    const gameId = game.id;
    const cardId = target;
    unregisterPassiveEffectsByCard(gameId, cardId);
  },
  TAUNT: ({ game, target }) => {
    for (const uid of game.userIds) {
      const card = game.boards[uid]?.find((c) => c.id === target);
      if (card && !card.abilities.includes("TAUNT")) {
        card.abilities.push("TAUNT");
      }
    }
  },

  DISCARD: ({ game, source, value = 1 }) => {
    const opponentId = game.userIds.find((u) => u !== source);
    game.hands[opponentId]?.splice(0, value);
  },
  FREEZE: ({ game, target, value = 1 }) => {
    const targets = Array.isArray(target) ? target : [target];
    for (const uid of game.userIds) {
      for (const card of game.boards[uid] || []) {
        if (targets.includes(card.id)) {
          card.frozenFor = value;
        }
      }
    }
  },

  STUN: ({ game, target, value = 1 }) => {
    const targets = Array.isArray(target) ? target : [target];
    for (const uid of game.userIds) {
      for (const card of game.boards[uid] || []) {
        if (targets.includes(card.id)) {
          card.stunnedFor = value;
        }
      }
    }
  },
  POLYMORPH: ({ game, target, card }) => {
    const intoId = card.effect.intoCardId;
    for (const uid of game.userIds) {
      const board = game.boards[uid];
      const index = board.findIndex((c) => c.id === target);
      if (index !== -1 && intoId) {
        board[index] = {
          id: `${intoId}-${Date.now()}`,
          _id: intoId,
          name: "Pecora",
          attack: 1,
          defense: 1,
          cost: 1,
          abilities: [],
        };
      }
    }
  },

  TRANSFORM: async ({ game, target, card }) => {
    const subtype = card.effect.subtype || "HERO";
    const newCard = (
      await getRandomCards({ count: 1, mode: "summon", type: subtype })
    )[0];
    for (const uid of game.userIds) {
      const board = game.boards[uid];
      const index = board.findIndex((c) => c.id === target);
      if (index !== -1 && newCard) {
        board[index] = { ...newCard, id: `${newCard._id}-${Date.now()}` };
      }
    }
  },

  RETURN_HAND: ({ game, target }) => {
    for (const uid of game.userIds) {
      const board = game.boards[uid];
      const index = board.findIndex((c) => c.id === target);
      if (index !== -1 && game.hands[uid].length < 10) {
        const [card] = board.splice(index, 1);
        game.hands[uid].push(card);
      }
    }
  },
  BURN: ({ game, target, value = 1, duration = 2 }) => {
    const targets = Array.isArray(target) ? target : [target];
    for (const uid of game.userIds) {
      for (const card of game.boards[uid] || []) {
        if (targets.includes(card.id)) {
          card.burning = { value, duration };
        }
      }
    }
  },

  SET_STATS: ({ game, target, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const { attack, defense } = card.effect?.value || {};

    for (const uid of game.userIds) {
      for (const c of game.boards[uid] || []) {
        if (targets.includes(c.id)) {
          if (typeof attack === "number") c.attack = attack;
          if (typeof defense === "number") c.defense = defense;
        }
      }
    }
  },

  NO_HEAL: ({ game, target, duration = 1 }) => {
    for (const uid of game.userIds) {
      const card = game.boards[uid]?.find((c) => c.id === target);
      if (card) card.noHealFor = duration;
    }
  },

  SACRIFICE: ({ game, source, target }) => {
    const board = game.boards[source];
    game.boards[source] = board.filter((c) => c.id !== target);
    unregisterPassiveEffectsByCard(game.id, target);
  },

  SWAP_STATS: ({ game, target }) => {
    for (const uid of game.userIds) {
      const card = game.boards[uid]?.find((c) => c.id === target);
      if (card) {
        const tmp = card.attack;
        card.attack = card.defense;
        card.defense = tmp;
      }
    }
  },

  DELAY_DRAW: ({ game, target }) => {
    game.skipDrawPhase = game.skipDrawPhase || {};
    game.skipDrawPhase[target] = true;
  },

  // REDIRECT_DAMAGE: ({ game, card }) => {
  //   // questo richiede logica speciale nel sistema di danno
  //   // placeholder: potrebbe settare una bandiera nel game
  //   game.damageRedirect = {
  //     from: card.effect.source,
  //     to: card.effect.newTarget,
  //   };
  // },
};
export async function triggerEffects({
  trigger,
  game,
  card,
  source,
  target,
  value,
}) {
  if (!card.effect || card.effect.trigger !== trigger) return;

  const rawTarget = target ?? card.effect.target ?? null;
  const count = card.effect.count;
  const resolvedTargets = resolveTargets({
    target: rawTarget,
    source,
    game,
    count,
  });

  if (typeof card.effect.handler === "function") {
    await card.effect.handler({
      game,
      card,
      source,
      target: resolvedTargets,
      value,
    });
  } else if (effectHandlers[card.effect.type]) {
    for (const t of resolvedTargets) {
      await effectHandlers[card.effect.type]({
        game,
        card,
        source,
        target: t,
        value,
      });
    }
  }
}

export function registerPassiveEffects(gameId, effects) {
  if (!passiveEffectRegistry.has(gameId)) {
    passiveEffectRegistry.set(gameId, {});
  }

  const registry = passiveEffectRegistry.get(gameId);
  for (const { effect, card, owner } of effects) {
    if (!registry[effect.trigger]) registry[effect.trigger] = [];
    registry[effect.trigger].push({ card, effect, owner });
  }
}

export function unregisterPassiveEffectsByCard(gameId, cardId, isDbId = false) {
  const registry = passiveEffectRegistry.get(gameId);
  if (!registry) return;

  for (const trigger of Object.keys(registry)) {
    registry[trigger] = registry[trigger].filter(
      ({ card }) => (isDbId ? card._id?.toString() : card.id) !== cardId
    );
    if (registry[trigger].length === 0) delete registry[trigger];
  }
}

export function clearPassiveEffects(gameId) {
  passiveEffectRegistry.delete(gameId);
}

export function emitPassiveTrigger(trigger, game, eventData) {
  const reg = passiveEffectRegistry.get(game.id);
  if (!reg || !reg[trigger]) return;

  for (const { card, effect, owner } of reg[trigger]) {
    triggerEffects({
      trigger,
      game,
      card,
      source: owner,
      target: eventData.target,
      value: eventData.value,
    });
  }
}
export function resolveTargets({ target, source, game, count }) {
  if (!target) return [];

  const limit = parseInt(count) || Infinity;

  if (typeof target === "string") {
    const opponentId = game.userIds.find((id) => id !== source);
    const allyId = source;

    switch (target) {
      case "ALL_PLAYERS":
        return game.userIds.slice(0, limit);

      case "ALL_CARDS":
        return game.userIds
          .flatMap((uid) => game.boards[uid]?.map((c) => c.id) || [])
          .slice(0, limit);

      case "SELF":
        return [source];

      case "OPPONENT":
        return [opponentId];

      case "ALL_ALLIES":
        return game.boards[allyId]?.map((c) => c.id).slice(0, limit) || [];

      case "ALL_ENEMIES":
        return game.boards[opponentId]?.map((c) => c.id).slice(0, limit) || [];

      case "ENEMY_CARD":
        return game.boards[opponentId]?.map((c) => c.id).slice(0, limit) || [];

      case "ALLY":
        return game.boards[allyId]?.map((c) => c.id).slice(0, limit) || [];

      case "RANDOM_ENEMY": {
        const enemyBoard = game.boards[opponentId] || [];
        return shuffle(enemyBoard)
          .slice(0, limit)
          .map((c) => c.id);
      }

      case "WEAKEST_ENEMY": {
        const sorted = [...(game.boards[opponentId] || [])].sort(
          (a, b) => a.defense - b.defense
        );
        return sorted.slice(0, limit).map((c) => c.id);
      }

      case "STRONGEST_ENEMY": {
        const sorted = [...(game.boards[opponentId] || [])].sort(
          (a, b) => b.attack - a.attack
        );
        return sorted.slice(0, limit).map((c) => c.id);
      }

      default:
        // fallback: ID diretto
        return [target];
    }
  }

  if (Array.isArray(target)) {
    return target.slice(0, limit);
  }

  return [];
}

export const TargetOptions = {
  // Personali
  SELF: "SELF",
  ALLY: "ALLY",
  ALL_ALLIES: "ALL_ALLIES",

  // Nemici
  OPPONENT: "OPPONENT",
  ENEMY_CARD: "ENEMY_CARD",
  ALL_ENEMIES: "ALL_ENEMIES",
  RANDOM_ENEMY: "RANDOM_ENEMY",
  WEAKEST_ENEMY: "WEAKEST_ENEMY",
  STRONGEST_ENEMY: "STRONGEST_ENEMY",

  // Tutti
  ALL_PLAYERS: "ALL_PLAYERS",
  ALL_CARDS: "ALL_CARDS",

  // Scelta manuale
  CHOOSE_ENEMY: "CHOOSE_ENEMY",
  CHOOSE_ALLY: "CHOOSE_ALLY",
  CHOOSE_ANY: "CHOOSE_ANY",
};
