// export const effectHandkers2 = {
//   BURN: ({ game, target, value = 1, duration = 2, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           // Applica l'effetto reale
//           c.burning = { value, duration };

//           // Aggiungi il log
//           result.push({
//             type: "BURN",
//             source: card?.id ?? null,
//             to: c.id,
//             value,
//             duration,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   BUFF_ATTACK: ({ game, target, value, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           // Applica il buff
//           c.attack += value;

//           // Registra il log
//           result.push({
//             type: "BUFF_ATTACK",
//             source: card?.id ?? null,
//             to: c.id,
//             amount: value,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   BUFF_DEFENSE: ({ game, target, value, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           // Applica il buff
//           c.defense += value;

//           // Registra il log
//           result.push({
//             type: "BUFF_DEFENSE",
//             source: card?.id ?? null,
//             to: c.id,
//             amount: value,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   COPY_CARD: ({ game, source, target, card }) => {
//     const opponentId = game.userIds.find((u) => u !== source);
//     const cardToCopy = game.boards[opponentId]?.find((c) => c.id === target);

//     if (cardToCopy && game.hands[source].length < 10) {
//       // Crea copia con nuovo ID
//       const clone = {
//         ...cardToCopy,
//         id: `${cardToCopy.id}-copy-${Date.now()}`,
//       };

//       // Aggiungi alla mano del giocatore
//       game.hands[source].push(clone);

//       // Log
//       return [
//         {
//           type: "COPY_CARD",
//           source: card?.id ?? null,
//           copiedFrom: cardToCopy.id,
//           copyId: clone.id,
//         },
//       ];
//     }

//     return [];
//   },
//   CRYSTALS: ({ game, source, value = 1, card }) => {
//     const mode = card?.effect?.mode || "available";
//     let added = 0;

//     if (mode === "max") {
//       // Aggiunta a maxCrystals
//       game.maxCrystals[source] = Math.min(
//         10,
//         (game.maxCrystals[source] || 0) + value
//       );
//       added = value;
//     } else {
//       // Aggiunta a cristalli disponibili
//       const current = game.crystals[source] || 0;
//       const max = game.maxCrystals[source] || 10;
//       added = Math.min(max - current, value);
//       game.crystals[source] = current + added;
//     }

//     return [
//       {
//         type: "CRYSTALS",
//         source: card?.id ?? null,
//         player: source,
//         amount: added,
//         mode,
//       },
//     ];
//   },
//   DELAY_DRAW: ({ game, target, card }) => {
//     if (!game.skipDrawPhase) {
//       game.skipDrawPhase = {};
//     }

//     // Blocca la pesca per il giocatore specificato
//     game.skipDrawPhase[target] = true;

//     return [
//       {
//         type: "DELAY_DRAW",
//         source: card?.id ?? null,
//         player: target,
//       },
//     ];
//   },
//   DISCARD: ({ game, source, value = 1, card }) => {
//     const opponentId = game.userIds.find((u) => u !== source);
//     const discarded = game.hands[opponentId]?.splice(0, value) || [];
//     const result = [];

//     for (const c of discarded) {
//       result.push({
//         type: "DISCARD",
//         source: card?.id ?? null,
//         player: opponentId,
//         cardId: c.id,
//       });
//     }

//     return result;
//   },
//   DRAW: ({ game, source, value = 1, card }) => {
//     const drawn = game.decks[source]?.splice(0, value) || [];
//     game.hands[source].push(...drawn);

//     return drawn.map((c) => ({
//       type: "DRAW",
//       source: card?.id ?? null,
//       player: source,
//       cardId: c.id,
//     }));
//   },
//   DAMAGE: ({ game, card, source, target, value }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];
//     const damage = value ?? card?.effect?.value ?? 0;
//     const hasAntiBarrier = hasAbility?.(card, "ANTI_SHIELD");

//     const apply = (t) => {
//       let dealt = 0;

