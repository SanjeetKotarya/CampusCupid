import React, { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

function ChatWindow({ match, currentUser, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef();
  const inputRef = useRef();
  const containerRef = useRef();
  const navigate = useNavigate();
  const [deleteMsgId, setDeleteMsgId] = useState(null);
  const [deletingMsg, setDeletingMsg] = useState(false);

  useEffect(() => {
    if (!match?.matchId) return;
    // Load cached messages first
    const cacheKey = `chat_messages_${match.matchId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        setMessages(JSON.parse(cached));
      } catch {}
    }
    const q = query(
      collection(db, "chats", match.matchId, "messages"),
      orderBy("timestamp", "asc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      localStorage.setItem(cacheKey, JSON.stringify(msgs));
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
    if (inputRef.current) inputRef.current.focus();
  };

  // Long press logic
  let longPressTimer = null;
  const handleMsgPointerDown = (msgId, isMine) => (e) => {
    if (!isMine) return;
    longPressTimer = setTimeout(() => setDeleteMsgId(msgId), 500);
  };
  const handleMsgPointerUp = () => {
    clearTimeout(longPressTimer);
  };

  const handleDeleteMessage = async () => {
    if (!deleteMsgId) return;
    setDeletingMsg(true);
    try {
      await deleteDoc(doc(db, "chats", match.matchId, "messages", deleteMsgId));
      setDeleteMsgId(null);
    } catch (err) {
      alert("Failed to delete message: " + err.message);
    } finally {
      setDeletingMsg(false);
    }
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
          onError={e => { e.target.onerror = null; e.target.src = "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"; }}
        />
        <span style={{ fontWeight: 600, color: "#ff4081" }}>{match.name}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", background: "#fff0fa", minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginTop: 'auto', padding: '16px' }}>
          {messages.map(msg => {
            const isMine = currentUser.uid === msg.senderId;
            return (
              <div key={msg.id} style={{
                display: "flex",
                flexDirection: isMine ? "row-reverse" : "row",
                marginBottom: 10,
                alignItems: "flex-end"
              }}>
                <div
                  style={{
                    background: isMine ? "#ff4081" : "#fff",
                    color: isMine ? "#fff" : "#ff4081",
                    borderRadius: 18,
                    padding: "8px 14px",
                    maxWidth: 220,
                    fontSize: 16,
                    boxShadow: "0 2px 8px #ff408122",
                    position: 'relative',
                    cursor: isMine ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                  onPointerDown={handleMsgPointerDown(msg.id, isMine)}
                  onPointerUp={handleMsgPointerUp}
                  onPointerLeave={handleMsgPointerUp}
                  onTouchStart={handleMsgPointerDown(msg.id, isMine)}
                  onTouchEnd={handleMsgPointerUp}
                  onTouchCancel={handleMsgPointerUp}
                >
                  {msg.text}
                </div>
              </div>
            );
          })}
          {/* Delete Message Modal */}
          {deleteMsgId && (
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 4px 32px #ff408144', padding: 32, minWidth: 220, textAlign: 'center', maxWidth: 320, width: '90%', pointerEvents: 'auto' }}>
                <div style={{ fontSize: 20, color: '#ff4081', fontWeight: 700, marginBottom: 12 }}>Delete Message?</div>
                <div style={{ color: '#888', marginBottom: 22, fontSize: 16 }}>Are you sure you want to delete this message?</div>
                <button
                  style={{ background: '#ff4081', color: '#fff', border: 'none', borderRadius: 16, padding: '10px 28px', fontWeight: 600, fontSize: 16, marginRight: 12, cursor: 'pointer' }}
                  onClick={handleDeleteMessage}
                  disabled={deletingMsg}
                >
                  {deletingMsg ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button
                  style={{ background: '#ffe0ec', color: '#ff4081', border: 'none', borderRadius: 16, padding: '10px 28px', fontWeight: 600, fontSize: 16, marginLeft: 12, cursor: 'pointer' }}
                  onClick={() => setDeleteMsgId(null)}
                  disabled={deletingMsg}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
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