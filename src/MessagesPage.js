import React, { useEffect, useState } from "react";
import { db, auth } from "./firebase";
import { collection, doc, getDoc, onSnapshot, deleteDoc, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import ChatWindow from "./ChatWindow";
import { useNavigate } from "react-router-dom";

function getMatchId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

function MessagesPage() {
  const [matches, setMatches] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unmatchTarget, setUnmatchTarget] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);

        // FIX: Query for matches that include the current user and listen for real-time updates.
        const matchesQuery = query(collection(db, "matches"), where("users", "array-contains", user.uid));
        
        const unsubMatches = onSnapshot(matchesQuery, async (snapshot) => {
          const userMatchesPromises = snapshot.docs.map(async (matchDoc) => {
            const data = matchDoc.data();
            const otherUserId = data.users.find((id) => id !== user.uid);
            if (otherUserId) {
              const otherUserDoc = await getDoc(doc(db, "users", otherUserId));
              if (otherUserDoc.exists()) {
                return {
                  ...otherUserDoc.data(),
                  id: otherUserId,
                  matchId: matchDoc.id,
                };
              }
            }
            return null;
          });

          const userMatches = (await Promise.all(userMatchesPromises)).filter(Boolean);
          setMatches(userMatches);
          setLoading(false);
        });

        return () => unsubMatches(); // Unsubscribe from matches listener
      } else {
        // Handle user logout
        setCurrentUser(null);
        setMatches([]);
        setLoading(true);
      }
    });

    return () => unsubAuth(); // Unsubscribe from auth listener
  }, []);

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ width: "100%", maxWidth: 430, margin: "0 auto", height: "calc(100vh - 70px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", position: "relative" }}>
      <h2 style={{ color: "#ff4081", margin: "18px 0 10px 0", fontWeight: 700, fontSize: 24 }}>Messages</h2>
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
      {selectedMatch && currentUser && (
        <ChatWindow
          match={selectedMatch}
          currentUser={currentUser}
          onClose={() => setSelectedMatch(null)}
        />
      )}
      {unmatchTarget && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.18)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 4px 24px #ff408122", padding: 32, minWidth: 280, textAlign: "center" }}>
            <div style={{ fontSize: 20, color: "#ff4081", fontWeight: 700, marginBottom: 12 }}>Unmatch {unmatchTarget.name}?</div>
            <div style={{ color: "#888", marginBottom: 22 }}>Are you sure you want to unmatch? This will remove your chat and match with this user.</div>
            <button
              style={{ background: "#ff4081", color: "#fff", border: "none", borderRadius: 16, padding: "8px 22px", fontWeight: 600, fontSize: 15, marginRight: 10, cursor: "pointer" }}
              onClick={async () => {
                await deleteDoc(doc(db, "matches", unmatchTarget.matchId));
                setMatches((prev) => prev.filter((m) => m.id !== unmatchTarget.id));
                if (selectedMatch && selectedMatch.id === unmatchTarget.id) setSelectedMatch(null);
                setUnmatchTarget(null);
              }}
            >
              Yes, Unmatch
            </button>
            <button
              style={{ background: "#ffe0ec", color: "#ff4081", border: "none", borderRadius: 16, padding: "8px 22px", fontWeight: 600, fontSize: 15, marginLeft: 10, cursor: "pointer" }}
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