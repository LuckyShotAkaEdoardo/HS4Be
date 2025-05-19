import mongoose from "mongoose";
const { Schema } = mongoose;

const cardSchema = new Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  type: { type: String, enum: ["HERO", "MAGIC"] },
  attack: Number,
  defense: Number,
  cost: Number,
  image: String,
  description: String,
  abilities: Schema.Types.Mixed,
  effect: Schema.Types.Mixed,
});

const Card = mongoose.model("Card", cardSchema);
export default Card;
