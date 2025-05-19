import express from "express";
import { pool } from "../db.js"; // importa il tuo client PostgreSQL

import Card from "../model/Card.js";
const router = express.Router();

// SQL queries
const selectUsername = `SELECT id, deck_id FROM users WHERE username = $1`;
const findDeck = `SELECT * FROM decks WHERE id = $1`;

const selecteRouterQuery = `
  SELECT d.decks
  FROM users u
  JOIN decks d ON u.id = d.user_id
  WHERE u.username = $1
`;

const updateQuery = `
  UPDATE decks
  SET decks = $1
  WHERE user_id = $2
  RETURNING *
`;

const deleteQuery = `DELETE FROM decks WHERE user_id = $1 RETURNING *`;

// Validatore (base)
function validateDecks(decks) {
  if (!Array.isArray(decks) || decks.length > 5) {
    throw new Error("Devi fornire massimo 5 mazzi");
  }

  let selectedIndex = -1;

  for (const [i, deck] of decks.entries()) {
    if (typeof deck !== "object" || deck === null)
      throw new Error(`Mazzo ${i + 1} non valido`);

    // if (typeof deck.isSelected !== "boolean")
    //   throw new Error(`Mazzo ${i + 1} manca isSelected`);

    if (!Array.isArray(deck.cards))
      throw new Error(`Mazzo ${i + 1} manca cards`);

    if (deck.cards.length > 30)
      throw new Error(`Mazzo ${i + 1} ha troppe carte`);

    if (deck.isSelected) {
      if (selectedIndex !== -1) {
        throw new Error("Solo un mazzo può essere selezionato");
      }
      if (typeof deck.frame !== "string" || deck.frame === "") {
        throw new Error(`Mazzo ${i + 1} manca frame`);
      }

      selectedIndex = i;
    }
  }

  // if (selectedIndex === -1) {
  //   throw new Error("Devi selezionare un mazzo");
  // }

  // if (decks[selectedIndex].cards.length < 30) {
  //   throw new Error(
  //     `Il mazzo selezionato (Deck ${
  //       selectedIndex + 1
  //     }) deve contenere almeno 30 carte`
  //   );
  // }
}

// PUT /decks/:username → aggiorna i mazzi di un utente
router.put("/:username", async (req, res) => {
  const { username } = req.params;
  const { decks } = req.body;

  try {
    validateDecks(decks);

    const userRes = await pool.query(selectUsername, [username]);
    if (!userRes.rows.length) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    const userId = userRes.rows[0].id;

    const result = await pool.query(updateQuery, [
      JSON.stringify(decks),
      userId,
    ]);

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ error: "Deck non trovato per questo utente" });
    }

    res.json({ success: true, updated: result.rows[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /decks/:username → elimina i mazzi associati
router.delete("/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const userRes = await pool.query(selectUsername, [username]);
    if (!userRes.rows.length) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    const userId = userRes.rows[0].id;
    const result = await pool.query(deleteQuery, [userId]);

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ error: "Deck non trovato per questo utente" });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Errore interno", detail: err.message });
  }
});

// GET /decks/selected/:username → mazzo con isSelected: true
router.get("/selected/:username", async (req, res) => {
  const { username } = req.params;

  try {
    const result = await pool.query(selecteRouterQuery, [username]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Deck non trovato per questo username" });
    }

    const decks = result.rows[0].decks;
    const selected = decks.find((deck) => deck.isSelected === true);

    if (!selected) {
      return res.status(404).json({ error: "Nessun mazzo selezionato" });
    }

    if (!Array.isArray(selected.cards) || selected.cards.length !== 30) {
      return res.status(400).json({
        error: `Il mazzo selezionato contiene ${
          selected.cards?.length || 0
        } carte. Ne servono 30.`,
      });
    }

    res.json(selected);
  } catch (err) {
    res.status(500).json({ error: "Errore interno", detail: err.message });
  }
});

// GET /decks/init/:username → inizializza se mancante
router.get("/init/:username", async (req, res) => {
  const { username } = req.params;

  try {
    // 1. Trova l'utente
    const userRes = await pool.query(selectUsername, [username]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    const user = userRes.rows[0];

    // 2. Se ha già deck_id, recupera e ritorna
    if (user.deck_id) {
      const deckRes = await pool.query(findDeck, [user.deck_id]);
      if (deckRes.rows.length) {
        return res.json(deckRes.rows[0]);
      }
    }

    // 3. Altrimenti, crea il record dei decks
    const emptyDecks = Array.from({ length: 5 }).map((_, i) => ({
      isSelected: false,
      frame: "",
      cards: [],
    }));

    const insertDeckRes = await pool.query(
      `INSERT INTO decks (user_id, decks) VALUES ($1, $2) RETURNING id, decks`,
      [user.id, JSON.stringify(emptyDecks)]
    );

    const newDeckId = insertDeckRes.rows[0].id;

    // 4. Aggiorna users.deck_id
    await pool.query(`UPDATE users SET deck_id = $1 WHERE id = $2`, [
      newDeckId,
      user.id,
    ]);

    res.json(insertDeckRes.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Errore interno", detail: err.message });
  }
});

// 🔹 READ ALL - GET /cards
router.get("/allcard", async (req, res) => {
  try {
    const cards = await Card.find();

    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: "Errore nel recupero carte" });
  }
});

// GET /decks/random/:count?mode=deck|summon&type=HERO|MAGIC|ALL
router.get("/random/:count", async (req, res) => {
  const count = parseInt(req.params.count, 10);
  const mode = req.query.mode || "deck"; // default = 'deck'
  const type = req.query.type?.toUpperCase() || "ALL"; // default = ALL

  if (isNaN(count) || count <= 0) {
    return res.status(400).json({ error: "Numero non valido" });
  }

  if (!["deck", "summon"].includes(mode)) {
    return res.status(400).json({ error: "Modalità non valida" });
  }

  if (!["HERO", "MAGIC", "ALL"].includes(type)) {
    return res.status(400).json({ error: "Tipo non valido" });
  }

  try {
    const filter = type === "ALL" ? {} : { type };
    const cards = await Card.find(filter); // recupera solo il tipo richiesto
    if (!cards.length) {
      return res.status(500).json({ error: `Nessuna carta ${type} trovata` });
    }

    // Random shuffle
    const shuffled = [...cards].sort(() => 0.5 - Math.random());

    const result = [];
    const maxCopies = mode === "deck" ? 2 : 1;
    const used = {};

    for (const card of shuffled) {
      const key = card.id || card._id.toString();
      used[key] = used[key] || 0;

      if (used[key] < maxCopies) {
        result.push(card);
        used[key]++;
      }

      if (result.length >= count) break;
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Errore interno", detail: err.message });
  }
});

export default router;
