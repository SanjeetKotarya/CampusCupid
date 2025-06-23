import React, { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

function ChatWindow({ match, currentUser, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef();
  const inputRef = useRef();
  const containerRef = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    if (!match?.matchId) return;
    const q = query(
      collection(db, "chats", match.matchId, "messages"),
      orderBy("timestamp", "asc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [match?.matchId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    await addDoc(collection(db, "chats", match.matchId, "messages"), {
      senderId: currentUser.uid,
      text: input,
      timestamp: serverTimestamp(),
    });
    setInput("");
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
        background: "rgba(255,255,255,0.98)", maxWidth: 430, margin: "0 auto",
        display: "flex", flexDirection: "column",
        height: "100dvh",
        minHeight: "-webkit-fill-available",
        boxSizing: "border-box"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", padding: 12, borderBottom: "1px solid #eee", flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: "#ff4081", marginRight: 8 }}>&larr;</button>
        <img
          src={match.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
          alt={match.name}
          style={{ width: 36, height: 36, borderRadius: "50%", marginRight: 8, cursor: "pointer", border: '2px solid #ffb6d5' }}
          onClick={() => navigate(`/profile/${match.id}`)}
        />
        <span style={{ fontWeight: 600, color: "#ff4081" }}>{match.name}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", background: "#fff0fa", minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginTop: 'auto', padding: '16px' }}>
          {messages.map(msg => (
            <div key={msg.id} style={{
              display: "flex",
              flexDirection: currentUser.uid === msg.senderId ? "row-reverse" : "row",
              marginBottom: 10,
              alignItems: "flex-end"
            }}>
              <div style={{
                background: currentUser.uid === msg.senderId ? "#ff4081" : "#fff",
                color: currentUser.uid === msg.senderId ? "#fff" : "#ff4081",
                borderRadius: 18,
                padding: "8px 14px",
                maxWidth: 220,
                fontSize: 16,
                boxShadow: "0 2px 8px #ff408122"
              }}>{msg.text}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <form onSubmit={sendMessage} style={{ display: "flex", padding: 12, borderTop: "1px solid #eee", background: "#fff", flexShrink: 0 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
          style={{ flex: 1, border: "none", borderRadius: 18, padding: "10px 16px", fontSize: 16, outline: "none", background: "#fff0fa" }}
        />
        <button type="submit" style={{ marginLeft: 8, background: "#ff4081", color: "#fff", border: "none", borderRadius: 18, padding: "8px 18px", fontWeight: 600, fontSize: 16 }}>Send</button>
      </form>
    </div>
  );
}

export default ChatWindow; 