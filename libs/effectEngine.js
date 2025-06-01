import { getRandomCards } from "./gameUtils.js";
import { hasAbility } from "./card-helpers.js";
import passiveEffectRegistry from "./passiveRegistry.js";

// const passiveEffectRegistry = new Map(); // gameId => { trigger => [ { card, effect, owner } ] }

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
  BURN: ({ game, target, value = 1, duration = 2, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      for (const c of game.boards[uid] || []) {
        if (targets.includes(c.id)) {
          // Applica l'effetto reale
          c.burning = { value, duration };

          // Aggiungi il log
          result.push({
            type: "BURN",
            source: card?.id ?? null,
            to: c.id,
            value,
            duration,
          });
        }
      }
    }

    return result;
  },
  BUFF_ATTACK: ({ game, target, value, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      for (const c of game.boards[uid] || []) {
        if (targets.includes(c.id)) {
          // Applica il buff
          c.attack += value;

          // Registra il log
          result.push({
            type: "BUFF_ATTACK",
            source: card?.id ?? null,
            to: c.id,
            amount: value,
          });
        }
      }
    }

    return result;
  },
  BUFF_DEFENSE: ({ game, target, value, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      for (const c of game.boards[uid] || []) {
        if (targets.includes(c.id)) {
          // Applica il buff
          c.defense += value;

          // Registra il log
          result.push({
            type: "BUFF_DEFENSE",
            source: card?.id ?? null,
            to: c.id,
            amount: value,
          });
        }
      }
    }

    return result;
  },
  // COPY_CARD: ({ game, source, target, card }) => {
  //   const opponentId = game.userIds.find((u) => u !== source);
  //   const cardToCopy = game.boards[opponentId]?.find((c) => c.id === target);

  //   if (cardToCopy && game.hands[source].length < 10) {
  //     // Crea copia con nuovo ID
  //     const clone = {
  //       ...cardToCopy,
  //       id: `${cardToCopy.id}-copy-${Date.now()}`,
  //     };

  //     // Aggiungi alla mano del giocatore
  //     game.hands[source].push(clone);

  //     // Log
  //     return [
  //       {
  //         type: "COPY_CARD",
  //         source: card?.id ?? null,
  //         copiedFrom: cardToCopy.id,
  //         copyId: clone.id,
  //       },
  //     ];
  //   }

  //   return [];
  // },
  COPY_CARD: ({ game, source, target, card }) => {
    const allBoards = game.userIds.flatMap((uid) => game.boards[uid] || []);
    const cardToCopy = allBoards.find((c) => c.id === target);

    if (cardToCopy && game.hands[source]?.length < 10) {
      const clone = {
        ...cardToCopy,
        id: `${cardToCopy.id}-copy-${Date.now()}`,
      };

      // Evita effetti attivi duplicati se non desiderato
      delete clone.effect;

      game.hands[source].push(clone);

      return [
        {
          type: "COPY_CARD",
          source: card?.id ?? null,
          copiedFrom: cardToCopy.id,
          copyId: clone.id,
          to: source,
        },
      ];
    }

    return [];
  },
  CRYSTALS: ({ game, source, value = 1, card }) => {
    const mode = card?.effect?.mode || "available";
    let added = 0;

    if (mode === "max") {
      // Aggiunta a maxCrystals
      game.maxCrystals[source] = Math.min(
        10,
        (game.maxCrystals[source] || 0) + value
      );
      added = value;
    } else {
      // Aggiunta a cristalli disponibili
      const current = game.crystals[source] || 0;
      const max = game.maxCrystals[source] || 10;
      added = Math.min(max - current, value);
      game.crystals[source] = current + added;
    }

    return [
      {
        type: "CRYSTALS",
        source: card?.id ?? null,
        player: source,
        amount: added,
        mode,
      },
    ];
  },
  DELAY_DRAW: ({ game, target, card }) => {
    if (!game.skipDrawPhase) {
      game.skipDrawPhase = {};
    }

    // Blocca la pesca per il giocatore specificato
    game.skipDrawPhase[target] = true;

    return [
      {
        type: "DELAY_DRAW",
        source: card?.id ?? null,
        player: target,
      },
    ];
  },
  DISCARD: ({ game, source, value = 1, card }) => {
    const opponentId = game.userIds.find((u) => u !== source);
    const discarded = game.hands[opponentId]?.splice(0, value) || [];
    const result = [];

    for (const c of discarded) {
      result.push({
        type: "DISCARD",
        source: card?.id ?? null,
        player: opponentId,
        cardId: c.id,
      });
    }

    return result;
  },
  DRAW: ({ game, source, value = 1, card }) => {
    const drawn = game.decks[source]?.splice(0, value) || [];
    game.hands[source].push(...drawn);

    return drawn.map((c) => ({
      type: "DRAW",
      source: card?.id ?? null,
      player: source,
      cardId: c.id,
    }));
  },
  DAMAGE: ({ game, card, source, target, value }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];
    const damage = value ?? card?.effect?.value ?? 0;
    const hasAntiBarrier = hasAbility?.(card, "ANTI_SHIELD");

    const apply = (t) => {
      let dealt = 0;

      if (!hasAntiBarrier && game.barrier?.[t] > 0) {
        const absorb = Math.min(game.barrier[t], damage);
        game.barrier[t] -= absorb;
        const remaining = damage - absorb;
        if (remaining > 0) {
          if (game.health[t] != null) {
            game.health[t] = Math.max(0, game.health[t] - remaining);
            dealt = remaining;
          } else {
            // Cerca tra le carte
            for (const uid of game.userIds) {
              const card = game.boards[uid]?.find((c) => c.id === t);
              if (card) {
                card.defense = Math.max(0, card.defense - remaining);
                dealt = remaining;
                break;
              }
            }
          }
        }
      } else {
        if (game.health[t] != null) {
          game.health[t] = Math.max(0, game.health[t] - damage);
          dealt = damage;
        } else {
          for (const uid of game.userIds) {
            const card = game.boards[uid]?.find((c) => c.id === t);
            if (card) {
              card.defense = Math.max(0, card.defense - damage);
              dealt = damage;
              break;
            }
          }
        }
      }

      result.push({
        type: "DAMAGE",
        source: card?.id ?? null,
        to: t,
        amount: dealt,
      });
    };

    targets.forEach(apply);
    return result;
  },
  FREEZE: ({ game, target, value = 1, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      for (const c of game.boards[uid] || []) {
        if (targets.includes(c.id)) {
          c.frozenFor = value;
          result.push({
            type: "FREEZE",
            source: card?.id ?? null,
            to: c.id,
            duration: value,
          });
        }
      }
    }

    return result;
  },
  HEAL: ({ game, card, source, target, value }) => {
    const targets = Array.isArray(target) ? target : [target];
    const healValue = value ?? card?.effect?.value ?? 0;
    const result = [];

    for (const t of targets) {
      // 1. Se è una faccia (playerId)
      if (t in game.health) {
        const before = game.health[t];
        game.health[t] = Math.min(20, before + healValue);

        result.push({
          type: "HEAL",
          source: card?.id ?? null,
          to: t,
          amount: game.health[t] - before,
        });
      } else {
        // 2. Altrimenti cerca se è una carta in campo
        for (const uid of game.userIds) {
          const targetCard = game.boards[uid]?.find((c) => c.id === t);
          if (targetCard) {
            const before = targetCard.defense;
            targetCard.defense = Math.min(20, before + healValue);

            result.push({
              type: "HEAL",
              source: card?.id ?? null,
              to: targetCard.id,
              amount: targetCard.defense - before,
            });
            break;
          }
        }
      }
    }

    return result;
  },
  KILL: ({ game, card, source, target }) => {
    const targets =
      target === "ALL" ? [] : Array.isArray(target) ? target : [target];
    const result = [];

    const killCard = (id) => {
      for (const userId of game.allPlayers) {
        const board = game.boards[userId];
        const index = board.findIndex((c) => c.id === id);
        if (index !== -1) {
          const [removed] = board.splice(index, 1);
          unregisterPassiveEffectsByCard(game.id, id);
          emitPassiveTrigger(EffectTriggers.ON_DEATH, game, {
            target: id,
            source,
            value: null,
          });

          result.push({
            type: "KILL",
            source: card?.id ?? null,
            to: id,
          });
          break;
        }
      }
    };

    if (target === "ALL") {
      for (const userId of game.allPlayers) {
        for (const c of [...game.boards[userId]]) {
          killCard(c.id);
        }
      }
    } else {
      targets.forEach(killCard);
    }

    return result;
  },
  MILL: ({ game, source, value = 1, card }) => {
    const opponentId = game.userIds.find((u) => u !== source);
    const removed = game.decks[opponentId]?.splice(0, value) || [];

    return removed.map((c) => ({
      type: "MILL",
      source: card?.id ?? null,
      from: opponentId,
      cardId: c.id,
    }));
  },
  NO_HEAL: ({ game, target, duration = 1, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      for (const c of game.boards[uid] || []) {
        if (targets.includes(c.id)) {
          c.noHealFor = duration;
          result.push({
            type: "NO_HEAL",
            source: card?.id ?? null,
            to: c.id,
            duration,
          });
        }
      }
    }

    return result;
  },
  POLYMORPH: ({ game, target, card }) => {
    const intoId = card?.effect?.intoCardId;
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      const board = game.boards[uid];
      for (const t of targets) {
        const index = board.findIndex((c) => c.id === t);
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
          result.push({
            type: "POLYMORPH",
            source: card?.id ?? null,
            to: t,
            into: intoId,
          });
        }
      }
    }

    return result;
  },
  RETURN_HAND: ({ game, target, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      const board = game.boards[uid];
      for (const t of targets) {
        const index = board.findIndex((c) => c.id === t);
        if (index !== -1 && game.hands[uid].length < 10) {
          const [removed] = board.splice(index, 1);
          game.hands[uid].push(removed);

          result.push({
            type: "RETURN_HAND",
            source: card?.id ?? null,
            player: uid,
            cardId: removed.id,
          });
        }
      }
    }

    return result;
  },
  REMOVE_EFFECTS: ({ game, target, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const t of targets) {
      unregisterPassiveEffectsByCard(game.id, t);
      result.push({
        type: "REMOVE_EFFECTS",
        source: card?.id ?? null,
        cardId: t,
      });
    }

    return result;
  },
  SACRIFICE: ({ game, source, target, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const t of targets) {
      const board = game.boards[source];
      const index = board.findIndex((c) => c.id === t);
      if (index !== -1) {
        board.splice(index, 1);
        unregisterPassiveEffectsByCard(game.id, t);
        result.push({
          type: "SACRIFICE",
          source: card?.id ?? null,
          player: source,
          cardId: t,
        });
      }
    }

    return result;
  },
  SET_STATS: ({ game, target, card }) => {
    console.log("CIAO SONO PASSIVO", target, "card", card);
    const targets = Array.isArray(target) ? target : [target];
    const { attack, defense } = card?.effect?.value || {};
    const result = [];
    for (const t of targets) {
      console.log("target:", t, typeof t);
      console.log("c.id:", card.id, typeof card.id);
      console.log("uguali === ?", t === card.id);
      console.log("uguali via String() ?", String(t) === String(card.id));
    }
    for (const uid of game.userIds) {
      const board = game.boards[uid] || [];
      for (const c of board) {
        if (targets.includes(c.id)) {
          if (typeof attack === "number") c.attack = attack;
          if (typeof defense === "number") c.defense = defense;
          result.push({
            type: "SET_STATS",
            source: card?.id ?? null,
            to: c.id,
            newAttack: c.attack,
            newDefense: c.defense,
          });
        }
      }
    }

    return result;
  },
  SHIELD: ({ game, target, value = 1, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const t of targets) {
      game.barrier[t] = (game.barrier[t] || 0) + value;

      result.push({
        type: "SHIELD",
        source: card?.id ?? null,
        to: t,
        amount: value,
      });
    }

    return result;
  },
  SILENCE: ({ game, target, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      for (const c of game.boards[uid] || []) {
        if (targets.includes(c.id)) {
          c.abilities = [];
          result.push({
            type: "SILENCE",
            source: card?.id ?? null,
            to: c.id,
          });
        }
      }
    }

    return result;
  },
  STEAL_CARD: ({ game, source, card }) => {
    const opponentId = game.userIds.find((u) => u !== source);
    const result = [];

    if (
      opponentId &&
      game.hands[opponentId]?.length > 0 &&
      game.hands[source]?.length < 10
    ) {
      const stolen = game.hands[opponentId].shift();
      game.hands[source].push(stolen);

      result.push({
        type: "STEAL_CARD",
        source: card?.id ?? null,
        from: opponentId,
        to: source,
        cardId: stolen.id,
      });
    }

    return result;
  },
  STUN: ({ game, target, value = 1, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      for (const c of game.boards[uid] || []) {
        if (targets.includes(c.id)) {
          c.stunnedFor = value;
          result.push({
            type: "STUN",
            source: card?.id ?? null,
            to: c.id,
            duration: value,
          });
        }
      }
    }

    return result;
  },
  SWAP_STATS: ({ game, target, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      const board = game.boards[uid] || [];
      for (const c of board) {
        if (targets.includes(c.id)) {
          const oldAttack = c.attack;
          c.attack = c.defense;
          c.defense = oldAttack;

          result.push({
            type: "SWAP_STATS",
            source: card?.id ?? null,
            to: c.id,
            newAttack: c.attack,
            newDefense: c.defense,
          });
        }
      }
    }

    return result;
  },
  TAUNT: ({ game, target, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      const board = game.boards[uid] || [];
      for (const c of board) {
        if (targets.includes(c.id) && !c.abilities.includes("TAUNT")) {
          c.abilities.push("TAUNT");
          result.push({
            type: "TAUNT",
            source: card?.id ?? null,
            to: c.id,
          });
        }
      }
    }

    return result;
  },
  TRANSFORM_RANDOM: async ({ game, card, source }) => {
    const subtype = card?.effect?.subtype || "HERO";
    const result = [];

    const newCards = await getRandomCards({
      count: 1,
      mode: "summon",
      type: subtype,
    });

    const newCard = {
      ...newCards[0],
      id: `${newCards[0]._id}-${Date.now()}`,
    };

    for (const uid of game.userIds) {
      const board = game.boards[uid] || [];
      const index = board.findIndex((c) => c.id === card.id);
      if (index !== -1) {
        game.boards[uid][index] = newCard;

        result.push({
          type: "TRANSFORM",
          source: card.id,
          from: card.id,
          into: newCard._id,
        });

        break;
      }
    }

    return result;
  },
  TRANSFORM_ENEMY_FROM_SOURCE: ({ game, card, target, source }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      const board = game.boards[uid] || [];

      for (const t of targets) {
        const index = board.findIndex((c) => c.id === t);
        if (index !== -1) {
          const clone = {
            ...card,
            id: `${card.id}-transform-${Date.now()}`,
          };

          // Rimuove eventuali riferimenti indesiderati
          delete clone.effect; // opzionale: non re-includere l'effetto trasformazione

          game.boards[uid][index] = clone;

          result.push({
            type: "TRANSFORM",
            source: card.id,
            from: t,
            into: clone.id,
          });
        }
      }
    }

    return result;
  },
  TRANSFORM: ({ game, card, target, source }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    // Trova dove si trova la carta che ha attivato l'effetto (card)
    const playerBoard = game.boards[source] || [];
    const cardIndex = playerBoard.findIndex((c) => c.id === card.id);
    if (cardIndex === -1) return []; // non trovata

    // Consideriamo solo il primo target (trasformazione singola)
    const targetId = targets[0];

    // Cerca il target su tutte le board
    let targetCard = null;
    for (const uid of game.userIds) {
      targetCard = game.boards[uid]?.find((c) => c.id === targetId);
      if (targetCard) break;
    }

    if (!targetCard) return [];

    // Crea la nuova carta clonata
    const clone = {
      ...targetCard,
      id: `${targetCard.id}-transform-${Date.now()}`,
    };

    // Rimuovi abilità ed effetti temporanei se necessario
    delete clone.effect;

    // Sostituisci la carta originale con la nuova
    playerBoard[cardIndex] = clone;
    // game.boards[uid][index] = clone;
    result.push({
      type: "TRANSFORM",
      source: card.id,
      from: card.id,
      into: clone.id,
    });

    return result;
  },
  // TRANSFORM_ENEMY_FROM_SOURCE: async ({ game, target, card }) => {
  //   const targets = Array.isArray(target) ? target : [target];
  //   const subtype = card?.effect?.subtype || "HERO";
  //   const result = [];

  //   const newCards = await getRandomCards({
  //     count: targets.length,
  //     mode: "summon",
  //     type: subtype,
  //   });

  //   for (const uid of game.userIds) {
  //     const board = game.boards[uid];
  //     for (let i = 0; i < targets.length; i++) {
  //       const t = targets[i];
  //       const index = board.findIndex((c) => c.id === t);
  //       if (index !== -1 && newCards[i]) {
  //         const newCard = {
  //           ...newCards[i],
  //           id: `${newCards[i]._id}-${Date.now()}`,
  //         };
  //         game.boards[uid][index] = newCard;
  //         result.push({
  //           type: "TRANSFORM",
  //           source: card?.id ?? null,
  //           from: t,
  //           into: newCard._id,
  //         });
  //       }
  //     }
  //   }

  //   return result;
  // },

  SUMMON: async ({ game, card, source, value = 1, target }) => {
    const player = target || source;
    const board = game.boards[player] || [];
    const maxSummonable = 6 - board.length;

    if (maxSummonable <= 0) return [];

    const count = Math.min(value, maxSummonable);
    const effect = card.effect || {};
    let summoned = [];

    if (Array.isArray(effect.cardIds) && effect.cardIds.length > 0) {
      const fullCards = await getCardsByIds(effect.cardIds);
      summoned = fullCards.slice(0, count);
    } else if (Array.isArray(effect.pool) && effect.pool.length > 0) {
      let pool = await getCardsByIds(effect.pool);
      if (effect.filter) {
        pool = pool.filter((c) =>
          Object.entries(effect.filter).every(([key, val]) => c[key] === val)
        );
      }
      summoned = pickRandom(pool, count);
    } else {
      let all = await getRandomCards({
        count: 100,
        type: effect.subtype || "HERO",
      });
      if (effect.filter) {
        all = all.filter((c) =>
          Object.entries(effect.filter).every(([key, val]) => c[key] === val)
        );
      }
      summoned = pickRandom(all, count);
    }

    game.boards[player].push(...summoned);

    return summoned.map((c) => ({
      type: "SUMMON",
      source: card?.id ?? null,
      to: player,
      cardId: c.id,
    }));
  },
  REDIRECT_DAMAGE: ({ game, card }) => {
    // Imposta il redirect del danno dal source al nuovo target
    game.damageRedirect = {
      from: card.effect.source,
      to: card.effect.newTarget,
    };

    return [
      {
        type: "REDIRECT_DAMAGE",
        source: card?.id ?? null,
        from: card.effect.source,
        to: card.effect.newTarget,
      },
    ];
  },
  COPY_STATS: ({ game, source, target, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    const allBoards = game.userIds.flatMap((uid) => game.boards[uid] || []);
    const sourceCard = allBoards.find((c) => c.id === source);
    if (!sourceCard) return result;

    for (const uid of game.userIds) {
      const board = game.boards[uid] || [];
      for (const c of board) {
        if (targets.includes(c.id)) {
          c.attack = sourceCard.attack;
          c.defense = sourceCard.defense;
          result.push({
            type: "COPY_STATS",
            source: card?.id ?? null,
            to: c.id,
            copiedFrom: sourceCard.id,
            newAttack: c.attack,
            newDefense: c.defense,
          });
        }
      }
    }

    return result;
  },
  SET_ATTACK: ({ game, target, value, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      const board = game.boards[uid] || [];
      for (const c of board) {
        if (targets.includes(c.id)) {
          c.attack = value;
          result.push({
            type: "SET_ATTACK",
            source: card?.id ?? null,
            to: c.id,
            newAttack: value,
          });
        }
      }
    }

    return result;
  },
  SET_DEFENSE: ({ game, target, value, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      const board = game.boards[uid] || [];
      for (const c of board) {
        if (targets.includes(c.id)) {
          c.defense = value;
          result.push({
            type: "SET_DEFENSE",
            source: card?.id ?? null,
            to: c.id,
            newDefense: value,
          });
        }
      }
    }

    return result;
  },
  SET_CRYSTALS: ({ game, source, value, card }) => {
    game.maxCrystals[source] = value;

    return [
      {
        type: "SET_CRYSTALS",
        source: card?.id ?? null,
        player: source,
        amount: value,
      },
    ];
  },
  KILL_ALL: ({ game, card }) => {
    const result = [];

    for (const userId of game.allPlayers) {
      const board = game.boards[userId] || [];
      while (board.length > 0) {
        const removedCard = board.pop();
        unregisterPassiveEffectsByCard(game.id, removedCard.id);
        emitPassiveTrigger(EffectTriggers.ON_DEATH, game, {
          target: removedCard.id,
          source: card?.id ?? null,
          value: null,
        });

        result.push({
          type: "KILL_ALL",
          source: card?.id ?? null,
          to: removedCard.id,
        });
      }
    }

    return result;
  },
  DISABLE: ({ game, target, duration = 1, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      for (const c of game.boards[uid] || []) {
        if (targets.includes(c.id)) {
          c.disabledFor = duration;
          result.push({
            type: "DISABLE",
            source: card?.id ?? null,
            to: c.id,
            duration,
          });
        }
      }
    }

    return result;
  },
  BURN_MANA: ({ game, source, value = 1, card }) => {
    const current = game.crystals[source] || 0;
    const burned = Math.min(current, value);
    game.crystals[source] = current - burned;

    return [
      {
        type: "BURN_MANA",
        source: card?.id ?? null,
        player: source,
        amount: burned,
      },
    ];
  },
  SLEEP: ({ game, target, duration = 1, card }) => {
    const targets = Array.isArray(target) ? target : [target];
    const result = [];

    for (const uid of game.userIds) {
      for (const c of game.boards[uid] || []) {
        if (targets.includes(c.id)) {
          c.sleepFor = duration;
          result.push({
            type: "SLEEP",
            source: card?.id ?? null,
            to: c.id,
            duration,
          });
        }
      }
    }

    return result;
  },
};