//       if (!hasAntiBarrier && game.barrier?.[t] > 0) {
//         const absorb = Math.min(game.barrier[t], damage);
//         game.barrier[t] -= absorb;
//         const remaining = damage - absorb;
//         if (remaining > 0) {
//           game.health[t] = Math.max(0, game.health[t] - remaining);
//           dealt = remaining;
//         }
//       } else {
//         game.health[t] = Math.max(0, game.health[t] - damage);
//         dealt = damage;
//       }

//       result.push({
//         type: "DAMAGE",
//         source: card?.id ?? null,
//         to: t,
//         amount: dealt,
//       });
//     };

//     targets.forEach(apply);
//     return result;
//   },
//   FREEZE: ({ game, target, value = 1, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           c.frozenFor = value;
//           result.push({
//             type: "FREEZE",
//             source: card?.id ?? null,
//             to: c.id,
//             duration: value,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   HEAL: ({ game, card, source, target, value }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const t of targets) {
//       const before = game.health[t] || 0;
//       const healValue = value ?? card?.effect?.value ?? 0;
//       game.health[t] = Math.min(20, before + healValue);

//       result.push({
//         type: "HEAL",
//         source: card?.id ?? null,
//         to: t,
//         amount: game.health[t] - before,
//       });
//     }

//     return result;
//   },
//   KILL: ({ game, card, source, target }) => {
//     const targets =
//       target === "ALL" ? [] : Array.isArray(target) ? target : [target];
//     const result = [];

//     const killCard = (id) => {
//       for (const userId of game.allPlayers) {
//         const board = game.boards[userId];
//         const index = board.findIndex((c) => c.id === id);
//         if (index !== -1) {
//           const [removed] = board.splice(index, 1);
//           unregisterPassiveEffectsByCard(game.id, id);
//           emitPassiveTrigger(EffectTriggers.ON_DEATH, game, {
//             target: id,
//             source,
//             value: null,
//           });

//           result.push({
//             type: "KILL",
//             source: card?.id ?? null,
//             to: id,
//           });
//           break;
//         }
//       }
//     };

//     if (target === "ALL") {
//       for (const userId of game.allPlayers) {
//         for (const c of [...game.boards[userId]]) {
//           killCard(c.id);
//         }
//       }
//     } else {
//       targets.forEach(killCard);
//     }

//     return result;
//   },
//   MILL: ({ game, source, value = 1, card }) => {
//     const opponentId = game.userIds.find((u) => u !== source);
//     const removed = game.decks[opponentId]?.splice(0, value) || [];

//     return removed.map((c) => ({
//       type: "MILL",
//       source: card?.id ?? null,
//       from: opponentId,
//       cardId: c.id,
//     }));
//   },
//   NO_HEAL: ({ game, target, duration = 1, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           c.noHealFor = duration;
//           result.push({
//             type: "NO_HEAL",
//             source: card?.id ?? null,
//             to: c.id,
//             duration,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   POLYMORPH: ({ game, target, card }) => {
//     const intoId = card?.effect?.intoCardId;
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       const board = game.boards[uid];
//       for (const t of targets) {
//         const index = board.findIndex((c) => c.id === t);
//         if (index !== -1 && intoId) {
//           board[index] = {
//             id: `${intoId}-${Date.now()}`,
//             _id: intoId,
//             name: "Pecora",
//             attack: 1,
//             defense: 1,
//             cost: 1,
//             abilities: [],
//           };
//           result.push({
//             type: "POLYMORPH",
//             source: card?.id ?? null,
//             to: t,
//             into: intoId,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   RETURN_HAND: ({ game, target, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       const board = game.boards[uid];
//       for (const t of targets) {
//         const index = board.findIndex((c) => c.id === t);
//         if (index !== -1 && game.hands[uid].length < 10) {
//           const [removed] = board.splice(index, 1);
//           game.hands[uid].push(removed);

