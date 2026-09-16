export class AppUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AppUnavailableError";
  }
}

export class ControlProtocolError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ControlProtocolError";
  }
}

export class ControlRequestError extends Error {
  readonly method: string;
  readonly path: string;
  readonly status: number;

  constructor(method: string, path: string, status: number) {
    super(`ILoveMusic control request failed: ${method} ${path} -> ${status}`);
    this.name = "ControlRequestError";
    this.method = method;
    this.path = path;
    this.status = status;
  }
}

export class ControlTransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ControlTransportError";
  }
}