export async function triggerEffects({
  trigger,
  game,
  card,
  source,
  target,
  value,
  skipBoardCheck = false, // 👈 nuovo flag
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
  console.log("resolveTargets", resolvedTargets);
  if (typeof card.effect.handler === "function") {
    await card.effect.handler({
      game,
      card,
      source,
      target: resolvedTargets,
      value,
      skipBoardCheck,
    });
  } else if (effectHandlers[card.effect.type]) {
    const result = await effectHandlers[card.effect.type]({
      game,
      card,
      source,
      target: resolvedTargets, // passa tutta la lista
      value,
      skipBoardCheck,
    });

    // opzionale: log o accumulo
    console.log("risultato effetto", result);
  }
}

export function registerPassiveEffects(gameId, effects) {
  const registry = passiveEffectRegistry.get(gameId);

  for (const { effect, card, owner } of effects) {
    if (!registry[effect.trigger]) {
      registry[effect.trigger] = [];
    }

    registry[effect.trigger].push({
      cardId: card.id, // salva solo l'id
      card,
      owner,
      target: effect.target ?? null,
    });
  }

  console.log("Salvato", registry);
}

export function unregisterPassiveEffectsByCard(
  gameId,
  cardId,
  removeAll = false
) {
  const registry = passiveEffectRegistry.get(gameId);
  if (!registry) return;

  for (const trigger of Object.keys(registry)) {
    registry[trigger] = registry[trigger].filter(({ cardId: entryCardId }) => {
      if (removeAll) {
        return entryCardId !== cardId; // elimina se combacia
      }
      return true; // lascia tutto se removeAll è false
    });

    // Se il trigger è vuoto dopo il filtraggio, lo eliminiamo per pulizia
    if (registry[trigger].length === 0) {
      delete registry[trigger];
    }
  }
}

export function clearPassiveEffects(gameId) {
  const registry = passiveEffectRegistry.get(gameId);
  if (!registry) return;

  // Semplicemente svuota l'intero registro per quel gameId
  passiveEffectRegistry.set(gameId, {});
}
export function DestroyGamePassiveEffect(gameId) {
  passiveEffectRegistry.delete(gameId);
}

export async function emitPassiveTrigger(trigger, game, eventData = {}) {
  // console.log("DEBUG game.id:", game.id);
  // console.log("DEBUG game.gameId:", game.gameId);
  const gameId = game.id; // <-- QUI IL FIX FINALE
  const registry = passiveEffectRegistry.get(gameId) ?? {};
  const triggers = registry[trigger] ?? [];

  // console.log("PASSIVE eventData", eventData);
  // console.log("PASSIVE registry", registry);
  // console.log("PASSIVE triggers", triggers);

  for (const { cardId, card, effect, owner, target } of triggers) {
    const result = await triggerEffects({
      trigger,
      game,
      card: card,
      source: eventData?.source ?? owner,
      target: eventData?.target ?? target ?? null,
      value: eventData?.value ?? null,
    });

    if (result) {
      game.effectResults.push(...result);
    }
  }
}

export function resolveTargets({ target, source, game, count }) {
  if (!target) return [];

  let limit = parseInt(count);
  if (isNaN(limit) || limit <= 0) limit = Infinity;

  if (typeof target === "string") {
    const opponentId = game.userIds.find((id) => id !== source);
    const allyId = source;

    switch (target) {
      case "ALL_PLAYERS":
        console.log("ALL_PLAYERS", game.userIds.slice(0, limit));
        return game.userIds.slice(0, limit);

      case "ALL_CARDS":
        console.log(
          "ALL_CARDS",
          game.userIds
            .flatMap((uid) => game.boards[uid]?.map((c) => c.id) || [])
            .slice(0, limit)
        );
        return game.userIds
          .flatMap((uid) => game.boards[uid]?.map((c) => c.id) || [])
          .slice(0, limit);

      case "SELF":
        console.log("SELF", [source]);
        return [source];

      case "OPPONENT":
        console.log("OPPONENT", [opponentId]);
        return [opponentId];

      case "ALL_ALLIES":
        console.log(
          "ALL_ALLIES",
          game.boards[allyId]?.map((c) => c.id).slice(0, limit) || []
        );
        return game.boards[allyId]?.map((c) => c.id).slice(0, limit) || [];

      case "ALL_ENEMIES":
        console.log(
          "ALL_ENEMIES",
          game.boards[opponentId]?.map((c) => c.id).slice(0, limit) || []
        );
        return game.boards[opponentId]?.map((c) => c.id).slice(0, limit) || [];

      case "ENEMY_CARD":
        console.log(
          "ENEMY_CARD",
          game.boards[opponentId]?.map((c) => c.id).slice(0, limit) || []
        );
        return game.boards[opponentId]?.map((c) => c.id).slice(0, limit) || [];

      case "ALLY":
        console.log(
          "ALLY",
          game.boards[allyId]?.map((c) => c.id).slice(0, limit) || []
        );
        return game.boards[allyId]?.map((c) => c.id).slice(0, limit) || [];

      case "RANDOM_ENEMY": {
        console.log(
          "RANDOM_ENEMY",
          shuffle(enemyBoard)
            .slice(0, limit)
            .map((c) => c.id)
        );
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
        console.log("fallback: ID diretto", [target]);
        return [target];
    }
  }

  if (Array.isArray(target)) {
    console.log("target.slice(0, limit)", target.slice(0, limit));
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
function findOwnerOfEffectCard(game, cardId) {
  return game.userIds.find((uid) =>
    game.boards[uid]?.some((c) => c.id === cardId)
  );
}

function findCardInGame(game, cardId) {
  for (const uid of game.userIds) {
    const card = game.boards[uid]?.find((c) => c.id === cardId);
    if (card) return card;
  }
  return null;
}
