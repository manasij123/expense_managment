import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle, LogOut, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

function useLiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    let frame;
    const tick = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const seconds = now.getSeconds().toString().padStart(2, '0');
      const ms = now.getMilliseconds().toString().padStart(3, '0');
      const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
      hours = hours % 12 || 12;
      setTime(`${hours.toString().padStart(2, '0')}:${minutes}:${seconds}:${ms} ${ampm}`);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);
  return time;
}

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

export default function Header({ headerContent, showDueAlert = false }) {
  const { user, logout } = useAuth();
  const clock = useLiveClock();
  const [theme, toggleTheme] = useTheme();
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dues, setDues] = useState([]);
  const notifyRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    api.get('/api/unpaid_dues').then(setDues).catch(() => setDues([]));
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (notifyRef.current && !notifyRef.current.contains(e.target)) setNotifyOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <>
      <header className="glass-header sticky top-0 z-30 px-4 sm:px-6 py-3 flex justify-between items-center">
        <div className="flex items-center">
          {headerContent || (
            <h1 className="font-bold text-lg sm:text-xl tracking-tight text-slate-700 flex items-center">
              <svg className="w-8 h-8 mr-2" viewBox="0 0 10838 6221" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5338.5 103.799L5581 842.8V1925.3L5499 1953.8C4218 -256.205 1975 509.795 1564.5 2344.8H5141L4901 2899.8H1506.5C1493.48 3060.46 1494.38 3153.81 1506.5 3314.8H5099.5L4889.5 3875.3H1609.5C2175.5 5900.79 4405 6094.56 5489 4550.3L5579.5 4611.3V5381.8C4020 6939.29 1289.5 6264.29 757.5 3875.3H4L199 3319.8H680.5C670.018 3155.39 668.151 3063.64 672 2899.8H0L196.5 2345.3H741C1155.5 355.301 3118 -558.205 4825.5 355.3L4984.5 103.799H5338.5Z" fill="#6155F5"/>
                <path fillRule="evenodd" clipRule="evenodd" d="M7460.82 2358.29H9004.18L9848.68 484.795H10837.5V5571.29H10064.5V1640.7L9519.83 2894.79H6369.5V3315.79H9314.28L8531.46 5046L8531.32 5046.29H7892.68L7357.18 3883.29H6369.5V5571.29H5586V3883.29H4885.78L5095.53 3316.12L5095.65 3315.79H5586V2894.79H4902.24L5133.04 2358.6L5133.17 2358.29H5586V484.795H6595.82L7460.82 2358.29ZM8133.74 3869.79L8224 4081.06L8314.76 3869.79H8133.74ZM6355 1675.29V2350.79H6665.78L6355.95 1675.09L6355 1675.29Z" fill="#34C759"/>
              </svg>
              EXPENSE MANAGEMENT
            </h1>
          )}
        </div>
        <div className="flex items-center justify-end flex-wrap gap-x-4 gap-y-2">
          <div className="flex flex-col items-end">
            <div className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
              {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <div className="text-xs font-mono text-slate-500 mt-1">{clock}</div>
          </div>
          <button onClick={toggleTheme} className="w-10 h-10 rounded-full text-slate-500 hover:bg-black/5 flex items-center justify-center transition">
            {theme === 'dark' ? (
              <i className="fa-regular fa-sun fa-spin fa-spin-reverse text-2xl" style={{ color: 'rgb(86, 21, 234)' }}></i>
            ) : (
              <i className="fa-regular fa-moon fa-fade text-2xl" style={{ color: 'rgb(86, 21, 234)' }}></i>
            )}
          </button>

          {user && (
            <>
              <div className="relative" ref={notifyRef}>
                <button onClick={() => setNotifyOpen((v) => !v)} className="w-10 h-10 rounded-full text-slate-500 hover:bg-black/5 flex items-center justify-center transition relative">
                  <Bell className="w-5 h-5" />
                  {dues.length > 0 && (
                    <span className="absolute top-2 right-2 w-3.5 h-3.5 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{dues.length}</span>
                  )}
                </button>
                {notifyOpen && (
                  <div className="absolute right-0 mt-3 w-72 z-50 bg-white shadow-xl border border-slate-200 dark:bg-slate-800 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="p-3 border-b border-slate-200/50 bg-slate-50 dark:bg-slate-800 flex justify-between items-center">
                      <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200">Pending Dues</h3>
                      <span className="text-[10px] bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{dues.length} Unpaid</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-2">
                      {dues.length === 0 ? (
                        <div className="p-5 text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle className="w-6 h-6 mx-auto mb-2 opacity-50" />No pending dues. You're all caught up!
                        </div>
                      ) : dues.map((due) => (
                        <div key={due.id} className="mb-2 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-100 dark:border-rose-800/50">
                          <p className="text-xs font-bold text-rose-600 dark:text-rose-400">Unpaid Bill: {due.month_name} {due.year}</p>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-sm font-black text-slate-700 dark:text-slate-200">₹{due.total}</span>
                            <Link to="/history" className="text-[10px] bg-rose-500 text-white px-2.5 py-1.5 rounded-md hover:bg-rose-600 font-bold transition shadow-sm">Pay Now</Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="user-profile" ref={profileRef}>
                <img onClick={() => setProfileOpen((v) => !v)} src={user.profile_pic} alt="User Profile" className="user-profile-img" />
                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-40 backdrop-blur-md bg-slate-900/10" onClick={() => setProfileOpen(false)}></div>
                    <div className="absolute right-0 mt-3 w-64 z-50 bg-white shadow-xl border border-slate-200 dark:bg-slate-800 dark:border-slate-700 rounded-xl overflow-hidden">
                      <div className="p-4 border-b border-slate-200/50">
                        <p className="font-bold text-sm text-slate-700 dark:text-slate-200">{user.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                      </div>
                      <div className="p-2">
                        <button onClick={logout} className="flex items-center w-full px-3 py-2.5 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition">
                          <LogOut className="w-4 h-4 mr-2" /> Logout
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {showDueAlert && dues.length > 0 && (
        <div className="fixed top-20 right-4 sm:right-6 z-99">
          <Link to="/history" className="bg-rose-600 text-white px-3 py-2.5 rounded-xl border border-rose-400 font-['Montserrat'] uppercase tracking-wider text-[9px] sm:text-[10px] font-bold max-w-55 flex items-center gap-2 animate-glowing-pulse shadow-lg">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="leading-tight">
              {dues.length === 1 ? 'THIS MONTH HAD DUE, PLEASE MAKE SURE TO CLEAR IT.' : 'THESE MONTHS HAD DUES, PLEASE MAKE SURE TO CLEAR IT.'}
            </span>
          </Link>
        </div>
      )}
    </>
  );
}
