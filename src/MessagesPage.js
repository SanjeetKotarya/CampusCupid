import React, { useEffect, useState } from "react";
import { db, auth } from "./firebase";
import { collection, getDocs, doc, getDoc, onSnapshot, deleteDoc, query, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import ChatWindow from "./ChatWindow";
import { useNavigate } from "react-router-dom";

function getMatchId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

function MessagesPage() {
  const [matches, setMatches] = useState([]);
  const [requests, setRequests] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unmatchTarget, setUnmatchTarget] = useState(null);
  const [tab, setTab] = useState('messages');
  const navigate = useNavigate();
  const [touchStartX, setTouchStartX] = useState(null);
  const [touchEndX, setTouchEndX] = useState(null);

  useEffect(() => {
    const cached = localStorage.getItem('messages_matches');
    if (cached) {
      try {
        setMatches(JSON.parse(cached));
        setLoading(false);
      } catch {}
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        // Listen for matches
        const q = collection(db, "matches");
        const unsubscribe = onSnapshot(q, async (snapshot) => {
          const userMatches = [];
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            if (data.users.includes(user.uid)) {
              // Get the other user's info
              const otherId = data.users.find((id) => id !== user.uid);
              const otherDoc = await getDoc(doc(db, "users", otherId));
              if (otherDoc.exists()) {
                userMatches.push({
                  ...otherDoc.data(),
                  id: otherId,
                  matchId: docSnap.id,
                });
              }
            }
          }
          setMatches(userMatches);
          localStorage.setItem('messages_matches', JSON.stringify(userMatches));
          setLoading(false);
        });
        // Fetch requests (pending likes)
        const fetchRequests = async () => {
          // Users who liked me but are not matched
          const likesSnapshot = await getDocs(collection(db, "users", user.uid, "likes"));
          const myLikes = new Set();
          likesSnapshot.forEach(doc => myLikes.add(doc.id));
          // Get all users who liked me
          const usersSnapshot = await getDocs(collection(db, "users"));
          const requestsList = [];
          for (const userDoc of usersSnapshot.docs) {
            if (userDoc.id === user.uid) continue;
            // Did this user like me?
            const theirLikeDoc = await getDoc(doc(db, "users", userDoc.id, "likes", user.uid));
            if (theirLikeDoc.exists() && !myLikes.has(userDoc.id)) {
              requestsList.push({ id: userDoc.id, ...userDoc.data() });
            }
          }
          setRequests(requestsList);
        };
        fetchRequests();
        return () => unsubscribe();
      }
    });
    return () => unsub();
  }, []);

  const handleAcceptRequest = async (requestUser) => {
    if (!currentUser) return;
    // Like them back to create a match
    await setDoc(doc(db, `users/${currentUser.uid}/likes`, requestUser.id), {
      timestamp: Date.now(),
    });
    const matchId = getMatchId(currentUser.uid, requestUser.id);
    await setDoc(doc(db, "matches", matchId), {
      users: [currentUser.uid, requestUser.id],
      timestamp: Date.now(),
    });
    // Remove from requests
    setRequests(prev => prev.filter(u => u.id !== requestUser.id));
  };

  // Swipe gesture handlers
  const handleTouchStart = (e) => {
    if (e.touches && e.touches.length === 1) {
      setTouchStartX(e.touches[0].clientX);
      setTouchEndX(null);
    }
  };
  const handleTouchMove = (e) => {
    if (e.touches && e.touches.length === 1) {
      setTouchEndX(e.touches[0].clientX);
    }
  };
  const handleTouchEnd = () => {
    if (touchStartX !== null && touchEndX !== null) {
      const dx = touchEndX - touchStartX;
      if (Math.abs(dx) > 60) {
        if (dx < 0 && tab === 'messages') setTab('requests'); // swipe left
        if (dx > 0 && tab === 'requests') setTab('messages'); // swipe right
      }
    }
    setTouchStartX(null);
    setTouchEndX(null);
  };

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}>Loading...</div>;

  return (
    <div
      style={{ width: "100%", maxWidth: 430, margin: "0 auto", height: "calc(100vh - 70px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", position: "relative" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', width: '100%', borderBottom: '2px solid #ffe0ec', marginBottom: 8 }}>
        <button
          style={{
            flex: 1,
            padding: '14px 0',
            background: 'none',
            border: 'none',
            color: tab === 'messages' ? '#ff4081' : '#bbb',
            fontWeight: tab === 'messages' ? 700 : 500,
            fontSize: 18,
            borderBottom: tab === 'messages' ? '3px solid #ff4081' : 'none',
            cursor: 'pointer',
            transition: 'color 0.18s, border 0.18s',
          }}
          onClick={() => setTab('messages')}
        >
          Messages
        </button>
        <button
          style={{
            flex: 1,
            padding: '14px 0',
            background: 'none',
            border: 'none',
            color: tab === 'requests' ? '#ff4081' : '#bbb',
            fontWeight: tab === 'requests' ? 700 : 500,
            fontSize: 18,
            borderBottom: tab === 'requests' ? '3px solid #ff4081' : 'none',
            cursor: 'pointer',
            transition: 'color 0.18s, border 0.18s',
            position: 'relative',
          }}
          onClick={() => setTab('requests')}
        >
          Requests
          {requests.length > 0 && (
            <span style={{
              position: 'absolute',
              top: 8,
              right: 32,
              background: '#ff4081',
              color: '#fff',
              borderRadius: '50%',
              width: 22,
              height: 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'monospace',
              boxShadow: '0 2px 8px #ff408122',
            }}>{requests.length}</span>
          )}
        </button>
      </div>
      {/* Tab Content */}
      {tab === 'messages' ? (
        <>
          {matches.length === 0 ? (
            <div style={{ color: "#bbb", fontSize: 20, marginTop: 40 }}>No matches yet</div>
          ) : (
            <div style={{ width: "100%" }}>
              {matches.map((match) => (
                <div
                  key={match.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "14px 18px",
                    borderBottom: "1px solid #f5c1e1",
                    cursor: "pointer",
                    position: "relative"
                  }}
                >
                  <img
                    src={match.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
                    alt={match.name}
                    style={{ width: 48, height: 48, borderRadius: "50%", marginRight: 14, border: "2px solid #ffb6d5", cursor: "pointer" }}
                    onClick={e => { e.stopPropagation(); navigate(`/profile/${match.id}`); }}
                    onError={e => { e.target.onerror = null; e.target.src = "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"; }}
                  />
                  <div style={{ flex: 1 }} onClick={() => setSelectedMatch(match)}>
                    <div style={{ color: "#ff4081", fontWeight: 600, fontSize: 18 }}>{match.name}</div>
                    <div style={{ color: "#888", fontSize: 14 }}>{match.gender}</div>
                  </div>
                  <button
                    style={{
                      background: "#ffe0ec",
                      color: "#ff4081",
                      border: "none",
                      borderRadius: 16,
                      padding: "6px 14px",
                      fontWeight: 600,
                      fontSize: 13,
                      marginLeft: 8,
                      cursor: "pointer"
                    }}
                    onClick={e => { e.stopPropagation(); setUnmatchTarget(match); }}
                  >
                    Unmatch
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {requests.length === 0 ? (
            <div style={{ color: "#bbb", fontSize: 20, marginTop: 40 }}>No requests yet</div>
          ) : (
            <div style={{ width: "100%" }}>
              {requests.map((req) => (
                <div
                  key={req.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "14px 18px",
                    borderBottom: "1px solid #f5c1e1",
                    position: "relative"
                  }}
                >
                  <img
                    src={req.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
                    alt={req.name}
                    style={{ width: 48, height: 48, borderRadius: "50%", marginRight: 14, border: "2px solid #ffb6d5", cursor: "pointer" }}
                    onClick={e => { e.stopPropagation(); navigate(`/profile/${req.id}`); }}
                    onError={e => { e.target.onerror = null; e.target.src = "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"; }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#ff4081", fontWeight: 600, fontSize: 18 }}>{req.name}</div>
                    <div style={{ color: "#888", fontSize: 14 }}>{req.gender}</div>
                  </div>
                  <button
                    style={{
                      background: "#ff4081",
                      color: "#fff",
                      border: "none",
                      borderRadius: 16,
                      padding: "6px 18px",
                      fontWeight: 600,
                      fontSize: 14,
                      marginLeft: 8,
                      cursor: "pointer"
                    }}
                    onClick={() => handleAcceptRequest(req)}
                  >
                    Match
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {selectedMatch && currentUser && (
        <ChatWindow
          match={selectedMatch}
          currentUser={currentUser}
          onClose={() => setSelectedMatch(null)}
        />
      )}
      {unmatchTarget && (
        <div style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.18)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 4px 24px #ff408122", padding: 32, minWidth: 280, textAlign: "center", maxWidth: 360, width: '90%' }}>
            <div style={{ fontSize: 24, color: "#ff4081", fontWeight: 700, marginBottom: 12 }}>Unmatch {unmatchTarget.name}?</div>
            <div style={{ color: "#888", marginBottom: 22, fontSize: 18 }}>Are you sure you want to unmatch? This will remove your chat and match with this user.</div>
            <button
              style={{ background: "#ff4081", color: "#fff", border: "none", borderRadius: 16, padding: "12px 32px", fontWeight: 600, fontSize: 18, marginRight: 16, cursor: "pointer" }}
              onClick={async () => {
                if (!currentUser || !unmatchTarget) return;
                const matchId = unmatchTarget.matchId;
                const otherUserId = unmatchTarget.id;

                // Delete chat messages
                const messagesQuery = query(collection(db, "chats", matchId, "messages"));
                const messagesSnapshot = await getDocs(messagesQuery);
                const messageDeletions = messagesSnapshot.docs.map(doc => deleteDoc(doc.ref));

                // Also delete the match document and the likes from both users
                await Promise.all([
                  ...messageDeletions,
                  deleteDoc(doc(db, "matches", matchId)),
                  deleteDoc(doc(db, "users", currentUser.uid, "likes", otherUserId)),
                  deleteDoc(doc(db, "users", otherUserId, "likes", currentUser.uid)),
                ]);

                // Update UI
                setMatches(prev => prev.filter(m => m.id !== otherUserId));
                if (selectedMatch?.id === otherUserId) setSelectedMatch(null);
                setUnmatchTarget(null);
              }}
            >
              Yes, Unmatch
            </button>
            <button
              style={{ background: "#ffe0ec", color: "#ff4081", border: "none", borderRadius: 16, padding: "12px 32px", fontWeight: 600, fontSize: 18, marginLeft: 16, cursor: "pointer" }}
              onClick={() => setUnmatchTarget(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MessagesPage; 