//           result.push({
//             type: "RETURN_HAND",
//             source: card?.id ?? null,
//             player: uid,
//             cardId: removed.id,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   REMOVE_EFFECTS: ({ game, target, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const t of targets) {
//       unregisterPassiveEffectsByCard(game.id, t);
//       result.push({
//         type: "REMOVE_EFFECTS",
//         source: card?.id ?? null,
//         cardId: t,
//       });
//     }

//     return result;
//   },
//   SACRIFICE: ({ game, source, target, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const t of targets) {
//       const board = game.boards[source];
//       const index = board.findIndex((c) => c.id === t);
//       if (index !== -1) {
//         board.splice(index, 1);
//         unregisterPassiveEffectsByCard(game.id, t);
//         result.push({
//           type: "SACRIFICE",
//           source: card?.id ?? null,
//           player: source,
//           cardId: t,
//         });
//       }
//     }

//     return result;
//   },
//   SET_STATS: ({ game, target, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const { attack, defense } = card?.effect?.value || {};
//     const result = [];

//     for (const uid of game.userIds) {
//       const board = game.boards[uid] || [];
//       for (const c of board) {
//         if (targets.includes(c.id)) {
//           if (typeof attack === "number") c.attack = attack;
//           if (typeof defense === "number") c.defense = defense;
//           result.push({
//             type: "SET_STATS",
//             source: card?.id ?? null,
//             to: c.id,
//             newAttack: c.attack,
//             newDefense: c.defense,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   SHIELD: ({ game, target, value = 1, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const t of targets) {
//       game.barrier[t] = (game.barrier[t] || 0) + value;

//       result.push({
//         type: "SHIELD",
//         source: card?.id ?? null,
//         to: t,
//         amount: value,
//       });
//     }

//     return result;
//   },
//   SILENCE: ({ game, target, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           c.abilities = [];
//           result.push({
//             type: "SILENCE",
//             source: card?.id ?? null,
//             to: c.id,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   STEAL_CARD: ({ game, source, card }) => {
//     const opponentId = game.userIds.find((u) => u !== source);
//     const result = [];

//     if (
//       opponentId &&
//       game.hands[opponentId]?.length > 0 &&
//       game.hands[source]?.length < 10
//     ) {
//       const stolen = game.hands[opponentId].shift();
//       game.hands[source].push(stolen);

//       result.push({
//         type: "STEAL_CARD",
//         source: card?.id ?? null,
//         from: opponentId,
//         to: source,
//         cardId: stolen.id,
//       });
//     }

//     return result;
//   },
//   STUN: ({ game, target, value = 1, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           c.stunnedFor = value;
//           result.push({
//             type: "STUN",
//             source: card?.id ?? null,
//             to: c.id,
//             duration: value,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   SWAP_STATS: ({ game, target, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       const board = game.boards[uid] || [];
//       for (const c of board) {
//         if (targets.includes(c.id)) {
//           const oldAttack = c.attack;
//           c.attack = c.defense;
//           c.defense = oldAttack;

//           result.push({
//             type: "SWAP_STATS",
//             source: card?.id ?? null,
//             to: c.id,
//             newAttack: c.attack,
//             newDefense: c.defense,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   TAUNT: ({ game, target, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       const board = game.boards[uid] || [];
//       for (const c of board) {
//         if (targets.includes(c.id) && !c.abilities.includes("TAUNT")) {
//           c.abilities.push("TAUNT");
//           result.push({
//             type: "TAUNT",
//             source: card?.id ?? null,
//             to: c.id,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   TRANSFORM: async ({ game, target, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const subtype = card?.effect?.subtype || "HERO";
//     const result = [];

//     const newCards = await getRandomCards({
//       count: targets.length,
//       mode: "summon",
//       type: subtype,
//     });

