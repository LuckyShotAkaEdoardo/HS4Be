import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "secret";
router.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    // Controlla username già esistente
    const result = await pool.query("SELECT 1 FROM users WHERE username = $1", [
      username,
    ]);
    if (result.rowCount) {
      return res.status(409).json({ error: "Username già in uso" });
    }

    // Hash della password
    const passwordHash = await bcrypt.hash(password, 10);

    // Inserisci nel DB
    await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
      [username, passwordHash]
    );

    return res
      .status(201)
      .json({ message: "Registrazione avvenuta con successo" });
  } catch (err) {
    console.error("Errore registrazione:", err);
    return res
      .status(500)
      .json({ error: "Errore interno durante la registrazione" });
  }
});

r; // Login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    // Recupera utente
    const result = await pool.query(
      "SELECT id, username, password_hash FROM users WHERE username = $1",
      [username]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    // Verifica password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    // Genera JWT
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.json({ token });
  } catch (err) {
    console.error("Errore login:", err);
    return res.status(500).json({ error: "Errore interno durante il login" });
  }
});

export default router;
