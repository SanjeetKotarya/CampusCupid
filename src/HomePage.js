import React, { useEffect, useState } from "react";
import { auth } from "./firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "./components/LoadingSpinner";
import { clearAllCache } from "./utils/cacheManager";

function HomePage() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        navigate("/auth");
      } else {
        setUser(currentUser);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    setLoggingOut(true);
    clearAllCache();
    await signOut(auth);
    setLoggingOut(false);
    navigate("/auth");
  };

  if (!user || loggingOut) return <LoadingSpinner fullScreen text="Loading..." />;

  return (
    <div style={{ maxWidth: 400, margin: "auto", padding: 20 }}>
      <h2>Welcome, {user.email}</h2>
      <button onClick={handleSignOut} style={{ width: "100%", marginTop: 16 }}>
        Sign Out
      </button>
    </div>
  );
}

export default HomePage; 