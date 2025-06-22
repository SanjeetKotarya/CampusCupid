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
    <div style={{ maxWidth: 430, width: '100%', margin: '0 auto', boxSizing: 'border-box', padding: '0 18px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Back Button */}
      <button onClick={() => navigate(-1)} style={{ alignSelf: 'flex-start', margin: '18px 0 0 0', background: 'none', border: 'none', color: '#ff4081', fontSize: 22, fontWeight: 700, cursor: 'pointer' }}>&larr; Back</button>
      {/* Profile Header */}
      <div style={{ display: "flex", flexDirection: 'column', alignItems: "center", gap: 18, marginBottom: 18, width: '100%', marginTop: 12 }}>
        <img
          src={profile.photoURL || "https://api.dicebear.com/7.x/person/svg?seed=CampusCupid"}
          alt="Profile"
          style={{ width: 110, height: 110, borderRadius: "50%", objectFit: "cover", border: "4px solid #ffb6d5", boxShadow: "0 2px 8px #ff408133" }}
        />
        <h2 style={{ margin: 0, color: "#ff4081", fontSize: 28, textAlign: 'center' }}>{profile.name || "Name"}</h2>
        {profile.pronouns && <span style={{ color: "#888", fontSize: 15, textAlign: 'center' }}>{profile.pronouns}</span>}
        <div style={{ color: "#555", fontSize: 16, margin: "6px 0", textAlign: 'center' }}>{profile.college} {profile.year && <>· {profile.year}</>}</div>
        <div style={{ color: "#666", fontSize: 15, marginBottom: 6, textAlign: 'center' }}>{profile.about}</div>
        <div style={{ color: "#ff4081", fontSize: 14, textAlign: 'center' }}>{Array.isArray(profile.interests) ? profile.interests.join(", ") : profile.interests}</div>
        <div style={{ color: "#888", fontSize: 14, marginTop: 8 }}>Gender: {profile.gender}</div>
      </div>
    </div>
  );
}

export default UserProfilePage; 