import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Share2 } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api';
import { useFlash } from '../context/FlashContext';
import { shareNewspaperReport } from '../shareReport';

const currentYear = new Date().getFullYear();

export default function NewspaperHistory() {
  const showFlash = useFlash();
  const [data, setData] = useState(null);
  const [openYear, setOpenYear] = useState(currentYear);
  const [openCalendarKey, setOpenCalendarKey] = useState(null);

  function load() {
    api.get('/api/newspaper/history').then(setData).catch((err) => showFlash(err.message, 'danger'));
  }

  useEffect(load, []);

  if (!data) {
    return (
      <Layout headerContent={<HeaderTitle />}>
        <p className="text-center text-slate-500">Loading...</p>
      </Layout>
    );
  }

  const { history, grand_total } = data;

  const byYear = {};
  for (const item of history) {
    (byYear[item.year] ||= []).push(item);
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  async function handleToggleDay(item, day) {
    try {
      await api.post(`/api/newspaper/toggle/${item.year}-${item.month}-${day}`);
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  return (
    <Layout headerContent={<HeaderTitle />}>
      <div className="glass-card mb-6 p-6 flex justify-between items-center bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800">
        <h3 className="font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider text-lg">Grand Total</h3>
        <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">₹{grand_total}</p>
      </div>

      <div className="space-y-8">
        {years.map((year) => {
          const yearItems = byYear[year];
          const yearTotal = yearItems.reduce((sum, i) => sum + (i.total_amount || 0), 0);
          const isOpen = openYear === year;

          return (
            <div key={year} className="year-section">
              <div
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm px-6 py-5 flex justify-between items-center cursor-pointer border border-slate-100 dark:border-slate-700 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 select-none"
                onClick={() => setOpenYear(isOpen && year !== currentYear ? currentYear : year)}
              >
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{year}</h2>
                <div className="flex items-center gap-4">
                  <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">₹{yearTotal}</p>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isOpen ? '' : '-rotate-90'}`} />
                </div>
              </div>

              {isOpen && (
                <div className="mt-4">
                  <div className="glass-card overflow-hidden">
                    <table className="w-full text-left responsive-table">
                      <thead>
                        <tr className="text-xs text-slate-500 uppercase font-semibold tracking-wider border-b border-slate-200/50">
                          <th className="px-6 py-4">Period</th>
                          <th className="px-6 py-4 text-right">Total</th>
                          <th className="px-4 py-4 text-center w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100/50">
                        {yearItems.map((item, idx) => {
                          const calKey = `${year}-${idx}`;
                          const calOpen = openCalendarKey === calKey;
                          return (
                            <Fragment key={calKey}>
                              <tr className="hover:bg-white/40 transition cursor-pointer group" onClick={() => setOpenCalendarKey(calOpen ? null : calKey)}>
                                <td className="px-6 py-4" data-label="Period">
                                  <p className="font-bold text-slate-700">{item.month_name || 'N/A'}</p>
                                  <p className="text-xs text-slate-500">{item.year || '----'}</p>
                                </td>
                                <td className="px-6 py-4 text-right font-bold text-slate-800" data-label="Total">₹{item.total_amount || 0}</td>
                                <td className="px-4 py-4 text-center" data-label="Details">
                                  <div className="flex items-center justify-center gap-3">
                                    <button onClick={(e) => { e.stopPropagation(); shareNewspaperReport(item.year, item.month); }} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition" title="Share this month's report">
                                      <Share2 className="w-4 h-4 text-indigo-500" />
                                    </button>
                                    <ChevronDown className={`w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition-transform duration-300 ${calOpen ? 'rotate-180' : ''}`} />
                                  </div>
                                </td>
                              </tr>
                              {calOpen && (
                                <tr className="bg-slate-50/50 dark:bg-slate-900/20">
                                  <td colSpan={3} className="px-6 py-6">
                                    <div className="max-w-xs mx-auto">
                                      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-2">
                                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}
                                      </div>
                                      <div className="grid grid-cols-7 gap-1">
                                        {item.calendar_grid.flatMap((week, wi) =>
                                          week.map((day, di) => {
                                            if (day === 0) return <div key={`${wi}-${di}`} className="h-7"></div>;
                                            const isTaken = !!item.days_taken?.[String(day)];
                                            const cellClass = isTaken ? 'taken' : 'missed';

                                            if (!item.is_editable) {
                                              return (
                                                <div key={day} className={`day-cell h-7 w-7 text-[11px] relative ${cellClass} opacity-60 cursor-not-allowed`} title={`Day ${day} (Locked)`}>
                                                  {day}
                                                </div>
                                              );
                                            }
                                            return (
                                              <button
                                                key={day}
                                                onClick={() => handleToggleDay(item, day)}
                                                className={`day-cell h-7 w-7 text-[11px] transition-all hover:scale-110 relative ${cellClass}`}
                                                title={`Day ${day}`}
                                              >
                                                {day}
                                              </button>
                                            );
                                          })
                                        )}
                                      </div>
                                      <div className="mt-4 flex justify-center gap-4 text-[10px] font-medium text-slate-500 uppercase tracking-tighter">
                                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Taken</div>
                                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-300 border border-rose-400"></span> Missed</div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Layout>
  );
}

function HeaderTitle() {
  return (
    <div className="flex items-center">
      <Link to="/newspaper" className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-black/5 transition border border-gray-200 mr-4">
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <h1 className="font-bold text-lg sm:text-xl tracking-tight text-slate-700">Newspaper History</h1>
    </div>
  );
}
