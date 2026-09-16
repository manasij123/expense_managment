import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

  async function handleSignIn() {
    setSigningIn(true);
    setError('');
    try {
      await login();
      navigate('/dashboard');
    } catch (err) {
      console.error('Sign-in error:', err);
      setError(err.message || 'Server authorization failed.');
      setSigningIn(false);
    }
  }

  return (
    <div className="font-sans login-bg bg-slate-100 bg-cover bg-center bg-no-repeat bg-fixed min-h-screen w-full">
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-transparent backdrop-blur-sm p-8 rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.15)] border border-white/10 dark:border-slate-800/30">
          {!signingIn ? (
            <div className="w-full text-center">
              <div className="w-32 h-24 mx-auto mb-6 bg-slate-900 rounded-2xl flex items-center justify-center shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] border border-slate-700/50">
                <svg className="w-24 h-auto" viewBox="0 0 10838 6221" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5338.5 103.799L5581 842.8V1925.3L5499 1953.8C4218 -256.205 1975 509.795 1564.5 2344.8H5141L4901 2899.8H1506.5C1493.48 3060.46 1494.38 3153.81 1506.5 3314.8H5099.5L4889.5 3875.3H1609.5C2175.5 5900.79 4405 6094.56 5489 4550.3L5579.5 4611.3V5381.8C4020 6939.29 1289.5 6264.29 757.5 3875.3H4L199 3319.8H680.5C670.018 3155.39 668.151 3063.64 672 2899.8H0L196.5 2345.3H741C1155.5 355.301 3118 -558.205 4825.5 355.3L4984.5 103.799H5338.5Z" fill="#6155F5"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M7460.82 2358.29H9004.18L9848.68 484.795H10837.5V5571.29H10064.5V1640.7L9519.83 2894.79H6369.5V3315.79H9314.28L8531.46 5046L8531.32 5046.29H7892.68L7357.18 3883.29H6369.5V5571.29H5586V3883.29H4885.78L5095.53 3316.12L5095.65 3315.79H5586V2894.79H4902.24L5133.04 2358.6L5133.17 2358.29H5586V484.795H6595.82L7460.82 2358.29ZM8133.74 3869.79L8224 4081.06L8314.76 3869.79H8133.74ZM6355 1675.29V2350.79H6665.78L6355.95 1675.09L6355 1675.29Z" fill="#34C759"/>
                </svg>
              </div>

              <div className="bg-white/20 dark:bg-slate-900/30 backdrop-blur-md rounded-2xl py-3 px-2 mb-8 border border-white/30 dark:border-slate-700/50 shadow-[inset_0_1px_4px_rgba(255,255,255,0.4)] dark:shadow-none">
                <h1 className="text-2xl font-extrabold text-slate-800/80 drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)] dark:text-white/90 dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] tracking-tight mb-1">Expense Management</h1>
                <p className="text-slate-600/80 font-medium tracking-wide drop-shadow-[0_1px_1px_rgba(255,255,255,0.6)] dark:text-white/60">Sign in to continue</p>
              </div>

              <button
                onClick={handleSignIn}
                className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold py-3 rounded-lg flex items-center justify-center shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition disabled:opacity-50"
              >
                <svg className="w-6 h-6 mr-3" xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
                Sign in with Google
              </button>

              {error && <p className="text-rose-500 text-sm mt-4">{error}</p>}
            </div>
          ) : (
            <div className="w-full text-center">
              <lottie-player src="/static/animations/sign-in.json" background="transparent" speed="1.5" style={{ width: '300px', height: '300px', margin: 'auto' }} loop autoplay></lottie-player>
              <p className="text-slate-500 dark:text-slate-400 mt-4 font-semibold animate-pulse">Signing in...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
