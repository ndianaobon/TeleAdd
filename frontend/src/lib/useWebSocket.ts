import { useEffect, useRef, useState } from 'react';
import { wsUrl } from './api';

/** Opens a WS connection to `path` (null to stay disconnected) and forwards parsed JSON messages to `onMessage`. */
export function useWebSocket<T = unknown>(path: string | null, onMessage: (data: T) => void) {
  const handlerRef = useRef(onMessage);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!path) return;
    const socket = new WebSocket(wsUrl(path));
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (event) => {
      try {
        handlerRef.current(JSON.parse(event.data));
      } catch {
        // ignore malformed frames
      }
    };
    return () => socket.close();
  }, [path]);

  return { connected };
}