//     for (const uid of game.userIds) {
//       const board = game.boards[uid];
//       for (let i = 0; i < targets.length; i++) {
//         const t = targets[i];
//         const index = board.findIndex((c) => c.id === t);
//         if (index !== -1 && newCards[i]) {
//           const newCard = {
//             ...newCards[i],
//             id: `${newCards[i]._id}-${Date.now()}`,
//           };
//           board[index] = newCard;
//           result.push({
//             type: "TRANSFORM",
//             source: card?.id ?? null,
//             from: t,
//             into: newCard._id,
//           });
//         }
//       }
//     }

//     return result;
//   },

//   SUMMON: async ({ game, card, source, value = 1, target }) => {
//     const player = target || source;
//     const board = game.boards[player] || [];
//     const maxSummonable = 6 - board.length;

//     if (maxSummonable <= 0) return [];

//     const count = Math.min(value, maxSummonable);
//     const effect = card.effect || {};
//     let summoned = [];

//     if (Array.isArray(effect.cardIds) && effect.cardIds.length > 0) {
//       const fullCards = await getCardsByIds(effect.cardIds);
//       summoned = fullCards.slice(0, count);
//     } else if (Array.isArray(effect.pool) && effect.pool.length > 0) {
//       let pool = await getCardsByIds(effect.pool);
//       if (effect.filter) {
//         pool = pool.filter((c) =>
//           Object.entries(effect.filter).every(([key, val]) => c[key] === val)
//         );
//       }
//       summoned = pickRandom(pool, count);
//     } else {
//       let all = await getRandomCards({
//         count: 100,
//         type: effect.subtype || "HERO",
//       });
//       if (effect.filter) {
//         all = all.filter((c) =>
//           Object.entries(effect.filter).every(([key, val]) => c[key] === val)
//         );
//       }
//       summoned = pickRandom(all, count);
//     }

//     game.boards[player].push(...summoned);

//     return summoned.map((c) => ({
//       type: "SUMMON",
//       source: card?.id ?? null,
//       to: player,
//       cardId: c.id,
//     }));
//   },
//   REDIRECT_DAMAGE: ({ game, card }) => {
//     // Imposta il redirect del danno dal source al nuovo target
//     game.damageRedirect = {
//       from: card.effect.source,
//       to: card.effect.newTarget,
//     };

//     return [
//       {
//         type: "REDIRECT_DAMAGE",
//         source: card?.id ?? null,
//         from: card.effect.source,
//         to: card.effect.newTarget,
//       },
//     ];
//   },
//   COPY_STATS: ({ game, source, target, card }) => {
//     const result = [];

//     for (const uid of game.userIds) {
//       const board = game.boards[uid] || [];
//       for (const c of board) {
//         if (c.id === target) {
//           // Trova la carta da cui copiare gli stats
//           const sourceCard = board.find((x) => x.id === source);
//           if (sourceCard) {
//             c.attack = sourceCard.attack;
//             c.defense = sourceCard.defense;
//             result.push({
//               type: "COPY_STATS",
//               source: card?.id ?? null,
//               to: c.id,
//               copiedFrom: sourceCard.id,
//             });
//           }
//           break;
//         }
//       }
//     }

//     return result;
//   },
//   SET_ATTACK: ({ game, target, value, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       const board = game.boards[uid] || [];
//       for (const c of board) {
//         if (targets.includes(c.id)) {
//           c.attack = value;
//           result.push({
//             type: "SET_ATTACK",
//             source: card?.id ?? null,
//             to: c.id,
//             newAttack: value,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   SET_DEFENSE: ({ game, target, value, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       const board = game.boards[uid] || [];
//       for (const c of board) {
//         if (targets.includes(c.id)) {
//           c.defense = value;
//           result.push({
//             type: "SET_DEFENSE",
//             source: card?.id ?? null,
//             to: c.id,
//             newDefense: value,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   SET_CRYSTALS: ({ game, source, value, card }) => {
//     game.maxCrystals[source] = value;

//     return [
//       {
//         type: "SET_CRYSTALS",
//         source: card?.id ?? null,
//         player: source,
//         amount: value,
//       },
//     ];
//   },
//   KILL_ALL: ({ game, card }) => {
//     const result = [];

