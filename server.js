import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import cardRoutes from "./routes/card.js";
import { initializeSocket } from "./socketManager.js"; // ✅ importa correttamente

dotenv.config();

const app = express();
const server = http.createServer(app); // ✅ necessario per socket.io
app.use("/images", express.static("images"));

app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/api", cardRoutes);

initializeSocket(server); // ✅ avvia gestione socket

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
