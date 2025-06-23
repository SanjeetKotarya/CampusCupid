import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, query } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { FaBars } from "react-icons/fa";

const years = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Other"];
const genders = ["Male", "Female", "Other"];

function EditProfileModal({ open, onClose, profile, onSave }) {
  const [form, setForm] = useState(profile);
  useEffect(() => { setForm(profile); }, [profile]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 2000,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      background: 'transparent',
    }}>
      <div
        className="edit-profile-modal-scroll"
        style={{
          maxWidth: 430,
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
          padding: '12px 24px 80px 24px',
          background: '#fff',
          borderRadius: 0,
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxHeight: '96vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: 12 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#ff4081', cursor: 'pointer', marginRight: 8, padding: 0, lineHeight: 1 }} aria-label="Back">
            {'<'}
          </button>
          <span style={{ color: "#ff4081", fontWeight: 700, fontSize: 17 }}>Edit Profile</span>
        </div>
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <img
              src={form.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
              alt="Profile"
              style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid #ffb6d5", marginBottom: 18, marginTop: 8 }}
            />
            <input name="name" value={form.name} onChange={handleChange} placeholder="Name" className="auth-input" required style={{ width: '100%', maxWidth: 340 }} />
            <input name="pronouns" value={form.pronouns || ""} onChange={handleChange} placeholder="Pronouns (e.g. she/her)" className="auth-input" style={{ width: '100%', maxWidth: 340 }} />
            <input name="college" value={form.college} onChange={handleChange} placeholder="College/University" className="auth-input" required style={{ width: '100%', maxWidth: 340 }} />
            <select name="year" value={form.year} onChange={handleChange} className="auth-input" required style={{ width: '100%', maxWidth: 340 }}>
              <option value="">Select Year</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select name="gender" value={form.gender} onChange={handleChange} className="auth-input" required style={{ width: '100%', maxWidth: 340 }}>
              <option value="">Gender</option>
              {genders.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <textarea name="about" value={form.about} onChange={handleChange} placeholder="About you (bio)" className="auth-input" rows={3} style={{ resize: "vertical", width: '100%', maxWidth: 340 }} />
            <input name="interests" value={form.interests} onChange={handleChange} placeholder="Interests (comma separated)" className="auth-input" style={{ width: '100%', maxWidth: 340 }} />
            <button type="submit" className="auth-btn primary" style={{ marginTop: 8, width: '100%', maxWidth: 340 }}>Save</button>
            <button type="button" className="auth-btn secondary" style={{ marginTop: 8, width: '100%', maxWidth: 340 }} onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfilePage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({
    name: "",
    pronouns: "",
    college: "",
    year: "",
    about: "",
    gender: "",
    interests: "",
    photoURL: ""
  });
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate("/auth");
      } else {
        setUser(currentUser);
        // Load profile from Firestore
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile({ ...profile, ...docSnap.data() });
        } else {
          setProfile((p) => ({ ...p, name: currentUser.displayName || "", photoURL: currentUser.photoURL || "" }));
        }
        setLoading(false);
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line
  }, []);

  const handleEditSave = async (form) => {
    setError("");
    try {
      await setDoc(doc(db, "users", user.uid), {
        ...profile,
        ...form,
        interests: form.interests.split(",").map((i) => i.trim()).filter(Boolean),
      });
      setProfile((p) => ({ ...p, ...form }));
      setEditOpen(false);
    } catch (err) {
      setError("Failed to save profile. " + err.message);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/auth");
  };

  // Delete Account Handler
  const handleDeleteAccount = async () => {
    setError("");
    setDeleting(true);
    try {
      // 1. Delete all matches and related chats/likes
      const matchesSnapshot = await getDocs(collection(db, "matches"));
      const myMatches = matchesSnapshot.docs.filter(docSnap => {
        const data = docSnap.data();
        return data.users && data.users.includes(user.uid);
      });
      for (const matchDoc of myMatches) {
        const matchId = matchDoc.id;
        const data = matchDoc.data();
        const otherUserId = data.users.find((id) => id !== user.uid);
        // Delete all chat messages
        const messagesQuery = query(collection(db, "chats", matchId, "messages"));
        const messagesSnapshot = await getDocs(messagesQuery);
        await Promise.all(messagesSnapshot.docs.map(doc => deleteDoc(doc.ref)));
        // Delete the match document
        await deleteDoc(matchDoc.ref);
        // Delete likes from both users
        await deleteDoc(doc(db, "users", user.uid, "likes", otherUserId));
        await deleteDoc(doc(db, "users", otherUserId, "likes", user.uid));
      }
      // 2. Delete all likes from this user
      const likesSnapshot = await getDocs(collection(db, "users", user.uid, "likes"));
      await Promise.all(likesSnapshot.docs.map(doc => deleteDoc(doc.ref)));
      // 3. Delete all likes to this user (from other users)
      const usersSnapshot = await getDocs(collection(db, "users"));
      for (const otherUserDoc of usersSnapshot.docs) {
        if (otherUserDoc.id === user.uid) continue;
        const likeDocRef = doc(db, "users", otherUserDoc.id, "likes", user.uid);
        await deleteDoc(likeDocRef);
      }
      // 4. Delete user document
      await deleteDoc(doc(db, "users", user.uid));
      // 5. Sign out and redirect
      await signOut(auth);
      navigate("/auth");
    } catch (err) {
      setError("Failed to delete account. " + err.message);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 430, width: '100%', margin: '0 auto', boxSizing: 'border-box', padding: '0 18px 54px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      {/* Hamburger Menu */}
      <button
        style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', fontSize: 28, color: '#ff4081', zIndex: 10, cursor: 'pointer' }}
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Menu"
      >
        <span style={{ fontSize: 28, fontWeight: 700 }}>&#9776;</span>
      </button>
      {menuOpen && (
        <div style={{ position: 'absolute', top: 54, right: 18, background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px #ff408122', minWidth: 170, zIndex: 20, padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
          <button
            style={{ background: 'none', border: 'none', color: '#ff4081', fontWeight: 600, fontSize: 16, padding: '12px 18px', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => { setEditOpen(true); setMenuOpen(false); }}
          >
            Edit Profile
          </button>
          <button
            style={{ background: 'none', border: 'none', color: '#ff4081', fontWeight: 600, fontSize: 16, padding: '12px 18px', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => { handleSignOut(); setMenuOpen(false); }}
          >
            Logout
          </button>
          <button
            style={{ background: 'none', border: 'none', color: '#d32f2f', fontWeight: 600, fontSize: 16, padding: '12px 18px', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => { setDeleteOpen(true); setMenuOpen(false); }}
            disabled={deleting}
          >
            Delete Account
          </button>
        </div>
      )}
      {/* Profile Header */}
      <div style={{ display: "flex", flexDirection: 'column', alignItems: "center", gap: 18, marginBottom: 18, width: '100%', marginTop: 32 }}>
        <img
          src={profile.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
          alt="Profile"
          style={{ width: 110, height: 110, borderRadius: "50%", objectFit: "cover", border: "4px solid #ffb6d5", boxShadow: "0 2px 8px #ff408133" }}
        />
        <h2 style={{ margin: 0, color: "#ff4081", fontSize: 28, textAlign: 'center' }}>{profile.name || "Your Name"}</h2>
        {profile.pronouns && <span style={{ color: "#888", fontSize: 15, textAlign: 'center' }}>{profile.pronouns}</span>}
        <div style={{ color: "#555", fontSize: 16, margin: "6px 0", textAlign: 'center' }}>{profile.college} {profile.year && <>· {profile.year}</>}</div>
        <div style={{ color: "#666", fontSize: 15, marginBottom: 6, textAlign: 'center' }}>{profile.about}</div>
        <div style={{ color: "#ff4081", fontSize: 14, textAlign: 'center' }}>{Array.isArray(profile.interests) ? profile.interests.join(", ") : profile.interests}</div>
      </div>
      {/* Separator Line */}
      <hr style={{ width: '100%', border: 'none', borderTop: '1.5px solid #ffe0ec', margin: '18px 0 18px 0' }} />
      {/* Photo Gallery */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, width: '100%', justifyContent: 'center' }}>
        <button className="auth-btn secondary" style={{ fontSize: 14, marginBottom: 0, cursor: "not-allowed", opacity: 0.6, width: '100%' }} disabled title="Photo uploads coming soon!">
          + Add Photo
        </button>
      </div>
      <div style={{ color: "#ff4081", fontSize: 14, marginBottom: 10 }}>(Photo uploads coming soon!)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, minHeight: 120, alignItems: "center", justifyItems: "center", width: '100%' }}>
        <span style={{ color: "#bbb", fontSize: 18, gridColumn: "1 / span 3" }}>No photos yet</span>
      </div>
      {/* Delete Confirmation Modal */}
      {deleteOpen && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 3000, background: 'rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 4px 24px #ff408122', padding: 32, minWidth: 280, textAlign: 'center', maxWidth: 360, width: '90%' }}>
            <div style={{ fontSize: 24, color: '#ff4081', fontWeight: 700, marginBottom: 12 }}>Delete Account?</div>
            <div style={{ color: '#888', marginBottom: 22, fontSize: 18 }}>Are you sure you want to delete your account? This action cannot be undone and will remove all your data, matches, and chats.</div>
            <button
              style={{ background: '#ff4081', color: '#fff', border: 'none', borderRadius: 16, padding: '12px 32px', fontWeight: 600, fontSize: 18, marginRight: 16, cursor: 'pointer' }}
              onClick={handleDeleteAccount}
              disabled={deleting}
            >
              Yes, Delete
            </button>
            <button
              style={{ background: '#ffe0ec', color: '#ff4081', border: 'none', borderRadius: 16, padding: '12px 32px', fontWeight: 600, fontSize: 18, marginLeft: 16, cursor: 'pointer' }}
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} profile={profile} onSave={handleEditSave} />
    </div>
  );
}

export default ProfilePage; 