//     for (const userId of game.allPlayers) {
//       const board = game.boards[userId] || [];
//       while (board.length > 0) {
//         const removedCard = board.pop();
//         unregisterPassiveEffectsByCard(game.id, removedCard.id);
//         emitPassiveTrigger(EffectTriggers.ON_DEATH, game, {
//           target: removedCard.id,
//           source: card?.id ?? null,
//           value: null,
//         });

//         result.push({
//           type: "KILL_ALL",
//           source: card?.id ?? null,
//           to: removedCard.id,
//         });
//       }
//     }

//     return result;
//   },
//   DISABLE: ({ game, target, duration = 1, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           c.disabledFor = duration;
//           result.push({
//             type: "DISABLE",
//             source: card?.id ?? null,
//             to: c.id,
//             duration,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   BURN_MANA: ({ game, source, value = 1, card }) => {
//     const current = game.crystals[source] || 0;
//     const burned = Math.min(current, value);
//     game.crystals[source] = current - burned;

//     return [
//       {
//         type: "BURN_MANA",
//         source: card?.id ?? null,
//         player: source,
//         amount: burned,
//       },
//     ];
//   },
//   SLEEP: ({ game, target, duration = 1, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           c.sleepFor = duration;
//           result.push({
//             type: "SLEEP",
//             source: card?.id ?? null,
//             to: c.id,
//             duration,
//           });
//         }
//       }
//     }

//     return result;
//   },
// };

// vecchio
// const effectHandlers = {
//   KILL: ({ game, card, source, target }) => {
//     const result = [];

//     const applyKill = (t) => {
//       for (const userId of game.allPlayers) {
//         const board = game.boards[userId];
//         if (!board) continue;
//         const removed = board.find((c) => c.id === t);
//         game.boards[userId] = board.filter((c) => c.id !== t);
//         if (removed) {
//           unregisterPassiveEffectsByCard(game.id, t);
//           emitPassiveTrigger(EffectTriggers.ON_DEATH, game, {
//             target: t,
//             source,
//             value: null,
//           });
//           result.push({ type: "KILL", to: t, by: card?.id });
//           break;
//         }
//       }
//     };

//     if (target === "ALL") {
//       for (const userId of game.allPlayers) {
//         for (const c of [...game.boards[userId]]) {
//           applyKill(c.id);
//         }
//       }
//     } else if (Array.isArray(target)) {
//       target.forEach(applyKill);
//     } else if (target) {
//       applyKill(target);
//     }

//     return result;
//   },

//   DAMAGE: ({ game, card, source, target, value }) => {
//     const result = [];
//     const apply = (t) => {
//       const damage = value ?? card.effect.value;
//       const hasAntiBarrier = hasAbility?.(card, "ANTI_SHIELD");

//       let dealt = 0;

//       if (!hasAntiBarrier && game.barrier?.[t] > 0) {
//         const absorb = Math.min(game.barrier[t], damage);
//         game.barrier[t] -= absorb;
//         const remaining = damage - absorb;
//         if (remaining > 0) {
//           game.health[t] = Math.max(0, game.health[t] - remaining);
//           dealt = remaining;
//         }
//       } else {
//         game.health[t] = Math.max(0, game.health[t] - damage);
//         dealt = damage;
//       }

//       result.push({ type: "DAMAGE", source: card.id, to: t, amount: dealt });
//     };

//     if (target === "ALL") {
//       Object.keys(game.health).forEach(apply);
//     } else if (Array.isArray(target)) {
//       target.forEach(apply);
//     } else if (target) {
//       apply(target);
//     }

//     return result;
//   },
//   HEAL: ({ game, card, source, target, value }) => {
//     const result = [];
//     const apply = (t) => {
//       const before = game.health[t] || 0;
//       const healed = value ?? card.effect.value;
//       game.health[t] = Math.min(20, before + healed);
//       result.push({
//         type: "HEAL",
//         source: card.id,
//         to: t,
//         amount: game.health[t] - before,
//       });
//     };

