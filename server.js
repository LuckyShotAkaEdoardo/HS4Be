import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import cardRoutes from "./routes/card.js";
import deckRoutes from "./routes/deck.js";
import helmet from "helmet";
import mongoose from "mongoose";
import {
  initializeSocket,
  cleanupOldGames,
  logStatus,
} from "./socketManager.js"; // ✅ importa correttamente
import "./bot.js";

dotenv.config();

const app = express();
const server = http.createServer(app); // ✅ necessario per socket.io
app.use(helmet());
app.use(cors());
app.use("/images", express.static("images"));

app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/api", cardRoutes);
app.use("/decks", deckRoutes);
mongoose
  .connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connesso"))
  .catch((err) => console.error("❌ Errore MongoDB:", err));

initializeSocket(server); // ✅ avvia gestione socket
setInterval(() => {
  cleanupOldGames();
  logStatus();
}, 20000);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
