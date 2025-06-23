import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

function UserProfilePage() {
  const { userId } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchProfile() {
      const docRef = doc(db, "users", userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setProfile(docSnap.data());
      }
      setLoading(false);
    }
    fetchProfile();
  }, [userId]);

  if (loading) return <div style={{ padding: 32, textAlign: "center" }}>Loading...</div>;
  if (!profile) return <div style={{ padding: 32, textAlign: "center" }}>User not found.</div>;

  return (
    <div style={{ maxWidth: 430, width: '100%', margin: '0 auto', boxSizing: 'border-box', padding: '0 18px 80px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Back Button */}
      <button 
        onClick={() => navigate(-1)} 
        style={{ 
          alignSelf: 'flex-start', 
          margin: '18px 0 0 0', 
          background: 'none', 
          border: 'none', 
          color: '#ff4081', 
          fontSize: 18, 
          fontWeight: 500, 
          cursor: 'pointer', 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: 6
        }}
        aria-label="Back"
      >
        <span style={{ fontSize: 22, lineHeight: 1, verticalAlign: 'middle', display: 'inline-block' }}>&larr;</span>
        <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: 0.2, lineHeight: 1, verticalAlign: 'middle', display: 'inline-block' }}>Back</span>
      </button>
      {/* Profile Header */}
      <div style={{ display: "flex", flexDirection: 'column', alignItems: "center", gap: 18, marginBottom: 18, width: '100%', marginTop: 32 }}>
        <img
          src={profile.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
          alt="Profile"
          style={{ width: 110, height: 110, borderRadius: "50%", objectFit: "cover", border: "4px solid #ffb6d5", boxShadow: "0 2px 8px #ff408133" }}
          onError={e => { e.target.onerror = null; e.target.src = "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"; }}
        />
        <h2 style={{ margin: 0, color: "#ff4081", fontSize: 28, textAlign: 'center' }}>{profile.name || "Name"}</h2>
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
          {(profile.gallery && profile.gallery.length > 0) ? profile.gallery.map((url, idx) => (
            <div key={url} style={{ position: 'relative', width: '100%' }}>
              <img src={url} alt={`Gallery ${idx+1}`} style={{ width: '100%', height: 'auto', objectFit: 'cover', borderRadius: 12, border: '2px solid #ffb6d5', boxShadow: '0 2px 8px #ff408133', display: 'block' }} />
            </div>
          )) : <span style={{ color: "#bbb", fontSize: 18, gridColumn: "1 / span 1" }}>No photos yet</span>}
        </div>
      </div>
    </div>
  );
}

export default UserProfilePage; 