//     if (target === "ALL") {
//       Object.keys(game.health).forEach(apply);
//     } else if (Array.isArray(target)) {
//       target.forEach(apply);
//     } else if (target) {
//       apply(target);
//     }

//     return result;
//   },
//   DRAW: ({ game, source, value }) => {
//     const drawn = game.decks[source].splice(0, value ?? 1);
//     game.hands[source].push(...drawn);
//     return drawn.map((c) => ({ type: "DRAW", source, cardId: c.id }));
//   },
//   SUMMON: async ({ game, card, source, value, target }) => {
//     const player = target || source;
//     const board = game.boards[player] || [];
//     const maxSummonable = 6 - board.length;
//     if (maxSummonable <= 0) return [];

//     const count = Math.min(value ?? 1, maxSummonable);
//     const effect = card.effect || {};
//     let summoned = [];

//     if (Array.isArray(effect.cardIds) && effect.cardIds.length > 0) {
//       const fullCards = await getCardsByIds(effect.cardIds);
//       summoned = fullCards.slice(0, count);
//     } else if (Array.isArray(effect.pool) && effect.pool.length > 0) {
//       let pool = await getCardsByIds(effect.pool);
//       if (effect.filter) {
//         pool = pool.filter((c) => matchesFilter(c, effect.filter));
//       }
//       summoned = pickRandom(pool, count);
//     } else {
//       let all = await getRandomCards({
//         count: 100,
//         type: effect.subtype || "HERO",
//       });
//       if (effect.filter) {
//         all = all.filter((c) =>
//           Object.entries(effect.filter).every(([key, val]) => c[key] === val)
//         );
//       }
//       summoned = pickRandom(all, count);
//     }

//     game.boards[player].push(...summoned);
//     return summoned.map((c) => ({
//       type: "SUMMON",
//       source: card.id,
//       to: player,
//       cardId: c.id,
//     }));
//   },
//   SHIELD: ({ game, target, value = 1, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];
//     for (const t of targets) {
//       game.barrier[t] = (game.barrier[t] || 0) + value;
//       result.push({
//         type: "SHIELD",
//         source: card?.id ?? null,
//         to: t,
//         amount: value,
//       });
//     }
//     return result;
//   },
//   CRYSTALS: ({ game, source, value = 1, card }) => {
//     const mode = card.effect.mode || "available";
//     let added = 0;
//     if (mode === "max") {
//       game.maxCrystals[source] = Math.min(
//         10,
//         (game.maxCrystals[source] || 0) + value
//       );
//       added = value;
//     } else {
//       const current = game.crystals[source] || 0;
//       const max = game.maxCrystals[source] || 10;
//       added = Math.min(max - current, value);
//       game.crystals[source] = current + added;
//     }

//     return [
//       {
//         type: "CRYSTALS",
//         source: card.id,
//         player: source,
//         amount: added,
//         mode,
//       },
//     ];
//   },

//   BUFF_ATTACK: ({ game, target, value, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];
//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           c.attack += value;
//           result.push({
//             type: "BUFF_ATTACK",
//             source: card.id,
//             to: c.id,
//             amount: value,
//           });
//         }
//       }
//     }
//     return result;
//   },

//   BUFF_DEFENSE: ({ game, target, value, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];
//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           c.defense += value;
//           result.push({
//             type: "BUFF_DEFENSE",
//             source: card.id,
//             to: c.id,
//             amount: value,
//           });
//         }
//       }
//     }
//     return result;
//   },
//   SILENCE: ({ game, target, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];
//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           c.abilities = [];
//           result.push({ type: "SILENCE", source: card.id, to: c.id });
//         }
//       }
//     }
//     return result;
//   },

