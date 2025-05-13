// effectEngine.js (ripristinato e aggiornato con trigger avanzati e handler inclusi)

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
      for (const player of game.allPlayers) {
        const board = game.boards[player];
        if (!board) continue;
        const removed = board.find((c) => c.id === t);
        game.boards[player] = board.filter((c) => c.id !== t);
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
      for (const player of game.allPlayers) {
        for (const c of [...game.boards[player]]) {
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
      game.health[t] = Math.max(
        0,
        (game.health[t] || 0) - (value ?? card.effect.value)
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
};

export function triggerEffects({ trigger, game, card, source, target, value }) {
  if (!card.effect || card.effect.trigger !== trigger) return;

  if (typeof card.effect.handler === "function") {
    card.effect.handler({ game, source, target, card, value });
  } else if (effectHandlers[card.effect.type]) {
    effectHandlers[card.effect.type]({ game, card, source, target, value });
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

export function unregisterPassiveEffectsByCard(gameId, cardId) {
  const registry = passiveEffectRegistry.get(gameId);
  if (!registry) return;

  for (const trigger of Object.keys(registry)) {
    registry[trigger] = registry[trigger].filter(
      ({ card }) => card.id !== cardId
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
