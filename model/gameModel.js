// GameModel.js

export function createEmptyGame() {
  return {
    id: "",
    name: "",
    status: "waiting", // "waiting", "started", "ended"
    teams: [], // [{ name, players: [userId1, userId2] }]
    currentTurnIndex: 0,
    currentPlayerId: null, // userId

    allPlayers: [], // [userId1, userId2]
    usernames: {}, // { [userId]: displayName }
    frames: {}, // { [userId]: framePath }
    crystals: {}, // { [userId]: number }
    maxCrystals: {}, // { [userId]: number }
    health: {}, // { [userId]: number }
    barrier: {}, // { [userId]: number }

    decks: {}, // { [userId]: [cards] }
    hands: {}, // { [userId]: [cards] }
    boards: {}, // { [userId]: [cardsOnBoard] }

    _visualEvents: {}, // { [userId]: events }
  };
}