//   COPY_CARD: ({ game, source, target }) => {
//     const opponentId = game.userIds.find((u) => u !== source);
//     const cardToCopy = game.boards[opponentId]?.find((c) => c.id === target);
//     if (cardToCopy && game.hands[source].length < 10) {
//       const clone = {
//         ...cardToCopy,
//         id: `${cardToCopy.id}-copy-${Date.now()}`,
//       };
//       game.hands[source].push(clone);
//       return [
//         {
//           type: "COPY_CARD",
//           source,
//           copiedFrom: cardToCopy.id,
//           copyId: clone.id,
//         },
//       ];
//     }
//     return [];
//   },
//   STEAL_CARD: ({ game, source, card }) => {
//     const opponentId = game.userIds.find((u) => u !== source);
//     const stolen = game.hands[opponentId]?.shift();
//     if (stolen && game.hands[source].length < 10) {
//       game.hands[source].push(stolen);
//       return [
//         {
//           type: "STEAL_CARD",
//           source: card.id,
//           from: opponentId,
//           to: source,
//           cardId: stolen.id,
//         },
//       ];
//     }
//     return [];
//   },

//   MILL: ({ game, source, value = 1 }) => {
//     const opponentId = game.userIds.find((u) => u !== source);
//     const removed = game.decks[opponentId]?.splice(0, value) || [];
//     return removed.map((c) => ({
//       type: "MILL",
//       from: opponentId,
//       cardId: c.id,
//     }));
//   },

//   REMOVE_EFFECTS: ({ game, target }) => {
//     const gameId = game.id;
//     unregisterPassiveEffectsByCard(gameId, target);
//     return [{ type: "REMOVE_EFFECTS", cardId: target }];
//   },
//   TAUNT: ({ game, target }) => {
//     const result = [];
//     for (const uid of game.userIds) {
//       const card = game.boards[uid]?.find((c) => c.id === target);
//       if (card && !card.abilities.includes("TAUNT")) {
//         card.abilities.push("TAUNT");
//         result.push({ type: "TAUNT", to: card.id });
//       }
//     }
//     return result;
//   },

//   DISCARD: ({ game, source, value = 1 }) => {
//     const opponentId = game.userIds.find((u) => u !== source);
//     const discarded = game.hands[opponentId]?.splice(0, value) || [];
//     return discarded.map((c) => ({
//       type: "DISCARD",
//       player: opponentId,
//       cardId: c.id,
//     }));
//   },
//   FREEZE: ({ game, target, value = 1, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];
//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           c.frozenFor = value;
//           result.push({
//             type: "FREEZE",
//             source: card.id,
//             to: c.id,
//             duration: value,
//           });
//         }
//       }
//     }
//     return result;
//   },
//   STUN: ({ game, target, value = 1 }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];

//     for (const uid of game.userIds) {
//       for (const card of game.boards[uid] || []) {
//         if (targets.includes(card.id)) {
//           card.stunnedFor = value;
//           result.push({ type: "STUN", to: card.id, duration: value });
//         }
//       }
//     }
//     return result;
//   },
//   POLYMORPH: ({ game, target, card }) => {
//     const intoId = card.effect.intoCardId;
//     const result = [];

//     for (const uid of game.userIds) {
//       const board = game.boards[uid];
//       const index = board.findIndex((c) => c.id === target);
//       if (index !== -1 && intoId) {
//         board[index] = {
//           id: `${intoId}-${Date.now()}`,
//           _id: intoId,
//           name: "Pecora",
//           attack: 1,
//           defense: 1,
//           cost: 1,
//           abilities: [],
//         };
//         result.push({ type: "POLYMORPH", to: target, into: intoId });
//       }
//     }
//     return result;
//   },
//   TRANSFORM: async ({ game, target, card }) => {
//     const subtype = card.effect.subtype || "HERO";
//     const newCard = (
//       await getRandomCards({ count: 1, mode: "summon", type: subtype })
//     )[0];
//     const result = [];

