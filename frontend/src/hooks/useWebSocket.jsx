import { useEffect, useRef, useState } from 'react';

export function useWebSocket(url) {
    const [messages, setMessages] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef(null);

    useEffect(() => {
        const connect = () => {
            ws.current = new WebSocket(url);
            
            ws.current.onopen = () => {
                setIsConnected(true);
                console.log("WebSocket Connected");
            };

            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    setMessages(prev => [...prev, data]);
                } catch (e) {
                    console.error("Invalid JSON from WS", e);
                }
            };

            ws.current.onclose = () => {
                setIsConnected(false);
                console.log("WebSocket Disconnected. Reconnecting in 3s...");
                setTimeout(connect, 3000);
            };
        };

        connect();

        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, [url]);

    const sendMessage = (msg) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(msg));
        }
    };

    return { messages, isConnected, sendMessage, setMessages };
}
