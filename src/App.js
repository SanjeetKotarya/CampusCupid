import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './App.css';
import AuthPage from "./AuthPage";
import HomePage from "./HomePage";
import ExplorePage from "./ExplorePage";
import MessagesPage from "./MessagesPage";
import ProfilePage from "./ProfilePage";
import UserProfilePage from "./UserProfilePage";
import { Link } from "react-router-dom";
import { auth } from "./firebase";

function BottomNav() {
  const location = useLocation();
  const navItems = [
    { to: "/explore", icon: "❤️", key: "explore" },
    { to: "/messages", icon: "💬", key: "messages" },
    { to: "/profile", icon: "👤", key: "profile" },
  ];
  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          className={location.pathname === item.to ? "active" : ""}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            fontSize: 28,
            color: location.pathname === item.to ? '#ff4081' : '#aaa',
            textDecoration: 'none',
            position: 'relative',
          }}
        >
          <span>{item.icon}</span>
          {location.pathname === item.to && (
            <span style={{
              display: 'block',
              width: 28,
              height: 4,
              background: '#ff4081',
              borderRadius: 2,
              marginTop: 2,
            }} />
          )}
        </Link>
      ))}
    </nav>
  );
}

function AppContent() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authChecked, setAuthChecked] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const location = useLocation();

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            setIsAuthenticated(!!user);
            setCurrentUser(user);
            setAuthChecked(true);
        });
        return () => unsubscribe();
    }, []);

    if (!authChecked) {
        return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>Loading...</div>;
    }

    const showNav = isAuthenticated && !['/auth', '/'].includes(location.pathname);

    return (
        <>
            <Routes>
                <Route path="/auth" element={isAuthenticated ? <Navigate to="/explore" /> : <AuthPage />} />
                <Route path="/explore" element={isAuthenticated ? <ExplorePage /> : <Navigate to="/auth" />} />
                <Route path="/messages" element={isAuthenticated ? <MessagesPage currentUser={currentUser} /> : <Navigate to="/auth" />} />
                <Route path="/profile" element={isAuthenticated ? <ProfilePage /> : <Navigate to="/auth" />} />
                <Route path="/profile/:userId" element={isAuthenticated ? <UserProfilePage /> : <Navigate to="/auth" />} />
                <Route path="*" element={<Navigate to={isAuthenticated ? "/explore" : "/auth"} />} />
            </Routes>
            {showNav && <BottomNav />}
        </>
    );
}

function App() {
  return (
    <div className="app-mobile-frame">
      <Router>
        <AppContent />
      </Router>
    </div>
  );
}

export default App;
