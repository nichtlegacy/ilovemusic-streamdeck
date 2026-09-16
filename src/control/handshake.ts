import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import streamDeck from "@elgato/streamdeck";

import { decodeHandshake, type Handshake } from "./contracts";
import { AppUnavailableError, ControlProtocolError } from "./errors";

export const HANDSHAKE_PATHS = [
  path.join(homedir(), "Library", "Application Support", "ILoveMusic", "control.json"),
  path.join(homedir(), "Library", "Application Support", "I Love Music", "control.json"),
  path.join(homedir(), "Library", "Application Support", "ILOVEMusicMenubar", "control.json"),
];

type Logger = Pick<typeof streamDeck.logger, "debug">;
type ReadFileLike = (filePath: string, encoding: BufferEncoding) => Promise<string>;

export type HandshakeCache = {
  get(force?: boolean): Promise<Handshake>;
  invalidate(): void;
};

export async function readHandshakeFile(
  readFileImpl: ReadFileLike = readFile,
  logger: Logger = streamDeck.logger,
): Promise<Handshake> {
  let lastError: Error | undefined;

  for (const handshakePath of HANDSHAKE_PATHS) {
    try {
      const raw = await readFileImpl(handshakePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const handshake = decodeHandshake(parsed);
      logger.debug(`loaded control handshake from ${handshakePath}`);
      return handshake;
    } catch (error) {
      const err = toError(error);
      lastError = err instanceof SyntaxError
        ? new ControlProtocolError(`invalid handshake file at ${handshakePath}`, { cause: err })
        : err;
    }
  }

  throw new AppUnavailableError(
    `ILoveMusic app not running (handshake unreadable; checked: ${HANDSHAKE_PATHS.join(", ")})`,
    { cause: lastError },
  );
}

export function createHandshakeCache(
  loadHandshake: () => Promise<Handshake> = () => readHandshakeFile(),
): HandshakeCache {
  let cached: Handshake | null = null;

  return {
    async get(force = false): Promise<Handshake> {
      if (!force && cached) return cached;
      cached = await loadHandshake();
      return cached;
    },
    invalidate(): void {
      cached = null;
    },
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
