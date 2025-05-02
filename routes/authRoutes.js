import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "secret";

router.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
      [username, hash]
    );
    res.send({ message: "User registered" });
  } catch (err) {
    res
      .status(500)
      .send({ error: "Registration failed", details: err.message });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    const user = result.rows[0];
    if (!user) return res.status(401).send({ error: "Invalid credentials" });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).send({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET
    );
    res.send({ token });
  } catch (err) {
    res.status(500).send({ error: "Login failed", details: err.message });
  }
});

export default router;
