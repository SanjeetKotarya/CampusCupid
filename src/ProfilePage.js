import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, updateDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { FaBars } from "react-icons/fa";
import { storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable } from "firebase/storage";
import LoadingSpinner from "./components/LoadingSpinner";
import { clearAllCache } from "./utils/cacheManager";

const years = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Other"];
const genders = ["Male", "Female", "Other"];

function EditProfileModal({ open, onClose, profile, onSave, onProfilePicUpload, userUid }) {
  const [form, setForm] = useState(profile);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  useEffect(() => { setForm(profile); }, [profile]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };
  const handleProfilePicChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !userUid) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const fileRef = ref(storage, `profile_pics/${userUid}`);
      const uploadTask = uploadBytesResumable(fileRef, file);
      uploadTask.on('state_changed', (snapshot) => {
        setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      });
      await uploadTask;
      const url = await getDownloadURL(fileRef);
      setForm(f => ({ ...f, photoURL: url }));
      if (onProfilePicUpload) onProfilePicUpload(url);
    } catch (err) {
      alert("Failed to upload profile picture: " + err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
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
              <label htmlFor="profile-pic-upload" style={{ position: 'absolute', bottom: 0, right: 0, background: '#ff4081', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid #fff', boxShadow: '0 1px 4px #ff408133' }} title="Change profile picture">
                <span style={{ fontSize: 18, fontWeight: 700 }}>+</span>
                <input id="profile-pic-upload" type="file" accept="image/*" onChange={handleProfilePicChange} disabled={uploading} style={{ display: 'none' }} />
              </label>
            </div>
            {uploading && (
              <div style={{ width: '100%', maxWidth: 120, marginBottom: 8 }}>
                <div style={{ height: 6, background: '#ffe0ec', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: 6, background: '#ff4081', borderRadius: 4, transition: 'width 0.2s' }} />
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2, textAlign: 'center' }}>{uploadProgress}%</div>
              </div>
            )}
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
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryError, setGalleryError] = useState("");
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryConfirmOpen, setGalleryConfirmOpen] = useState(false);
  const [galleryToDelete, setGalleryToDelete] = useState(null);
  const [galleryLoading, setGalleryLoading] = useState({});
  const [loggingOut, setLoggingOut] = useState(false);
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

  const handleProfilePicUpload = async (url) => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid), { photoURL: url });
    setProfile(p => ({ ...p, photoURL: url }));
  };

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!user || !files.length) return;
    if ((profile.gallery?.length || 0) + files.length > 3) {
      setGalleryError("You can only upload up to 3 gallery images.");
      return;
    }
    setGalleryUploading(true);
    setGalleryError("");
    setGalleryProgress(0);
    try {
      const uploadedUrls = [];
      let uploadedCount = 0;
      for (const file of files) {
        const fileRef = ref(storage, `gallery/${user.uid}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(fileRef, file);
        uploadTask.on('state_changed', (snapshot) => {
          setGalleryProgress(Math.round((uploadedCount * 100 + (snapshot.bytesTransferred / snapshot.totalBytes) * 100) / files.length));
        });
        await uploadTask;
        const url = await getDownloadURL(fileRef);
        uploadedUrls.push(url);
        uploadedCount++;
        setGalleryProgress(Math.round((uploadedCount / files.length) * 100));
      }
      const newGallery = [...(profile.gallery || []), ...uploadedUrls].slice(0, 3);
      await updateDoc(doc(db, "users", user.uid), { gallery: newGallery });
      setProfile(p => ({ ...p, gallery: newGallery }));
    } catch (err) {
      setGalleryError("Failed to upload gallery images: " + err.message);
    } finally {
      setGalleryUploading(false);
      setGalleryProgress(0);
    }
  };

  const handleDeleteGalleryImage = async (url) => {
    if (!user) return;
    setGalleryUploading(true);
    setGalleryError("");
    try {
      // Remove from storage
      const fileRef = ref(storage, url);
      await deleteObject(fileRef).catch(() => {}); // ignore if not found
      // Remove from Firestore
      const newGallery = (profile.gallery || []).filter(u => u !== url);
      await updateDoc(doc(db, "users", user.uid), { gallery: newGallery });
      setProfile(p => ({ ...p, gallery: newGallery }));
    } catch (err) {
      setGalleryError("Failed to delete image: " + err.message);
    } finally {
      setGalleryUploading(false);
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
        <label htmlFor="gallery-upload" className="auth-btn secondary" style={{ fontSize: 14, marginTop: 16, cursor: galleryUploading || (profile.gallery?.length || 0) >= 3 ? 'not-allowed' : 'pointer', opacity: galleryUploading || (profile.gallery?.length || 0) >= 3 ? 0.6 : 1, width: '100%', textAlign: 'center', borderRadius: 16, background: '#ffe0ec', color: '#ff4081', border: 'none', padding: '10px 0', display: 'block' }}>
          + Add Photo
          <input
            id="gallery-upload"
            type="file"
            accept="image/*"
            multiple
            disabled={galleryUploading || (profile.gallery?.length || 0) >= 3}
            onChange={handleGalleryUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>
      {galleryUploading && (
        <div style={{ width: '100%', maxWidth: 180, margin: '8px auto' }}>
          <div style={{ height: 6, background: '#ffe0ec', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${galleryProgress}%`, height: 6, background: '#ff4081', borderRadius: 4, transition: 'width 0.2s' }} />
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2, textAlign: 'center' }}>{galleryProgress}%</div>
        </div>
      )}
      {galleryError && <div style={{ color: '#d32f2f', fontSize: 14, marginBottom: 6 }}>{galleryError}</div>}
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
      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} profile={profile} onSave={handleEditSave} onProfilePicUpload={handleProfilePicUpload} userUid={user ? user.uid : null} />
    </div>
  );
}

export default ProfilePage; 