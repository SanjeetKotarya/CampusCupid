import React, { useEffect, useState, useRef } from "react";
import { db, auth } from "./firebase";
import { collection, getDocs, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";
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
  const [drag, setDrag] = useState({ x: 0, y: 0, isDragging: false, startX: 0, startY: 0, lockDirection: null });
  const [swipeOut, setSwipeOut] = useState(null); // {dir: 'left'|'right', id}
  const [matchPopup, setMatchPopup] = useState(null);
  const [removingId, setRemovingId] = useState(null); // id of card being removed
  const cardRef = useRef();
  const dragPos = useRef({ x: 0, y: 0 });
  const rafRef = useRef();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        // Fetch all users except current
        const querySnapshot = await getDocs(collection(db, "users"));
        const userList = [];
        querySnapshot.forEach((doc) => {
          if (doc.id !== user.uid) {
            userList.push({ id: doc.id, ...doc.data() });
          }
        });
        // Fetch matches for current user
        const matchesSnapshot = await getDocs(collection(db, "matches"));
        const matchedUserIds = new Set();
        matchesSnapshot.forEach((matchDoc) => {
          const data = matchDoc.data();
          if (data.users && data.users.includes(user.uid)) {
            data.users.forEach((uid) => {
              if (uid !== user.uid) matchedUserIds.add(uid);
            });
          }
        });
        // Filter out matched users
        const filteredUsers = userList.filter((u) => !matchedUserIds.has(u.id));
        setUsers(filteredUsers);
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

  // Drag handlers (refactored for smooth animation)
  const handleDragStart = (e) => {
    if (users.length === 0 || removingId) return;
    const isTouch = e.type === "touchstart";
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    dragPos.current = { x: 0, y: 0, startX: clientX, startY: clientY, isDragging: true, lockDirection: null };
    if (cardRef.current) cardRef.current.style.transition = '';
    document.addEventListener(isTouch ? "touchmove" : "mousemove", handleDragMove, { passive: false });
    document.addEventListener(isTouch ? "touchend" : "mouseup", handleDragEnd);
  };
  const handleDragMove = (e) => {
    if (!dragPos.current.isDragging) return;
    const isTouch = e.type === "touchmove";
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    let dx = clientX - dragPos.current.startX;
    let dy = clientY - dragPos.current.startY;
    let lockDirection = dragPos.current.lockDirection;
    if (!lockDirection && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      lockDirection = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (lockDirection === 'horizontal') {
      if (isTouch) e.preventDefault();
      dx = clamp(dx, -400, 400);
      dy = clamp(dy, -100, 100);
      dragPos.current.x = dx;
      dragPos.current.y = dy;
      dragPos.current.lockDirection = lockDirection;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (cardRef.current) {
          cardRef.current.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
        }
      });
    } else {
      dragPos.current.lockDirection = lockDirection;
    }
  };
  const handleDragEnd = (e) => {
    if (!dragPos.current.isDragging) return;
    let dir = null;
    if (dragPos.current.lockDirection === 'horizontal') {
      if (dragPos.current.x > 120) dir = "right";
      if (dragPos.current.x < -120) dir = "left";
    }
    if (dir) {
      if (cardRef.current) cardRef.current.style.transition = 'transform 0.25s cubic-bezier(.4,1.5,.5,1)';
      if (cardRef.current) cardRef.current.style.transform = `translate(${dir === "right" ? 500 : -500}px, 0px) rotate(${dir === "right" ? 30 : -30}deg)`;
      const topUser = users[0];
      setSwipeOut({ dir, id: topUser.id });
      setRemovingId(topUser.id);
      setTimeout(() => {
        if (dir === "right") handleLike(topUser);
        setUsers((prev) => prev.filter((u) => u.id !== topUser.id));
        if (cardRef.current) cardRef.current.style.transition = '';
        if (cardRef.current) cardRef.current.style.transform = '';
        dragPos.current = { x: 0, y: 0 };
        setSwipeOut(null);
        setRemovingId(null);
      }, 250);
    } else {
      if (cardRef.current) cardRef.current.style.transition = 'transform 0.18s';
      if (cardRef.current) cardRef.current.style.transform = '';
    }
    dragPos.current = { x: 0, y: 0 };
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
            width: "90%",
            height: "75vh",
            maxHeight: 600,
            background: "#fff",
            borderRadius: 24,
            boxShadow: "0 8px 32px #ff408122",
            left: 0,
            right: 0,
            margin: "auto",
            zIndex: users.length - idx,
            display: "flex",
            flexDirection: "column",
            overflowY: 'auto',
            overscrollBehaviorY: 'contain',
            WebkitOverscrollBehaviorY: 'contain',
            touchAction: 'pan-x',
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
                cursor: drag.isDragging && drag.lockDirection === 'horizontal' ? "grabbing" : "grab",
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
              className="profile-card-scrollbar-hide"
              onMouseDown={isTop && !removingId ? handleDragStart : undefined}
              onTouchStart={isTop && !removingId ? handleDragStart : undefined}
            >
              {/* Profile details at the top */}
              <div style={{ padding: '24px 24px 12px 24px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <img
                  src={user.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
                  alt={user.name}
                  style={{ width: 110, height: 110, borderRadius: "50%", objectFit: "cover", border: "4px solid #ffb6d5", marginBottom: 12 }}
                />
                <h2 style={{ color: "#ff4081", margin: "8px 0 2px 0" }}>{user.name}</h2>
                <div style={{ color: "#888", fontSize: 15, marginBottom: 2 }}>{user.pronouns}</div>
                <div style={{ color: "#555", fontSize: 16, marginBottom: 4 }}>
                  {user.college}
                  {user.department && <> · {user.department}</>}
                  {user.year && <> · {user.year}</>}
                </div>
                <div style={{ color: "#666", fontSize: 15, marginBottom: 8, textAlign: "center", whiteSpace: 'pre-wrap' }}>{user.about}</div>
                <div style={{ color: "#ff4081", fontSize: 14, marginBottom: 8, textAlign: "center" }}>{Array.isArray(user.interests) ? user.interests.join(", ") : user.interests}</div>
              </div>

              {/* No pictures uploaded message at the bottom */}
              <div style={{ width: '100%', minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 18, fontStyle: 'italic', margin: '16px 0 0 0' }}>
                No pictures uploaded
              </div>

              {isTop && (
                <div style={{ display: "flex", justifyContent: "space-around", width: "100%", marginTop: 'auto', padding: 16, background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', borderTop: '1px solid #eee', position: 'sticky', bottom: 0, flexShrink: 0 }}>
                  <button style={{ background: 'none', border: 'none', fontSize: 32, color: "#ff7a7a" }}>❌</button>
                  <button style={{ background: 'none', border: 'none', fontSize: 32, color: "#84ff7a" }}>💖</button>
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