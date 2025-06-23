import React, { useState } from "react";
import { auth, provider } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import "./AuthPage.css";

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/home");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      navigate("/home");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    try {
      await signInWithPopup(auth, provider);
      navigate("/home");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="cupid-logo">
          <span role="img" aria-label="heart" className="heart-icon">❤️</span>
          <span className="cupid-title">CampusCupid</span>
        </div>
        <h2 className="auth-subtitle">Find your campus match!</h2>
        <form>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="auth-input"
            disabled
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="auth-input"
            disabled
          />
          <button onClick={handleSignIn} className="auth-btn primary" disabled>
            Sign In
          </button>
          <button onClick={handleSignUp} className="auth-btn secondary" disabled>
            Sign Up
          </button>
        </form>
        <div className="divider">or</div>
        <button onClick={handleGoogleSignIn} className="auth-btn google">
          <span className="google-icon">G</span> Continue with Google
        </button>
        <div className="auth-info-message">
          “We use Google Sign-In through Firebase. We do not store or access your password — authentication is handled securely by Google, and we only receive your email and public profile information.”
        </div>
        {error && <div className="auth-error">{error}</div>}
      </div>
    </div>
  );
}

export default AuthPage; 