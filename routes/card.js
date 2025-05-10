import express from "express";
// import Card from "../model/Card.js";

import { pool } from "../db.js";
const router = express.Router();

router.get("/cards", async (req, res) => {
  try {
    const sql = `
    SELECT "cardList"
    FROM carddb
    WHERE patch = (
      SELECT MAX(patch)
      FROM carddb
    );
  `;
    const result = await pool.query(sql);
    const cards = result.rows[0].cardList;
    console.log(cards);
    res.json(cards);
  } catch (err) {
    console.error("Errore nel recupero carte:", err);
    res.status(500).json({ message: "Errore interno" });
  }
});

export default router;
