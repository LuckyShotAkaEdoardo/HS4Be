// import { Server } from "socket.io";

// let availableGames = [];
// let games = {};
// let queue1v1 = [];
// let queue2v2 = [];
// export const initializeSocket = (server) => {
//   const io = new Server(server, {
//     cors: {
//       origin: "*",
//       methods: ["GET", "POST"],
//     },
//   });

//   io.on("connection", (socket) => {
//     console.log(`Giocatore connesso: ${socket.id}`);
//     socket.on("matchmaking-1v1", () => {
//       queue1v1.push(socket.id);

//       if (queue1v1.length >= 2) {
//         const players = queue1v1.splice(0, 2);
//         const gameId = Math.random().toString(36).substring(2, 9);

//         const game = {
//           id: gameId,
//           teams: [
//             { name: "Giocatore 1", players: [players[0]] },
//             { name: "Giocatore 2", players: [players[1]] },
//           ],
//           status: "started",
//           currentTurnIndex: 0,
//           allPlayers: [...players],
//         };

//         games[gameId] = game;

//         players.forEach((id) => socket.to(id).socketsJoin(gameId));

//         players.forEach((id) => {
//           io.to(id).emit("game-started", {
//             gameId,
//             team: game.teams.find((t) => t.players.includes(id)).name,
//           });
//         });

//         io.to(gameId).emit("turn-update", {
//           currentPlayerId: players[0],
//         });
//       }
//     });

//     socket.on("create-game", (gameName) => {
//       const gameId = Math.random().toString(36).substring(2, 9);
//       const game = {
//         id: gameId,
//         name: gameName,
//         teams: [
//           { name: "Squadra 1", players: [socket.id] },
//           { name: "Squadra 2", players: [] },
//         ],
//         status: "waiting",
//         currentTurnIndex: 0,
//         allPlayers: [socket.id], // lista ordinata dei player per turno
//       };

//       availableGames.push(game);
//       socket.join(gameId);
//       io.emit("available-games", availableGames);
//     });

//     socket.on("join-game", (gameId) => {
//       const game = availableGames.find((g) => g.id === gameId);
//       if (!game || game.status !== "waiting") return;

//       const totalPlayers =
//         game.teams[0].players.length + game.teams[1].players.length;

//       if (totalPlayers < 4) {
//         const targetTeam =
//           game.teams[0].players.length < 2 ? game.teams[0] : game.teams[1];
//         targetTeam.players.push(socket.id);
//         game.allPlayers.push(socket.id);
//         socket.join(gameId);
//       }

//       // Quando sono 4 → avvia la partita
//       if (game.allPlayers.length === 4) {
//         game.status = "started";
//         games[game.id] = game;
//         availableGames = availableGames.filter((g) => g.id !== gameId);

//         // Notifica tutti
//         game.allPlayers.forEach((playerId) => {
//           io.to(playerId).emit("game-started", {
//             gameId: game.id,
//             team: game.teams.find((t) => t.players.includes(playerId)).name,
//           });
//         });

//         const firstPlayer = game.allPlayers[0];
//         io.to(game.id).emit("turn-update", {
//           currentPlayerId: firstPlayer,
//         });
//       }

//       io.emit("available-games", availableGames);
//     });

//     socket.on("end-turn", (gameId) => {
//       const game = games[gameId];
//       if (!game) return;

//       game.currentTurnIndex = (game.currentTurnIndex + 1) % 4;
//       const nextPlayerId = game.allPlayers[game.currentTurnIndex];
//       io.to(gameId).emit("turn-update", {
//         currentPlayerId: nextPlayerId,
//       });
//     });

//     socket.on("disconnect", () => {
//       console.log("Disconnessione:", socket.id);

//       // Rimuovi il giocatore da tutte le partite in attesa
//       availableGames = availableGames.filter((game) => {
//         game.teams[0].players = game.teams[0].players.filter(
//           (id) => id !== socket.id
//         );
//         game.teams[1].players = game.teams[1].players.filter(
//           (id) => id !== socket.id
//         );
//         game.allPlayers = game.allPlayers.filter((id) => id !== socket.id);
//         return (
//           game.teams[0].players.length > 0 || game.teams[1].players.length > 0
//         );
//       });

//       // Rimuovi da partite avviate (opzionale: terminare la partita)
//       Object.keys(games).forEach((gameId) => {
//         const game = games[gameId];
//         game.allPlayers = game.allPlayers.filter((id) => id !== socket.id);
//         game.teams[0].players = game.teams[0].players.filter(
//           (id) => id !== socket.id
//         );
//         game.teams[1].players = game.teams[1].players.filter(
//           (id) => id !== socket.id
//         );

//         if (game.allPlayers.length === 0) delete games[gameId];
//       });

//       io.emit("available-games", availableGames);
//     });
//   });

//   socket.on("matchmaking-vs-npc", () => {
//     const gameId = Math.random().toString(36).substring(2, 9);

//     const game = {
//       id: gameId,
//       teams: [
//         { name: "Player", players: [socket.id] },
//         { name: "NPC", players: ["npc-bot"] },
//       ],
//       status: "started",
//       currentTurnIndex: 0,
//       allPlayers: [socket.id, "npc-bot"],
//     };

//     games[gameId] = game;
//     socket.join(gameId);

