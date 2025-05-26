import { pool } from "../db.js";
import mongoose from "mongoose";
import Card from "../model/Card.js";
import { extractUserId } from "./card-helpers.js";

export async function getSelectedDeckAndFrame(userId) {
  const id = extractUserId(userId);

  const result = await pool.query(
    `SELECT decks FROM decks WHERE user_id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error("Nessun deck trovato per questo utente.");
  }

  const decks = result.rows[0].decks;

  if (!Array.isArray(decks)) {
    throw new Error("Formato dei deck non valido.");
  }

  const selected = decks.find((deck) => deck.isSelected === true);

  if (!selected) {
    throw new Error("Nessun mazzo selezionato.");
  }

  if (!Array.isArray(selected.cards) || selected.cards.length !== 30) {
    throw new Error(
      `Il mazzo selezionato contiene ${
        selected.cards?.length || 0
      } carte. Ne servono 30.`
    );
  }

  const invalidIds = selected.cards.filter(
    (id) => !mongoose.Types.ObjectId.isValid(id)
  );

  if (invalidIds.length) {
    throw new Error("ID non validi nel mazzo: " + invalidIds.join(", "));
  }

  const objectIds = selected.cards.map((id) => new mongoose.Types.ObjectId(id));

  const cardObjects = await Card.find({
    _id: { $in: objectIds },
    isVisibile: true,
  }).lean();

  const cardsOrdered = [];
  for (const id of selected.cards) {
    const match = cardObjects.find((c) => c._id?.toString() === id);
    if (!match) {
      throw new Error(`Carta mancante nel DB per ID: ${id}`);
    }
    cardsOrdered.push(match);
  }

  if (cardsOrdered.length !== 30) {
    throw new Error(
      `Sono state recuperate solo ${cardsOrdered.length} carte valide su 30 richieste.`
    );
  }

  return {
    frame: selected.frame,
    cards: cardsOrdered,
  };
}
