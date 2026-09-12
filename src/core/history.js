function copy(value) {
  return structuredClone(value);
}

export class History {
  #past = [];
  #present;
  #future = [];
  #limit;

  constructor(initial, { limit = 50 } = {}) {
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError('History limit must be a positive integer.');
    this.#limit = limit;
    this.#present = copy(initial);
  }

  get present() {
    return copy(this.#present);
  }

  get canUndo() {
    return this.#past.length > 0;
  }

  get canRedo() {
    return this.#future.length > 0;
  }

  commit(next) {
    this.#past.push(copy(this.#present));
    if (this.#past.length > this.#limit) this.#past.shift();
    this.#present = copy(next);
    this.#future = [];
    return this.present;
  }

  replace(next) {
    this.#present = copy(next);
    return this.present;
  }

  commitFrom(base, next) {
    this.#past.push(copy(base));
    if (this.#past.length > this.#limit) this.#past.shift();
    this.#present = copy(next);
    this.#future = [];
    return this.present;
  }

  undo() {
    if (!this.canUndo) return this.present;
    this.#future.push(copy(this.#present));
    this.#present = this.#past.pop();
    return this.present;
  }

  redo() {
    if (!this.canRedo) return this.present;
    this.#past.push(copy(this.#present));
    this.#present = this.#future.pop();
    return this.present;
  }
}
