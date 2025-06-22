import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import logo from './logo.svg';
import './App.css';
import AuthPage from "./AuthPage";
import HomePage from "./HomePage";
import ExplorePage from "./ExplorePage";
import MessagesPage from "./MessagesPage";
import ProfilePage from "./ProfilePage";
import UserProfilePage from "./UserProfilePage";
import { Link, useLocation } from "react-router-dom";
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

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="app-mobile-frame">
      <Router>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/home" element={<Navigate to="/explore" />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:userId" element={<UserProfilePage />} />
          <Route path="*" element={<Navigate to="/auth" />} />
        </Routes>
        {/* Show bottom nav only when authenticated and not on /auth */}
        {isAuthenticated && !["/auth", "/"].includes(window.location.pathname) && <BottomNav />}
      </Router>
    </div>
  );
}

export default App;
