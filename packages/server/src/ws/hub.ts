import type { WebSocket } from "ws";
import type { ServerMessage } from "@dnd/shared";

/** Live sockets, grouped by session. Purely in-memory: the DB is the source of truth. */
const sessions = new Map<string, Map<string, WebSocket>>();

export function register(sessionId: string, playerId: string, socket: WebSocket): void {
  const existing = sessions.get(sessionId) ?? new Map<string, WebSocket>();
  existing.set(playerId, socket);
  sessions.set(sessionId, existing);
}

export function unregister(sessionId: string, playerId: string): void {
  const group = sessions.get(sessionId);
  if (!group) return;
  group.delete(playerId);
  if (group.size === 0) sessions.delete(sessionId);
}

export function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

export function broadcast(sessionId: string, message: ServerMessage): void {
  const group = sessions.get(sessionId);
  if (!group) return;
  const payload = JSON.stringify(message);
  for (const socket of group.values()) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

export function sendToPlayer(sessionId: string, playerId: string, message: ServerMessage): void {
  const socket = sessions.get(sessionId)?.get(playerId);
  if (socket) send(socket, message);
}

export function connectedPlayerIds(sessionId: string): string[] {
  return [...(sessions.get(sessionId)?.keys() ?? [])];
}