//     io.to(socket.id).emit("game-started", {
//       gameId,
//       team: "Player",
//     });

//     io.to(gameId).emit("turn-update", {
//       currentPlayerId: socket.id,
//     });

//     // (opzionale) NPC può rispondere con azioni automatiche
//   });
// };

// export const getAvailableGames = () => availableGames;
import { Server } from "socket.io";

let availableGames = [];
let games = {};
let queue1v1 = [];
let queue2v2 = [];

export const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`Giocatore connesso: ${socket.id}`);

    // === 1v1 MATCHMAKING ===
    socket.on("matchmaking-1v1", () => {
      queue1v1.push(socket.id);

      if (queue1v1.length >= 2) {
        const players = queue1v1.splice(0, 2);
        const gameId = Math.random().toString(36).substring(2, 9);

        const game = {
          id: gameId,
          teams: [
            { name: "Giocatore 1", players: [players[0]] },
            { name: "Giocatore 2", players: [players[1]] },
          ],
          status: "started",
          currentTurnIndex: 0,
          allPlayers: [...players],
        };

        games[gameId] = game;
        players.forEach((id) => io.sockets.sockets.get(id)?.join(gameId));

        players.forEach((id) => {
          io.to(id).emit("game-started", {
            gameId,
            team: game.teams.find((t) => t.players.includes(id)).name,
          });
        });

        io.to(gameId).emit("turn-update", {
          currentPlayerId: players[0],
        });
      }
    });

    // === 2v2 MATCHMAKING ===
    socket.on("matchmaking-2v2", () => {
      queue2v2.push(socket.id);

      if (queue2v2.length >= 4) {
        const players = queue2v2.splice(0, 4);
        const gameId = Math.random().toString(36).substring(2, 9);

        const game = {
          id: gameId,
          teams: [
            { name: "Squadra 1", players: [players[0], players[1]] },
            { name: "Squadra 2", players: [players[2], players[3]] },
          ],
          status: "started",
          currentTurnIndex: 0,
          allPlayers: [...players],
        };

        games[gameId] = game;
        players.forEach((id) => io.sockets.sockets.get(id)?.join(gameId));

        players.forEach((id) => {
          io.to(id).emit("game-started", {
            gameId,
            team: game.teams.find((t) => t.players.includes(id)).name,
          });
        });

        io.to(gameId).emit("turn-update", {
          currentPlayerId: players[0],
        });
      }
    });

    // === 1 vs NPC ===
    socket.on("matchmaking-vs-npc", () => {
      const gameId = Math.random().toString(36).substring(2, 9);

      const game = {
        id: gameId,
        teams: [
          { name: "Player", players: [socket.id] },
          { name: "NPC", players: ["npc-bot"] },
        ],
        status: "started",
        currentTurnIndex: 0,
        allPlayers: [socket.id, "npc-bot"],
        isVsNpc: true,
      };

      games[gameId] = game;
      socket.join(gameId);

      io.to(socket.id).emit("game-started", {
        gameId,
        team: "Player",
      });

      io.to(gameId).emit("turn-update", {
        currentPlayerId: socket.id,
      });
    });

    // === END TURN ===
    socket.on("end-turn", (gameId) => {
      const game = games[gameId];
      if (!game) return;

      game.currentTurnIndex =
        (game.currentTurnIndex + 1) % game.allPlayers.length;
      const nextPlayerId = game.allPlayers[game.currentTurnIndex];

      io.to(gameId).emit("turn-update", {
        currentPlayerId: nextPlayerId,
      });

      // Turno dell’NPC automatico
      if (nextPlayerId === "npc-bot") {
        setTimeout(() => {
          io.to(gameId).emit("npc-action", { gameId, action: "gioca carta" });

          game.currentTurnIndex =
            (game.currentTurnIndex + 1) % game.allPlayers.length;
          const newTurn = game.allPlayers[game.currentTurnIndex];

          io.to(gameId).emit("turn-update", {
            currentPlayerId: newTurn,
          });
        }, 1000); // NPC attende 1 secondo prima di agire
      }
    });

    // === DISCONNECT ===
    socket.on("disconnect", () => {
      console.log("Disconnessione:", socket.id);

      // Rimuove da code
      queue1v1 = queue1v1.filter((id) => id !== socket.id);
      queue2v2 = queue2v2.filter((id) => id !== socket.id);

      // Rimuove da availableGames
      availableGames = availableGames.filter((game) => {
        game.teams[0].players = game.teams[0].players.filter(
          (id) => id !== socket.id
        );
        game.teams[1].players = game.teams[1].players.filter(
          (id) => id !== socket.id
        );
        game.allPlayers = game.allPlayers.filter((id) => id !== socket.id);
        return game.allPlayers.length > 0;
      });

      // Rimuove da partite in corso
      Object.keys(games).forEach((gameId) => {
        const game = games[gameId];
        game.teams[0].players = game.teams[0].players.filter(
          (id) => id !== socket.id
        );
        game.teams[1].players = game.teams[1].players.filter(
          (id) => id !== socket.id
        );
        game.allPlayers = game.allPlayers.filter((id) => id !== socket.id);
        if (game.allPlayers.length === 0) delete games[gameId];
      });

      io.emit("available-games", availableGames);
    });
  });
};

export const getAvailableGames = () => availableGames;
