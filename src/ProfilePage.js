import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

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

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 430, width: '100%', margin: '0 auto', boxSizing: 'border-box', padding: '0 18px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
      {/* Buttons Row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 18, width: '100%' }}>
        <button className="auth-btn secondary" style={{ fontSize: 13, padding: "0.3rem 1.1rem", minWidth: 90, flex: 1 }} onClick={() => setEditOpen(true)}>Edit</button>
        <button onClick={handleSignOut} className="auth-btn secondary" style={{ fontSize: 13, padding: "0.3rem 1.1rem", minWidth: 90, flex: 1 }}>Logout</button>
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
      {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} profile={profile} onSave={handleEditSave} />
    </div>
  );
}

export default ProfilePage; 