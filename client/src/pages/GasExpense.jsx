import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Flame, Banknote, CalendarClock, List, X, Check, HelpCircle } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api';
import { useFlash } from '../context/FlashContext';

export default function GasExpense() {
  const showFlash = useFlash();
  const [data, setData] = useState(null);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [price, setPrice] = useState('');

  function load() {
    api.get('/api/gas').then((res) => {
      setData(res);
      setPrice(String(res.default_price));
    }).catch((err) => showFlash(err.message, 'danger'));
  }

  useEffect(load, []);

  if (!data) {
    return (
      <Layout headerContent={<HeaderTitle />}>
        <p className="text-center text-slate-500">Loading...</p>
      </Layout>
    );
  }

  const { active, is_check_due, history, total_expense, days_until_rebook } = data;

  async function handleSnooze() {
    try {
      await api.post('/api/gas/snooze');
      showFlash("Okay, we'll check again in 5 days.");
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  async function handleBook(e) {
    e.preventDefault();
    try {
      await api.post('/api/gas/book', { price: Number(price) });
      showFlash(active ? 'New cylinder booked!' : 'Cylinder booked!');
      setBookModalOpen(false);
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  const daysSinceBooked = active
    ? Math.floor((new Date() - new Date(active.booked_date)) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Layout headerContent={<HeaderTitle />}>
      {/* Check-in Banner */}
      {is_check_due && (
        <div className="glass-card p-6 mb-6 border-2 border-amber-300 bg-amber-50/60">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
              <HelpCircle className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-800 mb-1">Has this month's gas cylinder run out?</h3>
              <p className="text-sm text-slate-500 mb-4">Booked on {active.booked_date} — it's been {daysSinceBooked} days.</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={handleSnooze} className="glass-btn-secondary px-5 py-2.5 rounded-xl font-semibold text-sm">
                  Not Yet
                </button>
                <button onClick={() => setBookModalOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition">
                  Yes, It's Finished — Book New
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden group">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Banknote className="w-6 h-6" />
            </div>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Total Gas Expense</p>
            <h2 className="text-3xl font-extrabold text-slate-700 text-gradient">₹{total_expense}</h2>
          </div>

          {active ? (
            <div className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-500 flex items-center justify-center mb-2">
                <Flame className="w-6 h-6" />
              </div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Current Cylinder</p>
              <span className="text-emerald-600 font-bold text-lg">Day {daysSinceBooked}</span>
              <span className="text-[10px] text-slate-400 mt-1">₹{active.price} • booked {active.booked_date}</span>
            </div>
          ) : (
            <button type="button" onClick={() => setBookModalOpen(true)} className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden cursor-pointer group w-full">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <Flame className="w-6 h-6" />
              </div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Current Cylinder</p>
              <span className="text-slate-500 font-bold text-lg">Book First Cylinder</span>
            </button>
          )}

          <div className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden group sm:col-span-2 md:col-span-1">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <List className="w-6 h-6" />
            </div>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Total Cylinders</p>
            <h2 className="text-3xl font-extrabold text-slate-700">{history.length}</h2>
          </div>
        </div>
      </div>

      {active && !is_check_due && (
        <div className="glass-card p-4 mb-8 flex items-center gap-3">
          <CalendarClock className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <p className="text-sm text-slate-500">Next check-in around <span className="font-semibold text-slate-700">{active.next_check_date}</span>.</p>
        </div>
      )}

      {active && (
        <div className="flex justify-end items-center gap-3 mb-6">
          {days_until_rebook > 0 ? (
            <span className="text-xs text-slate-400">Distributor rule: new booking available in {days_until_rebook} day{days_until_rebook > 1 ? 's' : ''}</span>
          ) : (
            <button onClick={() => setBookModalOpen(true)} className="glass-btn-secondary px-5 py-3 rounded-xl font-semibold text-sm" title="Manually book a new cylinder">
              Book New Cylinder
            </button>
          )}
        </div>
      )}

      {/* History Table */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/50 bg-white/30 flex justify-between items-center">
          <h3 className="font-bold text-slate-600 text-sm uppercase tracking-wide">Cylinder History</h3>
          <span className="text-xs font-medium text-slate-500 bg-white/60 px-2 py-1 rounded border border-slate-200">{history.length} Rows</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse responsive-table">
            <thead>
              <tr className="text-xs text-slate-400 uppercase border-b border-slate-200/50">
                <th className="px-6 py-3 font-semibold text-center">Booked On</th>
                <th className="px-6 py-3 font-semibold text-center">Price</th>
                <th className="px-6 py-3 font-semibold text-center">Status</th>
                <th className="px-6 py-3 font-semibold text-center">Lasted</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100 sm:divide-y-0">
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">No cylinders booked yet.</td>
                </tr>
              )}
              {history.map((c) => (
                <tr key={c.id} className="border-b border-slate-100/50 last:border-none hover:bg-white/40 transition">
                  <td className="px-6 py-4 font-medium text-slate-700 text-center">{c.booked_date}</td>
                  <td data-label="Price" className="px-6 py-4 text-center">₹{c.price}</td>
                  <td data-label="Status" className="px-6 py-4 text-center">
                    {c.status === 'active' ? (
                      <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600">Active</span>
                    ) : (
                      <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500">Finished</span>
                    )}
                  </td>
                  <td data-label="Lasted" className="px-6 py-4 text-center text-slate-500">
                    {c.days_lasted != null ? `${c.days_lasted} days` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Book Cylinder Modal */}
      {bookModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full sm:w-96 rounded-t-2xl sm:rounded-xl p-6 transform transition-all animate-bounce-up shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800">{active ? 'Book New Cylinder' : 'Book First Cylinder'}</h3>
              <button onClick={() => setBookModalOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleBook}>
              <div className="mb-6">
                <label className="block text-gray-600 text-sm font-medium mb-2">Cylinder Price (₹)</label>
                <input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500" required />
                <p className="text-xs text-slate-400 mt-2">Price changes now and then — update it if today's price is different.</p>
              </div>
              <button type="submit" className="w-full py-3.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition flex items-center justify-center">
                <Check className="w-5 h-5 mr-2" /> Confirm Booking
              </button>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

function HeaderTitle() {
  return (
    <div className="flex items-center">
      <Link to="/dashboard" className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-black/5 transition border border-gray-200 mr-4" title="Back to Dashboard">
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <h1 className="font-bold text-lg sm:text-xl tracking-tight text-slate-700 flex items-center">
        <Flame className="w-8 h-8 text-rose-500 mr-2" />
        GAS EXPENSE
      </h1>
    </div>
  );
}