//     for (const uid of game.userIds) {
//       const board = game.boards[uid];
//       const index = board.findIndex((c) => c.id === target);
//       if (index !== -1 && newCard) {
//         board[index] = { ...newCard, id: `${newCard._id}-${Date.now()}` };
//         result.push({ type: "TRANSFORM", from: target, into: newCard._id });
//       }
//     }
//     return result;
//   },
//   RETURN_HAND: ({ game, target }) => {
//     const result = [];

//     for (const uid of game.userIds) {
//       const board = game.boards[uid];
//       const index = board.findIndex((c) => c.id === target);
//       if (index !== -1 && game.hands[uid].length < 10) {
//         const [card] = board.splice(index, 1);
//         game.hands[uid].push(card);
//         result.push({ type: "RETURN_HAND", player: uid, cardId: card.id });
//       }
//     }
//     return result;
//   },
//   BURN: ({ game, target, value = 1, duration = 2, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const result = [];
//     for (const uid of game.userIds) {
//       for (const c of game.boards[uid] || []) {
//         if (targets.includes(c.id)) {
//           c.burning = { value, duration };
//           result.push({
//             type: "BURN",
//             source: card.id,
//             to: c.id,
//             value,
//             duration,
//           });
//         }
//       }
//     }
//     return result;
//   },
//   SET_STATS: ({ game, target, card }) => {
//     const targets = Array.isArray(target) ? target : [target];
//     const { attack, defense } = card.effect?.value || {};
//     const result = [];

//     for (const uid of game.userIds) {
//       const board = game.boards[uid];
//       for (const c of board || []) {
//         if (targets.includes(c.id)) {
//           if (typeof attack === "number") c.attack = attack;
//           if (typeof defense === "number") c.defense = defense;
//           result.push({
//             type: "SET_STATS",
//             source: card.id,
//             to: c.id,
//             newAttack: c.attack,
//             newDefense: c.defense,
//           });
//         }
//       }
//     }

//     return result;
//   },
//   NO_HEAL: ({ game, target, duration = 1 }) => {
//     const result = [];
//     for (const uid of game.userIds) {
//       const card = game.boards[uid]?.find((c) => c.id === target);
//       if (card) {
//         card.noHealFor = duration;
//         result.push({ type: "NO_HEAL", to: card.id, duration });
//       }
//     }
//     return result;
//   },

//   SACRIFICE: ({ game, source, target }) => {
//     const board = game.boards[source];
//     const before = board.length;
//     game.boards[source] = board.filter((c) => c.id !== target);
//     const removed = before !== game.boards[source].length;

//     unregisterPassiveEffectsByCard(game.id, target);
//     return removed ? [{ type: "SACRIFICE", source, cardId: target }] : [];
//   },

//   SWAP_STATS: ({ game, target }) => {
//     const result = [];

//     for (const uid of game.userIds) {
//       const card = game.boards[uid]?.find((c) => c.id === target);
//       if (card) {
//         const tmp = card.attack;
//         card.attack = card.defense;
//         card.defense = tmp;
//         result.push({
//           type: "SWAP_STATS",
//           to: card.id,
//           newAttack: card.attack,
//           newDefense: card.defense,
//         });
//       }
//     }

//     return result;
//   },

//   DELAY_DRAW: ({ game, target }) => {
//     game.skipDrawPhase = game.skipDrawPhase || {};
//     game.skipDrawPhase[target] = true;
//     return [{ type: "DELAY_DRAW", player: target }];
//   },
//   // REDIRECT_DAMAGE: ({ game, card }) => {
//   //   game.damageRedirect = {
//   //     from: card.effect.source,
//   //     to: card.effect.newTarget,
//   //   };
//   //   return [
//   //     {
//   //       type: "REDIRECT_DAMAGE",
//   //       from: card.effect.source,
//   //       to: card.effect.newTarget,
//   //     },
//   //   ];
//   // };
// };
