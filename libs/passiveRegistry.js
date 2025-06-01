class PassiveEffectRegistry {
  constructor() {
    this.registry = new Map();
  }

  _resolveId(gameOrId) {
    return typeof gameOrId === "object" ? gameOrId.id : gameOrId;
  }

  get(gameOrId) {
    const id = this._resolveId(gameOrId);
    if (!this.registry.has(id)) {
      this.registry.set(id, {});
    }
    return this.registry.get(id);
  }

  set(gameOrId, value) {
    const id = this._resolveId(gameOrId);
    this.registry.set(id, value);
  }

  delete(gameOrId) {
    const id = this._resolveId(gameOrId);
    this.registry.delete(id);
  }

  keys() {
    return Array.from(this.registry.keys());
  }
}
const passiveEffectRegistry = new PassiveEffectRegistry();
export default passiveEffectRegistry;
