import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import http from "http";
import { Server } from "socket.io";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
// Importa la logica di gestione dei giochi
import { initializeSocket } from "./socketManager.js";
// Crea il server HTTP
const server = http.createServer(app);

// Inizializza Socket.IO
const io = new Server(server);

// Gestione socket per la creazione delle stanze e la gestione dei turni
initializeSocket(io);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
