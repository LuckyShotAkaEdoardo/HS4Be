import { Server } from "socket.io";

// Memorizzazione temporanea delle stanze
let availableGames = []; // Stanze in attesa di giocatori
let games = {}; // Partite già avviate

// Funzione per inizializzare il socket.io
export const initializeSocket = (server) => {
  const io = new Server(server);

  io.on("connection", (socket) => {
    console.log("Un giocatore si è connesso");

    // Crea una nuova partita
    socket.on("create-game", (gameName) => {
      const gameId = Math.random().toString(36).substring(7); // Genera un ID unico
      const game = {
        id: gameId,
        name: gameName,
        teams: [
          { players: [socket.id], name: "Squadra 1" }, // Squadra 1, con il primo giocatore
          { players: [], name: "Squadra 2" }, // Squadra 2, vuota all'inizio
        ],
        status: "waiting", // Stato della partita (in attesa o in corso)
        currentTurn: socket.id, // Inizia il turno del primo giocatore
      };

      availableGames.push(game);
      io.emit("available-games", availableGames); // Aggiorna tutti i client con le partite disponibili
    });

    // Un giocatore entra in una partita
    socket.on("join-game", (gameId) => {
      const game = availableGames.find((g) => g.id === gameId);

      if (
        game &&
        game.status === "waiting" &&
        game.teams[1].players.length < 2
      ) {
        // Aggiungi il giocatore alla seconda squadra
        game.teams[1].players.push(socket.id);
        game.status = "started"; // La partita è iniziata
        availableGames = availableGames.filter((g) => g.id !== gameId); // Rimuovi dalla lista delle partite disponibili
        games[gameId] = game; // Memorizza il gioco
        io.emit("available-games", availableGames); // Notifica a tutti i client disponibili
        io.to(socket.id).emit("game-started", gameId); // Avvisa il giocatore che si è unito
        io.to(game.teams[0].players[0]).emit("game-started", gameId); // Avvisa il primo giocatore della squadra 1
        io.to(game.teams[0].players[1]).emit("game-started", gameId); // Avvisa il secondo giocatore della squadra 1
        io.to(game.teams[1].players[0]).emit("game-started", gameId); // Avvisa il primo giocatore della squadra 2
        io.to(game.teams[1].players[1]).emit("game-started", gameId); // Avvisa il secondo giocatore della squadra 2
      }
    });

    // Funzione per terminare il turno e passare al prossimo
    const nextTurn = (gameId) => {
      const game = games[gameId];

      if (!game) return;

      // Trova il giocatore corrente
      const currentTeam = game.teams[0].players.includes(game.currentTurn)
        ? game.teams[0]
        : game.teams[1];
      const nextTeam =
        currentTeam === game.teams[0] ? game.teams[1] : game.teams[0];

      // Imposta il prossimo giocatore come "currentTurn"
      game.currentTurn = nextTeam.players[0]; // Alterna il turno tra i giocatori
      if (game.currentTurn === game.teams[0].players[1])
        game.currentTurn = game.teams[1].players[0]; // Passa al secondo giocatore della squadra

      // Notifica i giocatori
      io.to(game.currentTurn).emit("your-turn", gameId);
      io.to(nextTeam.players[0]).emit("waiting-for-turn", gameId); // Notifica la squadra che sta aspettando
    };

    // Fine del turno
    socket.on("end-turn", (gameId) => {
      nextTurn(gameId);
    });

    // Disconnect dei giocatori
    socket.on("disconnect", () => {
      console.log("Un giocatore si è disconnesso");
      // Rimuovi il giocatore da tutte le partite
      availableGames = availableGames.filter(
        (game) =>
          !game.teams[0].players.includes(socket.id) &&
          !game.teams[1].players.includes(socket.id)
      );
      io.emit("available-games", availableGames); // Rende disponibile la lista aggiornata delle partite
    });
  });
};

export const getAvailableGames = () => {
  return availableGames;
};
