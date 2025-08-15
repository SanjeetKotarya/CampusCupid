import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, updateDoc, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { FaBars } from "react-icons/fa";
// Storage is disabled for now; rely on direct image URLs only
import LoadingSpinner from "./components/LoadingSpinner";
import { clearAllCache } from "./utils/cacheManager";

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
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: 12, position: 'relative', minHeight: 36 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 26, color: '#ff4081', cursor: 'pointer', marginRight: 8, padding: 0, lineHeight: 1, position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)' }} aria-label="Back">
            <span style={{ display: 'inline-block', fontWeight: 700 }}>&#8592;</span>
          </button>
          <span style={{ color: "#ff4081", fontWeight: 700, fontSize: 20, margin: '0 auto', textAlign: 'center', width: '100%' }}>Edit Profile</span>
        </div>
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div style={{ position: 'relative', marginBottom: 8, marginTop: 8 }}>
              <img
                src={form.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
                alt="Profile"
                style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid #ffb6d5", boxShadow: '0 2px 8px #ff408133' }}
                onError={e => { e.target.onerror = null; e.target.src = "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"; }}
              />
            </div>
            <input name="name" value={form.name} onChange={handleChange} placeholder="Name" className="auth-input" required style={{ width: '100%', maxWidth: 340 }} />
            <input name="pronouns" value={form.pronouns || ""} onChange={handleChange} placeholder="Pronouns (e.g. she/her)" className="auth-input" style={{ width: '100%', maxWidth: 340 }} />
            <input name="college" value={form.college} onChange={handleChange} placeholder="College/University" className="auth-input" required style={{ width: '100%', maxWidth: 340 }} />
            <input name="department" value={form.department || ""} onChange={handleChange} placeholder="Department" className="auth-input" required style={{ width: '100%', maxWidth: 340 }} />
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
            <input name="photoURL" value={form.photoURL || ""} onChange={handleChange} placeholder="Profile photo URL (https://...)" className="auth-input" style={{ width: '100%', maxWidth: 340 }} />
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
    department: "",
    year: "",
    about: "",
    gender: "",
    interests: "",
    photoURL: "",
    gallery: []
  });
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [galleryError, setGalleryError] = useState("");
  const [galleryConfirmOpen, setGalleryConfirmOpen] = useState(false);
  const [galleryToDelete, setGalleryToDelete] = useState(null);
  const [galleryLoading, setGalleryLoading] = useState({});
  const [loggingOut, setLoggingOut] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);
  const [addStatus, setAddStatus] = useState("idle"); // idle | posting | posted | invalid
  const navigate = useNavigate();

  useEffect(() => {
    // Load cached profile first
    const cached = localStorage.getItem('profile_page_profile');
    if (cached) {
      try {
        setProfile(JSON.parse(cached));
        setLoading(false);
      } catch {}
    }
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
          localStorage.setItem('profile_page_profile', JSON.stringify({ ...profile, ...docSnap.data() }));
        } else {
          setProfile((p) => ({ ...p, name: currentUser.displayName || "", photoURL: currentUser.photoURL || "" }));
          localStorage.setItem('profile_page_profile', JSON.stringify({ ...profile, name: currentUser.displayName || "", photoURL: currentUser.photoURL || "" }));
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
        department: form.department || "",
        interests: typeof form.interests === "string"
          ? form.interests.split(",").map((i) => i.trim()).filter(Boolean)
          : Array.isArray(form.interests) ? form.interests : [],
      });
      const newProfile = {
        ...profile,
        ...form,
        department: form.department || "",
        interests: typeof form.interests === "string"
          ? form.interests.split(",").map((i) => i.trim()).filter(Boolean)
          : Array.isArray(form.interests) ? form.interests : [],
      };
      setProfile(newProfile);
      localStorage.setItem('profile_page_profile', JSON.stringify(newProfile));
      setEditOpen(false);
    } catch (err) {
      setError("Failed to save profile. " + err.message);
    }
  };

  const handleSignOut = async () => {
    setLoggingOut(true);
    clearAllCache();
    await signOut(auth);
    setLoggingOut(false);
    navigate("/auth");
  };

  // Delete Account Handler
  const handleDeleteAccount = async () => {
    setError("");
    setDeleting(true);
    try {
      // 1. Delete all matches and related chats/likes
      const matchesQuery = query(collection(db, "matches"), where("users", "array-contains", user.uid));
      const matchesSnapshot = await getDocs(matchesQuery);
      const myMatches = matchesSnapshot.docs;
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
      // 5. Clear cache, sign out and redirect
      clearAllCache();
      await signOut(auth);
      navigate("/auth");
    } catch (err) {
      setError("Failed to delete account. " + err.message);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const [newGalleryUrl, setNewGalleryUrl] = useState("");
  const handleAddGalleryUrl = async () => {
    if (!user || !newGalleryUrl.trim()) return false;
    if ((profile.gallery?.length || 0) >= 3) {
      setGalleryError("You can only add up to 3 gallery images.");
      return false;
    }
    try {
      const newGallery = [...(profile.gallery || []), newGalleryUrl.trim()].slice(0, 3);
      await updateDoc(doc(db, "users", user.uid), { gallery: newGallery });
      setProfile(p => ({ ...p, gallery: newGallery }));
      setNewGalleryUrl("");
      setGalleryError("");
      return true;
    } catch (err) {
      setGalleryError("Failed to add image URL: " + err.message);
      return false;
    }
  };

  // Validate image URL by attempting to load it
  const validateImageUrl = (url, timeoutMs = 8000) => {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        const timer = setTimeout(() => { img.src = ""; resolve(false); }, timeoutMs);
        img.onload = () => { clearTimeout(timer); resolve(true); };
        img.onerror = () => { clearTimeout(timer); resolve(false); };
        img.src = url;
      } catch {
        resolve(false);
      }
    });
  };

  const handleAddButtonClick = async () => {
    if ((profile.gallery?.length || 0) >= 3) {
      setGalleryError("You can only add up to 3 gallery images.");
      return;
    }
    // First click -> reveal input
    if (!showAddInput) {
      setShowAddInput(true);
      setAddStatus("idle");
      return;
    }
    // Second click -> try to post
    const url = newGalleryUrl.trim();
    if (!url) {
      setAddStatus("invalid");
      setGalleryError("Please paste an image URL.");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setAddStatus("invalid");
      setGalleryError("URL must start with http:// or https://");
      return;
    }
    setGalleryError("");
    setAddStatus("posting");
    const ok = await validateImageUrl(url);
    if (!ok) {
      setAddStatus("invalid");
      setGalleryError("Invalid image link or the host blocked loading.");
      return;
    }
    const saved = await handleAddGalleryUrl();
    if (saved) {
      setAddStatus("posted");
      setShowAddInput(false);
      setTimeout(() => setAddStatus("idle"), 1200);
    } else {
      setAddStatus("invalid");
    }
  };

  const handleDeleteGalleryImage = async (url) => {
    if (!user) return;
    setGalleryError("");
    try {
      const newGallery = (profile.gallery || []).filter(u => u !== url);
      await updateDoc(doc(db, "users", user.uid), { gallery: newGallery });
      setProfile(p => ({ ...p, gallery: newGallery }));
    } catch (err) {
      setGalleryError("Failed to delete image: " + err.message);
    }
  };

  if (loading || loggingOut) return <LoadingSpinner fullScreen text="Loading..." />;

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
        <>
          {/* Overlay to close menu on outside click */}
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 19,
              background: 'transparent',
            }}
          />
          <div style={{
            position: 'absolute',
            top: 54,
            right: 18,
            background: '#fff',
            borderRadius: 18,
            boxShadow: '0 4px 24px #ff408122',
            minWidth: 220,
            minHeight: 160,
            zIndex: 20,
            padding: '16px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            width: 240,
          }}>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: '#ff4081',
                fontWeight: 600,
                fontSize: 18,
                padding: '16px 28px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 0.18s',
              }}
              onMouseOver={e => e.currentTarget.style.background = '#ffe0ec'}
              onMouseOut={e => e.currentTarget.style.background = 'none'}
              onClick={() => { setEditOpen(true); setMenuOpen(false); }}
            >
              Edit Profile
            </button>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: '#ff4081',
                fontWeight: 600,
                fontSize: 18,
                padding: '16px 28px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 0.18s',
              }}
              onMouseOver={e => e.currentTarget.style.background = '#ffe0ec'}
              onMouseOut={e => e.currentTarget.style.background = 'none'}
              onClick={() => { handleSignOut(); setMenuOpen(false); }}
            >
              Logout
            </button>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: '#d32f2f',
                fontWeight: 600,
                fontSize: 18,
                padding: '16px 28px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 0.18s',
              }}
              onMouseOver={e => e.currentTarget.style.background = '#ffe0ec'}
              onMouseOut={e => e.currentTarget.style.background = 'none'}
              onClick={() => { setDeleteOpen(true); setMenuOpen(false); }}
              disabled={deleting}
            >
              Delete Account
            </button>
          </div>
        </>
      )}
      {/* Profile Header */}
      <div style={{ display: "flex", flexDirection: 'column', alignItems: "center", gap: 18, marginBottom: 18, width: '100%', marginTop: 32 }}>
        <img
          src={profile.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
          alt="Profile"
          style={{ width: 110, height: 110, borderRadius: "50%", objectFit: "cover", border: "4px solid #ffb6d5", boxShadow: "0 2px 8px #ff408133" }}
          onError={e => { e.target.onerror = null; e.target.src = "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"; }}
        />
        <h2 style={{ margin: 0, color: "#ff4081", fontSize: 28, textAlign: 'center' }}>{profile.name || "Your Name"}</h2>
        {profile.pronouns && <span style={{ color: "#888", fontSize: 15, textAlign: 'center' }}>{profile.pronouns}</span>}
        <div style={{ color: "#555", fontSize: 16, margin: "6px 0", textAlign: 'center' }}>{profile.college}{profile.department && <> · {profile.department}</>}{profile.year && <> · {profile.year}</>}</div>
        <div style={{ color: "#666", fontSize: 15, marginBottom: 6, textAlign: 'center' }}>{profile.about}</div>
        <div style={{ color: "#ff4081", fontSize: 14, textAlign: 'center' }}>{Array.isArray(profile.interests) ? profile.interests.join(", ") : profile.interests}</div>
      </div>
      {/* Separator Line */}
      <hr style={{ width: '100%', border: 'none', borderTop: '1.5px solid #ffe0ec', margin: '18px 0 18px 0' }} />
      {/* Photo Gallery */}
      <div style={{ width: '100%', marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, alignItems: "center", justifyItems: "center", width: '100%' }}>
          {(profile.gallery && profile.gallery.length > 0) ? profile.gallery.map((url, idx) => {
            const isLoading = galleryLoading[url] !== false;
            return (
              <div 
                key={url} 
                style={{ 
                  position: 'relative', 
                  width: '100%', 
                  overflow: 'hidden', 
                  borderRadius: 12, 
                  minHeight: isLoading ? 180 : undefined, 
                  background: isLoading ? '#fff' : undefined
                }}
              >
                {isLoading && (
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.7)', zIndex: 1, borderRadius: 12 }}>
                    <div className="gallery-spinner" style={{ width: 36, height: 36, border: '4px solid #ffe0ec', borderTop: '4px solid #ff4081', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  </div>
                )}
                <img 
                  src={url} 
                  alt={`Gallery ${idx+1}`} 
                  style={{ width: '100%', height: 'auto', objectFit: 'cover', borderRadius: 12, border: '2px solid #ffb6d5', boxShadow: '0 2px 8px #ff408133', display: 'block' }} 
                  loading="lazy"
                  onLoad={() => setGalleryLoading(l => ({ ...l, [url]: false }))}
                  onError={() => setGalleryLoading(l => ({ ...l, [url]: false }))}
                />
                <button onClick={() => { setGalleryToDelete(url); setGalleryConfirmOpen(true); }} 
                  style={{ 
                    position: 'absolute', 
                    top: 10, 
                    right: 10, 
                    background: '#fff', 
                    border: '1.5px solid #ffb6d5', 
                    borderRadius: '50%', 
                    color: '#ff4081', 
                    fontWeight: 700, 
                    fontSize: 16, 
                    cursor: 'pointer', 
                    padding: 0, 
                    width: 28, 
                    height: 28, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    boxShadow: '0 2px 6px #ff408122', 
                    transition: 'background 0.15s, color 0.15s',
                    zIndex: 2
                  }} 
                  title="Remove image"
                  aria-label="Remove image"
                >
                  <span style={{fontSize: 18, fontWeight: 700, lineHeight: 1, display: 'block', marginTop: 1}}>×</span>
                </button>
              </div>
            );
          }) : <span style={{ color: "#bbb", fontSize: 18, gridColumn: "1 / span 1" }}>No photos yet</span>}
        </div>
      </div>
      {galleryError && <div style={{ color: '#d32f2f', fontSize: 14, marginBottom: 6 }}>{galleryError}</div>}
      {/* Add Gallery URL */}
      {showAddInput && (
        <>
          <input
            type="url"
            placeholder="Paste image URL (https://...)"
            className="auth-input"
            value={newGalleryUrl}
            onChange={e => { setNewGalleryUrl(e.target.value); setAddStatus("idle"); }}
            style={{ width: '100%', marginTop: 8 }}
          />
          {addStatus === 'invalid' && (
            <div style={{ color: '#d32f2f', fontSize: 13, marginTop: 6 }}>Invalid image link</div>
          )}
        </>
      )}
      <div style={{ display: 'flex', width: '100%', marginTop: 8 }}>
        <button
          className="auth-btn secondary"
          style={{ width: '100%' }}
          onClick={handleAddButtonClick}
          disabled={addStatus === 'posting' || (profile.gallery?.length || 0) >= 3}
        >
          {addStatus === 'posted' ? 'Posted' : showAddInput ? (addStatus === 'posting' ? 'Posting...' : 'Post') : 'Add'}
        </button>
      </div>
      {/* Gallery Delete Confirmation Modal */}
      {galleryConfirmOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.85)' }}>
          <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 4px 32px #ff408144', padding: 28, minWidth: 260, textAlign: 'center', maxWidth: 340, width: '90%' }}>
            <div style={{ fontSize: 20, color: '#ff4081', fontWeight: 700, marginBottom: 10 }}>Delete Image?</div>
            <div style={{ color: '#888', marginBottom: 18, fontSize: 16 }}>Are you sure you want to delete this image from your gallery?</div>
            <button
              style={{ background: '#ff4081', color: '#fff', border: 'none', borderRadius: 16, padding: '10px 28px', fontWeight: 600, fontSize: 16, marginRight: 10, cursor: 'pointer' }}
              onClick={async () => {
                setGalleryConfirmOpen(false);
                if (galleryToDelete) await handleDeleteGalleryImage(galleryToDelete);
                setGalleryToDelete(null);
              }}
            >
              Yes, Delete
            </button>
            <button
              style={{ background: '#ffe0ec', color: '#ff4081', border: 'none', borderRadius: 16, padding: '10px 28px', fontWeight: 600, fontSize: 16, marginLeft: 10, cursor: 'pointer' }}
              onClick={() => { setGalleryConfirmOpen(false); setGalleryToDelete(null); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteOpen && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 4px 32px #ff408144', padding: 32, minWidth: 280, textAlign: 'center', maxWidth: 360, width: '90%', pointerEvents: 'auto' }}>
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