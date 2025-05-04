import express from "express";
// import Card from "../model/Card.js";
import { cardDb } from "../data/cardDatabase.js";

const router = express.Router();

router.get("/cards", async (req, res) => {
  try {
    const cards = cardDb;

    res.json(cards);
  } catch (err) {
    console.error("Errore nel recupero carte:", err);
    res.status(500).json({ message: "Errore interno" });
  }
});

export default router;
