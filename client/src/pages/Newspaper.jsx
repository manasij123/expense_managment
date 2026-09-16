import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Newspaper as NewspaperIcon, PlusCircle, Share2, AlarmClock, X } from 'lucide-react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import Layout from '../components/Layout';
import { api } from '../api';
import { useFlash } from '../context/FlashContext';
import { shareNewspaperReport } from '../shareReport';

// Native-only bridge to the reliable exact-alarm engine (AlarmManager +
// full-screen wake) — a web page alone can't do this. No-op on the website.
const AlarmSettings = registerPlugin('AlarmSettings');

const DAY_HEADERS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default function Newspaper() {
  const showFlash = useFlash();
  const [data, setData] = useState(null);
  const [extraModalOpen, setExtraModalOpen] = useState(false);
  const [extraDate, setExtraDate] = useState('');
  const [extraAmount, setExtraAmount] = useState('');
  const [dayDetails, setDayDetails] = useState(null); // {day, isTaken, extraAmt}

  function load() {
    api.get('/api/newspaper').then(setData).catch((err) => showFlash(err.message, 'danger'));
  }

  useEffect(load, []);

  if (!data) {
    return (
      <Layout headerContent={<HeaderTitle />}>
        <p className="text-center text-slate-500">Loading...</p>
      </Layout>
    );
  }

  const { record, month_days, month_name, year, today, taken_sundays, taken_weekdays, missed_days } = data;
  const todayDate = new Date(today);

  async function toggleDay(day) {
    const dayStr = `${year}-${record.month}-${day}`;
    try {
      await api.post(`/api/newspaper/toggle/${dayStr}`);
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  function handleDayClick(day, isTaken, extraAmt) {
    if (extraAmt > 0) {
      setDayDetails({ day, isTaken, extraAmt });
    } else {
      toggleDay(day);
    }
  }

  async function handleResetExtraFromModal() {
    const day = dayDetails.day;
    setDayDetails(null);
    try {
      await api.post(`/api/newspaper/reset_extra/${year}-${record.month}-${day}`);
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  async function handleToggleFromModal() {
    const day = dayDetails.day;
    setDayDetails(null);
    await toggleDay(day);
  }

  async function handleAddExtra(e) {
    e.preventDefault();
    try {
      await api.post('/api/newspaper/add_extra', { date: extraDate, amount: Number(extraAmount) });
      showFlash(`Extra ₹${extraAmount} added for ${extraDate}.`);
      setExtraModalOpen(false);
      setExtraDate('');
      setExtraAmount('');
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  return (
    <Layout headerContent={<HeaderTitle />}>
      <div className="glass-card p-5 mb-6 flex justify-between items-center">
        <div>
          <p className="font-bold text-slate-600 uppercase tracking-wider">Monthly Total</p>
          <p className="text-3xl font-extrabold text-slate-800">₹{record.total_amount}</p>
        </div>
        <Link to="/newspaper/history" title="View History">
          <i className="fas fa-file-invoice text-2xl" style={{ color: 'rgb(86, 21, 234)' }}></i>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => setExtraModalOpen(true)} className="glass-btn flex-1 py-3 rounded-xl font-semibold text-sm flex items-center justify-center text-slate-700">
          <PlusCircle className="w-5 h-5 mr-2 text-indigo-500" /> Add Extra Paper Price
        </button>
        <button onClick={() => shareNewspaperReport(year, record.month)} className="glass-btn-secondary flex-1 py-3 rounded-xl font-semibold text-sm flex items-center justify-center text-slate-700">
          <Share2 className="w-5 h-5 mr-2 text-indigo-500" /> Share Report
        </button>
        {Capacitor.isNativePlatform() && (
          <button onClick={() => AlarmSettings.open()} className="glass-btn-secondary flex-1 py-3 rounded-xl font-semibold text-sm flex items-center justify-center text-slate-700" title="Set up reliable alarm reminders">
            <AlarmClock className="w-5 h-5 mr-2 text-indigo-500" /> Alarm Settings
          </button>
        )}
      </div>

      <div className="glass-card p-4">
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-500 mb-3">
          {DAY_HEADERS.map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {month_days.flatMap((week, wi) =>
            week.map((day, di) => {
              if (day === 0) return <div key={`${wi}-${di}`} className="day-cell empty"></div>;

              const isSunday = di === 0;
              const dayDate = new Date(year, record.month - 1, day);
              const isPast = dayDate < new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
              const isTaken = !!record.days_taken[String(day)];
              const extraAmt = Number(record.extra_papers?.[String(day)] || 0);

              const cellClass = isTaken ? 'taken' : isPast ? 'missed' : 'not-taken';

              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day, isTaken, extraAmt)}
                  className={`day-cell ${cellClass} relative`}
                  title={`Day ${day} - Price: ₹${isSunday ? 7 : 6}`}
                >
                  {day}
                  {extraAmt > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-white border border-indigo-500 text-indigo-600 dark:bg-slate-800 dark:border-indigo-500 dark:text-indigo-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md pointer-events-none z-20">
                      +₹{extraAmt}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="glass-card p-4 mt-6">
        <h3 className="font-bold text-slate-600 uppercase tracking-wider text-sm mb-3 text-center">Delivery Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div className="bg-emerald-100 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800/50 p-3 rounded-lg">
            <p className="text-2xl font-bold text-emerald-600">{taken_sundays + taken_weekdays}</p>
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">Delivered</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">({taken_sundays} Sundays, {taken_weekdays} Weekdays)</p>
          </div>
          <div className="bg-rose-100 border border-rose-200 dark:bg-rose-900/30 dark:border-rose-800/50 p-3 rounded-lg">
            <p className="text-2xl font-bold text-rose-600">{missed_days}</p>
            <p className="text-xs font-semibold text-rose-800 dark:text-rose-400">Missed</p>
          </div>
          <div className="bg-slate-100 border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700/50 p-3 rounded-lg">
            <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{Object.keys(record.days_taken).length - (taken_sundays + taken_weekdays + missed_days)}</p>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-400">Upcoming</p>
          </div>
        </div>
      </div>

      {/* Extra Paper Modal */}
      {extraModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full sm:w-96 rounded-t-2xl sm:rounded-xl p-6 transform transition-all shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800">Add Extra Paper</h3>
              <button onClick={() => setExtraModalOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddExtra}>
              <div className="mb-4">
                <label className="block text-gray-600 text-sm font-medium mb-2">Select Date</label>
                <input type="date" value={extraDate} onChange={(e) => setExtraDate(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500" required />
              </div>
              <div className="mb-6">
                <label className="block text-gray-600 text-sm font-medium mb-2">Extra Price (₹)</label>
                <input type="number" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} placeholder="e.g. 5, 10" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500" required />
              </div>
              <button type="submit" className="w-full py-3.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition">Add Price</button>
            </form>
          </div>
        </div>
      )}

      {/* Day Details Modal */}
      {dayDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 w-11/12 max-w-sm rounded-3xl p-6 transform transition-all shadow-2xl relative">
            <button onClick={() => setDayDetails(null)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-1 text-center">Day {dayDetails.day}</h3>
            <p className="text-center text-xs text-slate-500 dark:text-slate-400 font-medium mb-6">Tap a circle to modify</p>
            <div className="flex justify-center gap-6 mb-2">
              <button onClick={handleToggleFromModal} className="flex flex-col items-center group w-1/2">
                <div className={`circle-bg w-20 h-20 rounded-full ${dayDetails.isTaken ? 'bg-emerald-500 border-emerald-100 dark:border-emerald-900' : 'bg-slate-200 dark:bg-slate-700 border-slate-100 dark:border-slate-800'} text-white flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform border-4`}>
                  <NewspaperIcon className="w-10 h-10" />
                </div>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-3 text-center leading-tight">Daily Paper</span>
                <span className={`text-xs font-bold mt-1 text-center ${dayDetails.isTaken ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{dayDetails.isTaken ? 'Regular (Taken)' : 'Regular (Missed)'}</span>
              </button>
              <button onClick={handleResetExtraFromModal} className="flex flex-col items-center group w-1/2">
                <div className="circle-bg w-20 h-20 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform border-4 border-indigo-100 dark:border-indigo-900">
                  <PlusCircle className="w-10 h-10" />
                </div>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-3 text-center leading-tight">Extra Paper</span>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mt-1 text-center">+₹{dayDetails.extraAmt} (Tap to reset)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function HeaderTitle() {
  return (
    <div className="flex items-center">
      <Link to="/dashboard" className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-black/5 transition border border-gray-200 mr-4">
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <h1 className="font-bold text-lg sm:text-xl tracking-tight text-slate-700 flex items-center">
        <NewspaperIcon className="w-8 h-8 text-orange-500 mr-2" />
        Newspaper Tracker
      </h1>
    </div>
  );
}
