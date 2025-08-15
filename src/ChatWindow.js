import React, { useEffect, useRef, useState } from "react";
import { db } from "./firebase";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import AudioCallWindow from "./components/AudioCallWindow";

function ChatWindow({ match, currentUser, onClose, onStartAudioCall, audioCallOpen, setAudioCallOpen, callId, setCallId, isCaller, setIsCaller }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef();
  const inputRef = useRef();
  const containerRef = useRef();
  const navigate = useNavigate();
  const [deleteMsgId, setDeleteMsgId] = useState(null);
  const [deletingMsg, setDeletingMsg] = useState(false);
  const [menuMsgId, setMenuMsgId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  const [unmatched, setUnmatched] = useState(false);
  const [lastSignal, setLastSignal] = useState(null);
  const pcRef = useRef(null);

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

  // Listen for match document deletion (unmatch by other user)
  useEffect(() => {
    if (!match?.matchId) return;
    const matchDocRef = doc(db, "matches", match.matchId);
    const unsub = onSnapshot(matchDocRef, (snap) => {
      if (!snap.exists()) {
        setUnmatched(true);
        setTimeout(() => {
          setUnmatched(false);
          onClose();
        }, 2000);
      }
    });
    return () => unsub();
  }, [match?.matchId, onClose]);

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
    // Update last seen timestamp for this chat to now
    const lastSeenTimestamps = JSON.parse(localStorage.getItem('messages_last_seen_timestamps') || '{}');
    lastSeenTimestamps[match.matchId] = Date.now();
    localStorage.setItem('messages_last_seen_timestamps', JSON.stringify(lastSeenTimestamps));
  };

  // Long press logic
  let longPressTimer = null;
  const handleMsgPointerDown = (msgId, isMine, msgText) => (e) => {
    if (!isMine) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    longPressTimer = setTimeout(() => {
      setMenuMsgId(msgId);
      setMenuAnchor({ x: clientX, y: clientY });
    }, 500);
  };
  const handleMsgPointerUp = () => {
    clearTimeout(longPressTimer);
  };

  const handleCopyMessage = (msgId) => {
    const msg = messages.find(m => m.id === msgId);
    if (msg) {
      navigator.clipboard.writeText(msg.text);
    }
    setMenuMsgId(null);
  };

  const handleUnsendMessage = (msgId) => {
    setMenuMsgId(null);
    setDeleteMsgId(msgId);
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

  // Calculate menu position to keep it inside the viewport
  const getMenuPosition = () => {
    const menuWidth = 140;
    const menuHeight = 96;
    let { x, y } = menuAnchor;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    return { left: x, top: y };
  };

  // Firestore signaling helpers
  const signalingSend = async (msg) => {
    if (!callId) return;
    await setDoc(doc(db, "chats", match.matchId, "calls", callId), msg, { merge: true });
  };

  // --- FIXED SIGNALING LISTEN FUNCTION ---
  // Listens to the call doc in Firestore and calls cb with new data
  const signalingListen = (cb) => {
    if (!callId) return () => {};
    const callDocRef = doc(db, "chats", match.matchId, "calls", callId);
    let lastData = null;
    const unsub = onSnapshot(callDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // Only call cb if data changed
        if (JSON.stringify(data) !== JSON.stringify(lastData)) {
          lastData = data;
          cb(data);
        }
      }
    });
    return unsub;
  };

  useEffect(() => {
    if (!audioCallOpen || !callId) return;
    const unsub = onSnapshot(doc(db, "chats", match.matchId, "calls", callId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLastSignal(data);
      }
    });
    return () => unsub();
  }, [audioCallOpen, callId, match.matchId]);

  useEffect(() => {
    console.log('[ChatWindow] audioCallOpen:', audioCallOpen, 'callId:', callId, 'selectedMatch:', match?.id);
  }, [audioCallOpen, callId, match?.id]);

  useEffect(() => {
    console.log('[ChatWindow] MOUNTED');
    return () => {
      console.log('[ChatWindow] UNMOUNTED');
    };
  }, []);

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
      <div style={{ display: "flex", alignItems: "center", padding: 12, borderBottom: "1px solid #eee", flexShrink: 0, position: 'relative' }}>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: "#ff4081", marginRight: 8 }}>&larr;</button>
        <img
          src={match.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
          alt={match.name}
          style={{ width: 36, height: 36, borderRadius: "50%", marginRight: 8, cursor: "pointer", border: '2px solid #ffb6d5' }}
          onClick={() => navigate(`/profile/${match.id}`)}
          onError={e => { e.target.onerror = null; e.target.src = "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"; }}
        />
        <span style={{ fontWeight: 600, color: "#ff4081" }}>{match.name}</span>
        {/* Audio Call Button */}
        <button
          onClick={onStartAudioCall}
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: '#ff4081',
            fontSize: 26,
            cursor: 'pointer',
            padding: 0,
            marginLeft: 8,
          }}
          title="Start Audio Call"
        >
          <span role="img" aria-label="audio call">📞</span>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", background: "#fff0fa", minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Unmatched popup */}
        {unmatched && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 5000, background: 'rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 4px 32px #ff408144', padding: 32, minWidth: 220, textAlign: 'center', maxWidth: 320, width: '90%' }}>
              <div style={{ fontSize: 20, color: '#ff4081', fontWeight: 700, marginBottom: 12 }}>The other person unmatched you.</div>
              <div style={{ color: '#888', marginBottom: 12, fontSize: 16 }}>This chat will close automatically.</div>
            </div>
          </div>
        )}
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
                  onPointerDown={handleMsgPointerDown(msg.id, isMine, msg.text)}
                  onPointerUp={handleMsgPointerUp}
                  onPointerLeave={handleMsgPointerUp}
                  onTouchStart={handleMsgPointerDown(msg.id, isMine, msg.text)}
                  onTouchEnd={handleMsgPointerUp}
                  onTouchCancel={handleMsgPointerUp}
                >
                  {msg.text}
                </div>
              </div>
            );
          })}
          {/* Message Action Menu */}
          {menuMsgId && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 4000, background: 'rgba(0,0,0,0.01)' }} onClick={() => setMenuMsgId(null)}>
              <div style={{
                position: 'absolute',
                ...getMenuPosition(),
                background: '#fff',
                borderRadius: 12,
                boxShadow: '0 4px 24px #ff408122',
                padding: 0,
                minWidth: 120,
                width: 140,
                minHeight: 0,
                overflow: 'hidden',
                border: '1px solid #ffe0ec',
                zIndex: 4100
              }}>
                <button style={{ display: 'block', width: '100%', padding: '12px 24px', background: 'none', border: 'none', color: '#ff4081', fontWeight: 600, fontSize: 16, cursor: 'pointer', textAlign: 'left' }} onClick={() => handleCopyMessage(menuMsgId)}>Copy</button>
                <button style={{ display: 'block', width: '100%', padding: '12px 24px', background: 'none', border: 'none', color: '#d32f2f', fontWeight: 600, fontSize: 16, cursor: 'pointer', textAlign: 'left' }} onClick={() => handleUnsendMessage(menuMsgId)}>Unsend</button>
              </div>
            </div>
          )}
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
      {audioCallOpen && (
        <AudioCallWindow
          callId={callId}
          isCaller={isCaller}
          onEnd={() => {
            console.log('[ChatWindow] AudioCallWindow onEnd called');
            setAudioCallOpen(false);
            setCallId(null);
            setIsCaller(false);
          }}
          signalingSend={signalingSend}
          signalingListen={signalingListen}
          remoteUserName={match.name}
        />
      )}
    </div>
  );
}

export default ChatWindow; 