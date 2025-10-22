export class Signal {
  constructor(private _active: boolean = false) {}

  activate() {
    this._active = true;
  }

  deactivate() {
    this._active = false;
  }

  get isActive() {
    return this._active;
  }
}
