import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Newspaper as NewspaperIcon, PlusCircle, X } from 'lucide-react';
import Layout from '../components/Layout';

export default function SharedNewspaper() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [dayModal, setDayModal] = useState(null); // {day, isTaken, extraAmt}

  useEffect(() => {
    fetch(`/api/shared/report/${token}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);
        setData(json);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  if (error) {
    return (
      <Layout>
        <div className="glass-card p-8 text-center">
          <p className="text-rose-500 font-bold">{error}</p>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <p className="text-center text-slate-500">Loading...</p>
      </Layout>
    );
  }

  const { record, month_days, month_name, year, today, taken_sundays, taken_weekdays, missed_days } = data;
  const todayDate = new Date(today);
  const extraTotal = record.total_amount - taken_sundays * 7 - taken_weekdays * 6;

  return (
    <Layout headerContent={<HeaderTitle monthName={month_name} year={year} />}>
      <div className="glass-card p-5 mb-6 flex flex-col items-center justify-center text-center">
        <p className="font-bold text-slate-600 uppercase tracking-wider text-sm mb-1">Total Amount Due</p>
        <p className="text-4xl font-extrabold text-slate-800">₹{record.total_amount}</p>

        <div className="w-full mt-5">
          <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider text-center">Bill Breakdown</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
            <div className="bg-amber-50 border border-amber-200 dark:bg-amber-900/30 dark:border-amber-800/50 rounded-xl py-2 flex flex-col items-center justify-center shadow-sm">
              <p className="text-[9px] text-amber-600 dark:text-amber-400 font-bold mb-1 uppercase">Sundays (x ₹7)</p>
              <p className="text-sm font-black text-amber-700 dark:text-amber-300">{taken_sundays} <span className="text-[10px] font-medium opacity-80">= ₹{taken_sundays * 7}</span></p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800/50 rounded-xl py-2 flex flex-col items-center justify-center shadow-sm">
              <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold mb-1 uppercase">Weekdays (x ₹6)</p>
              <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">{taken_weekdays} <span className="text-[10px] font-medium opacity-80">= ₹{taken_weekdays * 6}</span></p>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800/50 rounded-xl py-2 flex flex-col items-center justify-center shadow-sm">
              <p className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold mb-1 uppercase">Extra Papers</p>
              <p className="text-sm font-black text-indigo-700 dark:text-indigo-300">₹{extraTotal}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-4 text-xs font-bold bg-white/50 px-4 py-2 rounded-lg border border-slate-200">
          <span className="text-emerald-600">{taken_sundays + taken_weekdays} Delivered</span>
          <span className="text-slate-300">|</span>
          <span className="text-rose-500">{missed_days} Missed</span>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-500 mb-3">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => <span key={d}>{d}</span>)}
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
                  onClick={() => setDayModal({ day, isTaken, extraAmt })}
                  className={`day-cell flex items-center justify-center rounded-xl font-bold h-12 w-full transition-transform hover:scale-105 relative ${cellClass}`}
                  title={`View Details for ${day} ${month_name}`}
                >
                  {day}
                  {extraAmt > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-white border border-indigo-500 text-indigo-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md pointer-events-none z-20">
                      +₹{extraAmt}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {dayModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 w-11/12 max-w-sm rounded-3xl p-6 transform transition-all shadow-2xl relative">
            <button onClick={() => setDayModal(null)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-1 text-center">Day {dayModal.day}</h3>
            <p className="text-center text-xs text-slate-500 font-medium mb-6">Delivery Details</p>
            <div className="flex justify-center gap-6 mb-2">
              <div className="flex flex-col items-center w-1/2">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl border-4 ${dayModal.isTaken ? 'bg-emerald-500 text-white border-emerald-100' : 'bg-slate-200 text-slate-400 border-slate-100'}`}>
                  <NewspaperIcon className="w-10 h-10" />
                </div>
                <span className="text-sm font-bold text-slate-700 mt-3 text-center leading-tight">Daily Paper</span>
                <span className={`text-xs font-bold mt-1 text-center ${dayModal.isTaken ? 'text-emerald-600' : 'text-slate-400'}`}>{dayModal.isTaken ? 'Regular (Delivered)' : 'Regular (Missed)'}</span>
              </div>
              <div className="flex flex-col items-center w-1/2">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl border-4 ${dayModal.extraAmt > 0 ? 'bg-indigo-500 text-white border-indigo-100' : 'bg-slate-200 text-slate-400 border-slate-100'}`}>
                  <PlusCircle className="w-10 h-10" />
                </div>
                <span className="text-sm font-bold text-slate-700 mt-3 text-center leading-tight">Extra Paper</span>
                <span className={`text-xs font-bold mt-1 text-center ${dayModal.extraAmt > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>{dayModal.extraAmt > 0 ? `+₹${dayModal.extraAmt}` : 'No Extra Paper'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function HeaderTitle({ monthName, year }) {
  return (
    <div className="flex items-center">
      <h1 className="font-bold text-lg sm:text-xl tracking-tight text-slate-700 flex items-center">
        <NewspaperIcon className="w-8 h-8 text-orange-500 mr-2" />
        Report: {monthName} {year}
      </h1>
    </div>
  );
}
