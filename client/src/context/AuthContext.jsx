import { createContext, useContext, useEffect, useState } from 'react';
import { watchAuthState, signInWithGoogle, signOut as firebaseSignOut } from '../firebase';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Firestore user doc: {id, name, email, profile_pic}
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      // Ask the Flask session (the __session cookie) who's logged in — this
      // is the source of truth, not Firebase's client-side auth state alone,
      // since /authorize is what actually creates the Flask-Login session.
      try {
        setUser(await api.get('/api/me'));
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    init();

    // Keep Firebase's own auth state in sync too (needed so a stale Google popup
    // session doesn't silently disagree with the Flask session).
    const unsubscribe = watchAuthState((firebaseUser) => {
      if (!firebaseUser) setUser((prev) => prev); // no-op; /authorize/logout drive real state
    });
    return unsubscribe;
  }, []);

  async function login() {
    const idToken = await signInWithGoogle();
    await api.post('/authorize', { token: idToken });
    const me = await api.get('/api/me');
    setUser(me);
    return me;
  }

  async function logout() {
    await firebaseSignOut();
    await fetch('/logout', { credentials: 'include' });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
