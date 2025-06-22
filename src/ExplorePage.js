import React, { useEffect, useState, useRef } from "react";
import { db, auth } from "./firebase";
import { collection, getDocs, doc, setDoc, getDoc, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function getMatchId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

function ExplorePage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [drag, setDrag] = useState({ x: 0, y: 0, isDragging: false, startX: 0, startY: 0 });
  const [swipeOut, setSwipeOut] = useState(null); // {dir: 'left'|'right', id}
  const [matchPopup, setMatchPopup] = useState(null);
  const [removingId, setRemovingId] = useState(null); // id of card being removed
  const cardRef = useRef();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        
        // Step 1: Fetch all users in one go.
        const usersQuerySnapshot = await getDocs(collection(db, "users"));
        const allUsers = new Map();
        usersQuerySnapshot.forEach((doc) => {
          if (doc.id !== user.uid) {
            allUsers.set(doc.id, { id: doc.id, ...doc.data() });
          }
        });

        // Step 2: Fetch only the matches that include the current user.
        const matchesQuery = query(collection(db, "matches"), where("users", "array-contains", user.uid));
        const matchesSnapshot = await getDocs(matchesQuery);
        const matchedUserIds = new Set();
        matchesSnapshot.forEach((matchDoc) => {
          const matchedUsers = matchDoc.data().users;
          const otherUserId = matchedUsers.find(uid => uid !== user.uid);
          if (otherUserId) {
            matchedUserIds.add(otherUserId);
          }
        });

        // Step 3: Filter out matched users from the initial user list.
        const filteredUserList = Array.from(allUsers.values()).filter(u => !matchedUserIds.has(u.id));
        
        setUsers(filteredUserList);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Like & Match logic
  const handleLike = async (likedUser) => {
    if (!currentUser) return;
    await setDoc(doc(db, `users/${currentUser.uid}/likes`, likedUser.id), {
      timestamp: Date.now(),
    });
    const theirLike = await getDoc(doc(db, `users/${likedUser.id}/likes`, currentUser.uid));
    if (theirLike.exists()) {
      const matchId = getMatchId(currentUser.uid, likedUser.id);
      await setDoc(doc(db, "matches", matchId), {
        users: [currentUser.uid, likedUser.id],
        timestamp: Date.now(),
      });
      setMatchPopup(likedUser);
      setTimeout(() => setMatchPopup(null), 2200);
    }
  };

  // Drag handlers
  const handleDragStart = (e) => {
    if (users.length === 0 || removingId) return;
    const isTouch = e.type === "touchstart";
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    setDrag({
      isDragging: true,
      startX: clientX,
      startY: clientY,
      x: 0,
      y: 0,
    });
    document.addEventListener(isTouch ? "touchmove" : "mousemove", handleDragMove);
    document.addEventListener(isTouch ? "touchend" : "mouseup", handleDragEnd);
  };
  const handleDragMove = (e) => {
    setDrag((d) => {
      if (!d.isDragging) return d;
      const isTouch = e.type === "touchmove";
      const clientX = isTouch ? e.touches[0].clientX : e.clientX;
      const clientY = isTouch ? e.touches[0].clientY : e.clientY;
      return {
        ...d,
        x: clamp(clientX - d.startX, -400, 400),
        y: clamp(clientY - d.startY, -100, 100),
      };
    });
  };
  const handleDragEnd = (e) => {
    setDrag((d) => {
      if (!d.isDragging) return d;
      let dir = null;
      if (d.x > 120) dir = "right";
      if (d.x < -120) dir = "left";
      if (dir) {
        const topUser = users[0];
        setSwipeOut({ dir, id: topUser.id });
        setRemovingId(topUser.id);
        setTimeout(() => {
          if (dir === "right") handleLike(topUser);
          setUsers((prev) => prev.filter((u) => u.id !== topUser.id));
          setDrag({ x: 0, y: 0, isDragging: false, startX: 0, startY: 0 });
          setSwipeOut(null);
          setRemovingId(null);
        }, 250);
      } else {
        setDrag({ x: 0, y: 0, isDragging: false, startX: 0, startY: 0 });
      }
      return { ...d, isDragging: false };
    });
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
    document.removeEventListener("touchmove", handleDragMove);
    document.removeEventListener("touchend", handleDragEnd);
  };

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ width: "100%", maxWidth: 430, margin: "0 auto", height: "calc(100vh - 70px)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
      {matchPopup && (
        <div style={{
          position: "absolute", top: 40, left: 0, right: 0, margin: "auto", zIndex: 9999, background: "#fff0fa", borderRadius: 18, boxShadow: "0 4px 24px #ff408122", padding: 24, textAlign: "center", maxWidth: 320
        }}>
          <div style={{ fontSize: 38, color: "#ff4081", marginBottom: 8 }}>💖 It's a Match!</div>
          <img src={matchPopup.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"} alt={matchPopup.name} style={{ width: 60, height: 60, borderRadius: "50%", border: "3px solid #ffb6d5", marginBottom: 8 }} />
          <div style={{ color: "#ff4081", fontWeight: 700 }}>{matchPopup.name}</div>
        </div>
      )}
      {users.length === 0 ? (
        <div style={{ color: "#bbb", fontSize: 22, textAlign: "center" }}>No more users to show</div>
      ) : (
        users.map((user, idx) => {
          const isTop = idx === 0;
          let style = {
            position: "absolute",
            width: 340,
            maxWidth: "90vw",
            background: "#fff",
            borderRadius: 24,
            boxShadow: "0 8px 32px #ff408122",
            padding: 24,
            left: 0,
            right: 0,
            margin: "auto",
            zIndex: users.length - idx,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            transition: "transform 0.25s cubic-bezier(.22,1,.36,1), opacity 0.2s",
          };
          if (isTop) {
            if (swipeOut && swipeOut.id === user.id) {
              style = {
                ...style,
                transform: `translate(${swipeOut.dir === "right" ? 500 : -500}px, 0px) rotate(${swipeOut.dir === "right" ? 30 : -30}deg)`,
                opacity: 0,
              };
            } else {
              style = {
                ...style,
                cursor: drag.isDragging ? "grabbing" : "grab",
                transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`
              };
            }
          } else {
            style = {
              ...style,
              top: idx * 6,
              scale: 1 - idx * 0.03,
              opacity: 1 - idx * 0.12,
            };
          }
          return (
            <div
              key={user.id}
              ref={isTop ? cardRef : null}
              style={style}
              onMouseDown={isTop && !removingId ? handleDragStart : undefined}
              onTouchStart={isTop && !removingId ? handleDragStart : undefined}
            >
              <img
                src={user.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
                alt={user.name}
                style={{ width: 110, height: 110, borderRadius: "50%", objectFit: "cover", border: "4px solid #ffb6d5", marginBottom: 12 }}
              />
              <h2 style={{ color: "#ff4081", margin: "8px 0 2px 0" }}>{user.name}</h2>
              <div style={{ color: "#888", fontSize: 15, marginBottom: 2 }}>{user.pronouns}</div>
              <div style={{ color: "#555", fontSize: 16, marginBottom: 4 }}>{user.college} {user.year && <>· {user.year}</>}</div>
              <div style={{ color: "#666", fontSize: 15, marginBottom: 8, textAlign: "center" }}>{user.about}</div>
              <div style={{ color: "#ff4081", fontSize: 14, marginBottom: 8, textAlign: "center" }}>{Array.isArray(user.interests) ? user.interests.join(", ") : user.interests}</div>
              {isTop && (
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginTop: 10 }}>
                  <span style={{ fontSize: 28, color: "#bbb" }}>❌</span>
                  <span style={{ fontSize: 28, color: "#ff4081" }}>💖</span>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default ExplorePage; 