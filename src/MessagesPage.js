import React, { useEffect, useState, useRef } from "react";
import { db, auth } from "./firebase";
import { collection, getDocs, doc, getDoc, onSnapshot, deleteDoc, query, setDoc, orderBy, limit, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import ChatWindow from "./ChatWindow";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "./components/LoadingSpinner";
import AudioCallWindow from "./components/AudioCallWindow";

function getMatchId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

function MessagesPage({ currentUser }) {
  const [matches, setMatches] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unmatchTarget, setUnmatchTarget] = useState(null);
  const [tab, setTab] = useState('messages');
  const navigate = useNavigate();
  const [touchStartX, setTouchStartX] = useState(null);
  const [touchEndX, setTouchEndX] = useState(null);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const prevTabRef = useRef(tab);
  const [unmatching, setUnmatching] = useState(null);
  const [callId, setCallId] = useState(null);
  const [isCaller, setIsCaller] = useState(false);
  const [audioCallOpen, setAudioCallOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null); // { callId, matchId, offer, callerId, callerName }
  const [pendingOffer, setPendingOffer] = useState(null);
  const [chatWasOpenBeforeCall, setChatWasOpenBeforeCall] = useState(false);
  const [callReallyEnded, setCallReallyEnded] = useState(false);
  const [matchPopup, setMatchPopup] = useState(null);

  // Derive selectedMatch from matches and selectedMatchId
  const selectedMatch = matches.find(m => m.matchId === selectedMatchId) || null;

  // Helper to get latest message timestamp for a match
  async function getLatestMessageTimestamp(matchId) {
    const messagesCol = collection(db, "chats", matchId, "messages");
    const q = query(messagesCol, orderBy("timestamp", "desc"), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const msg = snap.docs[0].data();
      return msg.timestamp?.toMillis?.() || msg.timestamp || 0;
    }
    return 0;
  }

  // Helper to get count of new messages for a match
  async function getNewMessagesCount(matchId, lastSeenTimestamp) {
    const messagesCol = collection(db, "chats", matchId, "messages");
    const q = query(messagesCol, orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    let count = 0;
    snap.forEach(doc => {
      const msg = doc.data();
      const ts = msg.timestamp?.toMillis?.() || msg.timestamp || 0;
      // Only count messages from the remote user (not current user)
      if (ts > (lastSeenTimestamp || 0) && msg.senderId !== currentUser?.uid) {
        count++;
      }
    });
    return count;
  }

  const [matchNewMsgCounts, setMatchNewMsgCounts] = useState({});

  // Update per-match new message counts when matches or last seen timestamps change
  useEffect(() => {
    const lastSeenTimestamps = JSON.parse(localStorage.getItem('messages_last_seen_timestamps') || '{}');
    (async () => {
      const counts = {};
      for (const match of matches) {
        counts[match.matchId] = await getNewMessagesCount(match.matchId, lastSeenTimestamps[match.matchId] || 0);
      }
      setMatchNewMsgCounts(counts);
    })();
  }, [matches]);

  useEffect(() => {
    const cached = localStorage.getItem('messages_matches');
    if (cached) {
      try {
        setMatches(JSON.parse(cached));
        setLoading(false);
      } catch {}
    }
    if (!currentUser) return;
    // Listen for matches
    const matchesQuery = query(collection(db, "matches"), where("users", "array-contains", currentUser.uid));
    const unsubscribe = onSnapshot(matchesQuery, async (snapshot) => {
      const userMatches = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        // Get the other user's info
        const otherId = data.users.find((id) => id !== currentUser.uid);
        const otherDoc = await getDoc(doc(db, "users", otherId));
        if (otherDoc.exists()) {
          userMatches.push({
            ...otherDoc.data(),
            id: otherId,
            matchId: docSnap.id,
            matchTimestamp: data.timestamp || 0,
          });
        }
      }
      // For each match, get the latest message timestamp
      const matchesWithActivity = await Promise.all(userMatches.map(async (match) => {
        const latestMsg = await getLatestMessageTimestamp(match.matchId);
        return {
          ...match,
          latestActivity: latestMsg || match.matchTimestamp || 0,
        };
      }));
      // Sort by latestActivity descending
      matchesWithActivity.sort((a, b) => (b.latestActivity || 0) - (a.latestActivity || 0));
      setMatches(matchesWithActivity);
      // --- Preserve selectedMatch reference if possible ---
      if (selectedMatchId) {
        const found = matchesWithActivity.find(m => m.matchId === selectedMatchId);
        if (found) {
          // Only update if reference is different
          if (found !== selectedMatch) {
            setSelectedMatchIdLogged(found.matchId);
          }
        } else {
          // If match no longer exists, close chat
          setSelectedMatchIdLogged(null);
        }
      }
      localStorage.setItem('messages_matches', JSON.stringify(matchesWithActivity));
      setLoading(false);

      // --- New matches and new messages notification logic ---
      const lastSeenMatches = JSON.parse(localStorage.getItem('messages_last_seen_matches') || '[]');
      const lastSeenTimestamps = JSON.parse(localStorage.getItem('messages_last_seen_timestamps') || '{}');
      let newMatchCount = 0;
      let newMsgCount = 0;
      const currentMatchIds = matchesWithActivity.map(m => m.matchId);
      // New matches
      for (const id of currentMatchIds) {
        if (!lastSeenMatches.includes(id)) newMatchCount++;
      }
      // New messages
      for (const match of matchesWithActivity) {
        const latest = await getLatestMessageTimestamp(match.matchId);
        if (latest && latest > (lastSeenTimestamps[match.matchId] || 0)) newMsgCount++;
      }
      setNewMessagesCount(newMatchCount + newMsgCount);
    });
    // Fetch requests (pending likes) once on load
    const fetchRequests = async () => {
      // Users who liked me but are not matched
      const likesSnapshot = await getDocs(collection(db, "users", currentUser.uid, "likes"));
      const myLikes = new Set();
      likesSnapshot.forEach(doc => myLikes.add(doc.id));
      // Get all users who liked me
      const usersSnapshot = await getDocs(collection(db, "users"));
      const requestsList = [];
      for (const userDoc of usersSnapshot.docs) {
        if (userDoc.id === currentUser.uid) continue;
        // Did this user like me?
        const theirLikeDoc = await getDoc(doc(db, "users", userDoc.id, "likes", currentUser.uid));
        if (theirLikeDoc.exists() && !myLikes.has(userDoc.id)) {
          requestsList.push({ id: userDoc.id, ...userDoc.data() });
        }
      }
      setRequests(requestsList);
    };
    fetchRequests();
    return () => { unsubscribe(); };
  }, [currentUser]);

  // When user visits the Messages tab, update last seen
  useEffect(() => {
    let cancelled = false;
    // Only update if switching from another tab to 'messages'
    if (prevTabRef.current !== 'messages' && tab === 'messages' && matches.length > 0) {
      localStorage.setItem('messages_last_seen_matches', JSON.stringify(matches.map(m => m.matchId)));
      (async () => {
        const timestamps = {};
        for (const match of matches) {
          timestamps[match.matchId] = await getLatestMessageTimestamp(match.matchId);
        }
        localStorage.setItem('messages_last_seen_timestamps', JSON.stringify(timestamps));
        if (!cancelled) setNewMessagesCount(0);
      })();
    }
    prevTabRef.current = tab;
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [tab, matches.length]);

  // When a chat is opened, update last seen timestamp for that match
  useEffect(() => {
    if (selectedMatchId && selectedMatchId) {
      (async () => {
        const latest = await getLatestMessageTimestamp(selectedMatchId);
        // Update localStorage for this match
        const lastSeenTimestamps = JSON.parse(localStorage.getItem('messages_last_seen_timestamps') || '{}');
        lastSeenTimestamps[selectedMatchId] = latest;
        localStorage.setItem('messages_last_seen_timestamps', JSON.stringify(lastSeenTimestamps));
        // Update the per-match new message count
        setMatchNewMsgCounts(prev => ({ ...prev, [selectedMatchId]: 0 }));
      })();
    }
  }, [selectedMatchId]);

  // When chat window is closed, update last seen timestamp and unread count
  useEffect(() => {
    if (!selectedMatchId) {
      // Chat window closed, update all unread counts
      const lastSeenTimestamps = JSON.parse(localStorage.getItem('messages_last_seen_timestamps') || '{}');
      (async () => {
        const counts = {};
        for (const match of matches) {
          counts[match.matchId] = await getNewMessagesCount(match.matchId, lastSeenTimestamps[match.matchId] || 0);
        }
        setMatchNewMsgCounts(counts);
      })();
    }
  }, [selectedMatchId, matches]);

  // Real-time unread count update for each match
  useEffect(() => {
    if (!currentUser || !matches.length) return;
    const unsubscribes = [];
    const lastSeenTimestamps = JSON.parse(localStorage.getItem('messages_last_seen_timestamps') || '{}');
    matches.forEach(match => {
      const messagesCol = collection(db, "chats", match.matchId, "messages");
      const q = query(messagesCol, orderBy("timestamp", "desc"), limit(1));
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const msg = snap.docs[0].data();
          const ts = msg.timestamp?.toMillis?.() || msg.timestamp || 0;
          // Only count if message is from the other user
          if (msg.senderId === currentUser.uid) {
            setMatchNewMsgCounts(prev => ({ ...prev, [match.matchId]: 0 }));
            return;
          }
          // If chat is open, don't increment unread
          if (selectedMatchId === match.matchId) {
            setMatchNewMsgCounts(prev => ({ ...prev, [match.matchId]: 0 }));
            return;
          }
          // Otherwise, update unread count if new message
          if (ts > (lastSeenTimestamps[match.matchId] || 0)) {
            setMatchNewMsgCounts(prev => ({ ...prev, [match.matchId]: (prev[match.matchId] || 0) + 1 }));
          }
        }
      });
      unsubscribes.push(unsub);
    });
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [matches, selectedMatchId, currentUser]);

  // Add this useEffect to listen for incoming call offers globally
  useEffect(() => {
    if (!currentUser || !matches.length) return;
    const unsubs = [];
    matches.forEach(match => {
      const callsCol = collection(db, "chats", match.matchId, "calls");
      const unsub = onSnapshot(callsCol, (snap) => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data();
            const callId = change.doc.id;
            // If this is an offer and not from me, and not already in a call
            if (data.type === 'offer' && data.offer && data.offer.callerId && !audioCallOpen && !incomingCall && data.offer.callerId !== currentUser.uid) {
              setIncomingCall({
                callId,
                matchId: match.matchId,
                offer: data.offer,
                callerId: data.offer.callerId,
                callerName: match.name,
                photoURL: match.photoURL,
              });
              setPendingOffer(data.offer);
            }
          }
        });
      });
      unsubs.push(unsub);
    });
    return () => { unsubs.forEach(u => u()); };
  }, [currentUser, matches, audioCallOpen, incomingCall]);

  // Add this effect to close incoming call modal if caller ends the call before receiver accepts
  useEffect(() => {
    if (!incomingCall) return;
    const callDocRef = doc(db, "chats", incomingCall.matchId, "calls", incomingCall.callId);
    const unsub = onSnapshot(callDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.type === 'end' || data.type === 'declined') {
          setIncomingCall(null);
        }
      }
    });
    return () => unsub();
  }, [incomingCall]);

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
    // Show match popup
    setMatchPopup(requestUser);
    setTimeout(() => setMatchPopup(null), 2200);
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

  // Add a logging wrapper for setSelectedMatchId
  const setSelectedMatchIdLogged = (val) => {
    console.log('[MessagesPage] setSelectedMatchId called with', val, new Error().stack);
    setSelectedMatchId(val);
  };

  // Logging wrappers
  const setCallIdLogged = (val) => {
    console.log('[MessagesPage] setCallIdLogged called with', val);
    setCallId(val);
  };
  const setAudioCallOpenLogged = (val) => {
    console.log('[MessagesPage] setAudioCallOpenLogged called with', val);
    setAudioCallOpen(val);
  };

  // Common audio call starter
  const handleStartAudioCall = (match) => {
    if (!currentUser || !match) return;
    setChatWasOpenBeforeCall(!!selectedMatchId);
    const newCallId = `${currentUser.uid}_${Date.now()}`;
    setCallIdLogged(newCallId);
    setIsCaller(true);
    setSelectedMatchIdLogged(match.matchId); // Only set selectedMatchId here
    // Do NOT open call window or send offer yet
  };

  // Open call window and send offer only after selectedMatch is set
  useEffect(() => {
    if (isCaller && callId && selectedMatch && !audioCallOpen) {
      setAudioCallOpenLogged(true);
      setDoc(doc(db, "chats", selectedMatch.matchId, "calls", callId), {
        type: 'offer',
        offer: { 
          callerId: currentUser.uid,
          timestamp: Date.now()
        }
      });
    }
    // eslint-disable-next-line
  }, [isCaller, callId, selectedMatch]);

  // Accept/decline handlers for global incoming call
  const handleAcceptCall = () => {
    if (!incomingCall) return;
    setChatWasOpenBeforeCall(!!selectedMatchId);
    setCallIdLogged(incomingCall.callId);
    setIsCaller(false);
    setAudioCallOpenLogged(true);
    setSelectedMatchIdLogged(incomingCall.matchId);
    setPendingOffer(incomingCall.offer);
    setIncomingCall(null);
  };
  const handleDeclineCall = async () => {
    if (!incomingCall) return;
    await setDoc(doc(db, "chats", incomingCall.matchId, "calls", incomingCall.callId), { type: 'declined', declinedBy: currentUser.uid }, { merge: true });
    setIncomingCall(null);
  };

  if (loading) return <LoadingSpinner fullScreen text="Loading..." />;

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
            position: 'relative',
          }}
          onClick={() => setTab('messages')}
        >
          Matches
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
                    position: "relative",
                    background: '#fff',
                  }}
                >
                  {/* Blur and spinner overlay for unmatching */}
                  {unmatching === match.id && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      background: 'rgba(255,255,255,0.7)',
                      backdropFilter: 'blur(2.5px) grayscale(0.3)',
                      zIndex: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 0,
                    }}>
                      <LoadingSpinner size={32} text="" />
                    </div>
                  )}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    filter: unmatching === match.id ? 'blur(2px) grayscale(0.3)' : 'none',
                    opacity: unmatching === match.id ? 0.7 : 1,
                    pointerEvents: unmatching === match.id ? 'none' : 'auto',
                    transition: 'filter 0.2s, opacity 0.2s',
                  }}>
                    <img
                      src={match.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
                      alt={match.name}
                      style={{ width: 48, height: 48, borderRadius: "50%", marginRight: 14, border: "2px solid #ffb6d5", cursor: "pointer" }}
                      onClick={e => { e.stopPropagation(); navigate(`/profile/${match.id}`); }}
                      onError={e => { e.target.onerror = null; e.target.src = "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"; }}
                    />
                    <div style={{ flex: 1 }} onClick={() => setSelectedMatchIdLogged(match.matchId)}>
                      <div style={{ color: "#ff4081", fontWeight: 600, fontSize: 18 }}>{match.name}</div>
                      <div style={{ color: "#888", fontSize: 14 }}>{match.gender}</div>
                    </div>
                    {matchNewMsgCounts[match.matchId] > 0 && (
                      <span style={{
                        position: 'absolute',
                        top: 10,
                        left: 38,
                        background: '#ff4081',
                        color: '#fff',
                        borderRadius: '50%',
                        width: 20,
                        height: 20,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        boxShadow: '0 2px 8px #ff408122',
                        zIndex: 3,
                      }}>{matchNewMsgCounts[match.matchId]}</span>
                    )}
                    {/* Call Button */}
                    <button
                      style={{
                        background: 'none',
                        color: '#00bcd4',
                        border: 'none',
                        borderRadius: 16,
                        padding: 0,
                        fontWeight: 600,
                        fontSize: 18,
                        marginLeft: 8,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        boxShadow: 'none',
                      }}
                      title="Start Audio Call"
                      onClick={e => {
                        e.stopPropagation();
                        handleStartAudioCall(match);
                      }}
                    >
                      <span role="img" aria-label="audio call" style={{ fontSize: 24, margin: 0 }}>📞</span>
                    </button>
                    {/* Unmatch Button */}
                    {unmatching === match.id ? (
                      <div style={{ marginLeft: 8, width: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                    ) : (
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
                    )}
                  </div>
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
          key={selectedMatch.matchId}
          match={selectedMatch}
          currentUser={currentUser}
          onClose={() => setSelectedMatchIdLogged(null)}
          onStartAudioCall={() => handleStartAudioCall(selectedMatch)}
          audioCallOpen={audioCallOpen}
          setAudioCallOpen={setAudioCallOpenLogged}
          callId={callId}
          setCallId={setCallIdLogged}
          isCaller={isCaller}
          setIsCaller={setIsCaller}
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
                setUnmatching(otherUserId); // Start spinner
                setUnmatchTarget(null); // Close popup immediately
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
                if (selectedMatch?.id === otherUserId) setSelectedMatchIdLogged(null);
                setUnmatching(null); // Remove spinner
                // Remove cached chat messages for this match
                localStorage.removeItem(`chat_messages_${matchId}`);
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
      {incomingCall && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', borderRadius: 32, marginTop: 5 }}>
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', borderRadius: 32, marginTop: 24 }}>
            {/* Profile Picture */}
            <img
              src={incomingCall.photoURL || 'https://api.dicebear.com/7.x/person/svg?seed=CampusCupid'}
              alt={incomingCall.callerName || 'User'}
              style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', marginBottom: 32, marginTop: 24, border: '4px solid #fff', boxShadow: '0 2px 16px #ff408122' }}
              onError={e => { e.target.onerror = null; e.target.src = 'https://api.dicebear.com/7.x/person/svg?seed=CampusCupid'; }}
            />
            {/* Caller Name */}
            <div style={{ fontSize: 28, color: '#ff4081', fontWeight: 700, marginBottom: 8 }}>
              {incomingCall.callerName || 'Someone'}
            </div>
            {/* Calling Text */}
            <div style={{ color: '#888', fontSize: 18, marginBottom: 36, letterSpacing: 2 }}>
              CALLING...
            </div>
            {/* Accept/Decline Buttons - stick to bottom */}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 48, display: 'flex', justifyContent: 'center', gap: 36 }}>
              <button
                onClick={handleAcceptCall}
                style={{
                  background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 64,
                  height: 64,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 12px #43e97b44',
                  cursor: 'pointer',
                  marginRight: 0,
                }}
                title="Accept Call"
              >
                <span role="img" aria-label="accept" style={{ fontSize: 32, color: '#fff' }}>📞</span>
              </button>
              <button
                onClick={handleDeclineCall}
                style={{
                  background: 'linear-gradient(135deg, #ff5858 0%, #f857a6 100%)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 64,
                  height: 64,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 12px #ff585844',
                  cursor: 'pointer',
                  marginLeft: 0,
                }}
                title="Decline Call"
              >
                <span role="img" aria-label="decline" style={{ fontSize: 32, color: '#fff', transform: 'rotate(135deg)' }}>📞</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {audioCallOpen && !callReallyEnded && (
        <AudioCallWindow
          callId={callId}
          isCaller={isCaller}
          onEnd={(fatalError, userEndedCall) => {
            setAudioCallOpenLogged(false);
            if (fatalError || userEndedCall) setCallIdLogged(null);
            setIsCaller(false);
            setPendingOffer(null);
            if (!chatWasOpenBeforeCall) setSelectedMatchIdLogged(null);
            setCallReallyEnded(true);
          }}
          signalingSend={msg => {
            if (!callId || !selectedMatch) return;
            return setDoc(doc(db, "chats", selectedMatch.matchId, "calls", callId), msg, { merge: true });
          }}
          signalingListen={cb => {
            if (!callId || !selectedMatch) return () => {};
            const callDocRef = doc(db, "chats", selectedMatch.matchId, "calls", callId);
            let lastData = null;
            const unsub = onSnapshot(callDocRef, (snap) => {
              if (snap.exists()) {
                const data = snap.data();
                if (JSON.stringify(data) !== JSON.stringify(lastData)) {
                  lastData = data;
                  cb(data);
                }
              }
            });
            return unsub;
          }}
          remoteUserName={selectedMatch?.name || 'Remote User'}
          remoteUserPhotoURL={selectedMatch?.photoURL}
          pendingOffer={pendingOffer}
          setCallReallyEnded={setCallReallyEnded}
        />
      )}
      {/* Match Popup Modal (copied from ExplorePage) */}
      {matchPopup && (
        <div style={{
          position: "absolute", top: 40, left: 0, right: 0, margin: "auto", zIndex: 9999, background: "#fff0fa", borderRadius: 18, boxShadow: "0 4px 24px #ff408122", padding: 24, textAlign: "center", maxWidth: 320
        }}>
          <div style={{ fontSize: 38, color: "#ff4081", marginBottom: 8 }}>💖 It's a Match!</div>
          <img src={matchPopup.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"} alt={matchPopup.name} style={{ width: 60, height: 60, borderRadius: "50%", border: "3px solid #ffb6d5", marginBottom: 8 }} />
          <div style={{ color: "#ff4081", fontWeight: 700 }}>{matchPopup.name}</div>
        </div>
      )}
    </div>
  );
}

export default MessagesPage; 