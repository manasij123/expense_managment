import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building, Newspaper, Flame, X } from 'lucide-react';
import Layout from '../components/Layout';
import { requestNotificationToken, watchForegroundMessages } from '../firebase';
import { api } from '../api';

function playAlarmSound() {
  const currentSound = localStorage.getItem('preferredAlarmSound') || 'default.mp3';
  const audio = new Audio('/static/sounds/' + currentSound);
  let playCount = 0;
  audio.addEventListener('ended', () => {
    playCount++;
    if (playCount < 5) audio.play();
  });
  audio.play().catch((err) => {
    console.error('Audio playback blocked by browser:', err);
    console.log('Tip: You need to click somewhere on the dashboard first to allow audio.');
  });
}

export default function Dashboard() {
  const [alarmOpen, setAlarmOpen] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const [alarmSound, setAlarmSound] = useState(() => localStorage.getItem('preferredAlarmSound') || 'default.mp3');

  // Play the alarm sound + alert whenever a push notification arrives while the dashboard is open
  useEffect(() => {
    const unsubscribe = watchForegroundMessages((payload) => {
      console.log('Foreground Message received: ', payload);
      playAlarmSound();
      alert('🔔 ' + payload.notification.title + '\n\n' + payload.notification.body);
    });
    return unsubscribe;
  }, []);

  function handleSoundChange(e) {
    const value = e.target.value;
    setAlarmSound(value);
    localStorage.setItem('preferredAlarmSound', value);
    new Audio('/static/sounds/' + value).play().catch((err) => console.log('Preview blocked:', err));
  }

  async function handleToggleNotifications(e) {
    const checked = e.target.checked;
    if (checked) {
      try {
        const token = await requestNotificationToken();
        if (token) {
          await api.post('/save_fcm_token', { token });
          setNotifEnabled(true);
          alert('Notifications activated successfully!');
        } else {
          setNotifEnabled(false);
          alert('You denied the notification permission!');
        }
      } catch (err) {
        console.error('Error getting token:', err);
        setNotifEnabled(false);
      }
    } else {
      alert("Please go to your browser's site settings to completely disable notifications.");
      setNotifEnabled(true);
    }
  }

  return (
    <Layout>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-4">
        <Link to="/flat_expense" className="glass-card p-8 text-center group">
          <div className="w-20 h-20 rounded-full bg-indigo-100 text-indigo-500 flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
            <Building className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Flat Expenses</h2>
          <p className="text-sm text-slate-500">Manage monthly maintenance, lift, and other flat-related costs.</p>
        </Link>

        <Link to="/newspaper" className="glass-card p-8 text-center group">
          <div className="w-20 h-20 rounded-full bg-orange-100 text-orange-500 flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
            <Newspaper className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Newspaper Tracker</h2>
          <p className="text-sm text-slate-500">Track your daily newspaper deliveries and calculate monthly bills.</p>
        </Link>

        <Link to="/gas_expense" className="glass-card p-8 text-center group">
          <div className="w-20 h-20 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
            <Flame className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Gas Expense</h2>
          <p className="text-sm text-slate-500">Track gas cylinder bookings and get reminded when it's about to run out.</p>
        </Link>
      </div>

      <button onClick={() => setAlarmOpen(true)} className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-lg hover:shadow-indigo-500/50 transition-all transform hover:scale-105 flex items-center justify-center group z-40">
        <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
        <span className="absolute hidden group-hover:block bottom-16 right-0 bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap">Alarm Settings</span>
      </button>

      {alarmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-11/12 max-w-md transform transition-all border border-slate-100 dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <span>🔔</span> Alarm Settings
              </h3>
              <button onClick={() => setAlarmOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition bg-slate-100 dark:bg-slate-700 rounded-full p-1.5">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
                <div>
                  <p className="text-slate-700 dark:text-white font-bold">Push Notifications</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Receive daily reminder alarms</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={notifEnabled} onChange={handleToggleNotifications} className="sr-only peer" />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
                <label className="block text-slate-700 dark:text-white font-bold mb-1">Select Alarm Sound</label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Plays when the dashboard is open</p>
                <select value={alarmSound} onChange={handleSoundChange} className="w-full p-2.5 border border-slate-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition cursor-pointer">
                  <option value="default.mp3">Default Beep</option>
                  <option value="bell.mp3">Classic Bell</option>
                  <option value="digital.mp3">Digital Clock</option>
                  <option value="radar.mp3">Radar</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={() => setAlarmOpen(false)} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors w-full">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
