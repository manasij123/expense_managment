import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Flame, Banknote, CalendarClock, List, X, Check, HelpCircle, AlarmClock, PackageCheck, Receipt, KeyRound } from 'lucide-react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import Layout from '../components/Layout';
import { api } from '../api';
import { useFlash } from '../context/FlashContext';

// Native-only bridge to the reliable exact-alarm engine — a web page alone
// can't do this. No-op on the website.
const AlarmSettings = registerPlugin('AlarmSettings');

// Which step of the acknowledge -> book -> received flow the cylinder is
// currently in, driving what the Alarming tab shows. A pending order (one
// that's been booked to replace the cylinder still in use) always takes
// priority — asking "has it run out?" about the old one is pointless once
// a replacement is already on the way.
function gasStage(active, pendingOrder, isCheckDue) {
  if (pendingOrder) return 'awaiting_delivery';
  // The very first cylinder ever booked has no old one to keep running, so
  // it goes straight to 'active' but still starts out unreceived.
  if (active && !active.received) return 'awaiting_delivery';
  if (!active) return 'none';
  if (isCheckDue && !active.acknowledged) return 'check_due';
  if (isCheckDue && active.acknowledged) return 'ready_to_book';
  return 'ok';
}

export default function GasExpense() {
  const showFlash = useFlash();
  const [data, setData] = useState(null);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [tab, setTab] = useState('record'); // 'record' | 'alarming'
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [code, setCode] = useState('');

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

  const { active, pending_order, is_check_due, history, total_expense, days_until_rebook } = data;
  const stage = gasStage(active, pending_order, is_check_due);

  async function handleSnooze() {
    try {
      await api.post('/api/gas/snooze');
      showFlash("Okay, we'll check again in 5 days.");
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  async function handleAcknowledge() {
    try {
      await api.post('/api/gas/acknowledge');
      showFlash("Noted — don't forget to book it!");
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  async function handleMarkReceived() {
    try {
      await api.post('/api/gas/mark_received');
      showFlash('Marked as received!');
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  async function handleBook(e) {
    e.preventDefault();
    try {
      await api.post('/api/gas/book', { price: Number(price) });
      showFlash(active ? 'New cylinder booked! Mark it received once it actually arrives.' : 'Cylinder booked!');
      setBookModalOpen(false);
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  function openCodeModal() {
    setCode((pending_order || active)?.delivery_code || '');
    setCodeModalOpen(true);
  }

  async function handleSetCode(e) {
    e.preventDefault();
    try {
      await api.post('/api/gas/set_code', { code });
      showFlash('Delivery code saved!');
      setCodeModalOpen(false);
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  const daysSinceBooked = active
    ? Math.floor((new Date() - new Date(active.received_date || active.booked_date)) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Layout headerContent={<HeaderTitle />}>
      {tab === 'record' ? (
        <RecordTab
          active={active}
          pendingOrder={pending_order}
          history={history}
          totalExpense={total_expense}
          daysUntilRebook={days_until_rebook}
          daysSinceBooked={daysSinceBooked}
          isCheckDue={is_check_due}
          onBookClick={() => setBookModalOpen(true)}
          onCodeClick={openCodeModal}
        />
      ) : (
        <AlarmingTab
          active={active}
          pendingOrder={pending_order}
          stage={stage}
          daysSinceBooked={daysSinceBooked}
          onSnooze={handleSnooze}
          onAcknowledge={handleAcknowledge}
          onMarkReceived={handleMarkReceived}
          onBookClick={() => setBookModalOpen(true)}
          onCodeClick={openCodeModal}
        />
      )}

      {/* Bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-700 flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button
          onClick={() => setTab('record')}
          className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-semibold transition ${tab === 'record' ? 'text-rose-600' : 'text-slate-400'}`}
        >
          <Receipt className="w-5 h-5" />
          Booking Record
        </button>
        <button
          onClick={() => setTab('alarming')}
          className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-semibold transition relative ${tab === 'alarming' ? 'text-rose-600' : 'text-slate-400'}`}
        >
          <AlarmClock className="w-5 h-5" />
          Alarming
          {(stage === 'check_due' || stage === 'ready_to_book' || stage === 'awaiting_delivery') && (
            <span className="absolute top-1 right-[30%] w-2 h-2 rounded-full bg-rose-500"></span>
          )}
        </button>
      </div>
      <div className="h-16" /> {/* spacer so content isn't hidden behind the fixed bar */}

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

      {/* Delivery Code Modal */}
      {codeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full sm:w-96 rounded-t-2xl sm:rounded-xl p-6 transform transition-all animate-bounce-up shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800">Delivery Code</h3>
              <button onClick={() => setCodeModalOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSetCode}>
              <div className="mb-6">
                <label className="block text-gray-600 text-sm font-medium mb-2">4-Digit SMS Code</label>
                <input type="text" inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="0000" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 text-center text-2xl tracking-[0.5em] font-bold" required />
                <p className="text-xs text-slate-400 mt-2">The distributor sends this by SMS after booking — give it to the delivery person to verify.</p>
              </div>
              <button type="submit" className="w-full py-3.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition flex items-center justify-center">
                <Check className="w-5 h-5 mr-2" /> Save Code
              </button>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

function RecordTab({ active, pendingOrder, history, totalExpense, daysUntilRebook, daysSinceBooked, isCheckDue, onBookClick, onCodeClick }) {
  return (
    <>
      {/* Stats Row */}
      <div className="mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden group">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Banknote className="w-6 h-6" />
            </div>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Total Gas Expense</p>
            <h2 className="text-3xl font-extrabold text-slate-700 text-gradient">₹{totalExpense}</h2>
          </div>

          {active ? (
            <div className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-500 flex items-center justify-center mb-2">
                <Flame className="w-6 h-6" />
              </div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Current Cylinder</p>
              <span className="text-emerald-600 font-bold text-lg">Day {daysSinceBooked}</span>
              <span className="text-[10px] text-slate-400 mt-1">₹{active.price} • {active.received ? 'received' : 'booked'} {active.received_date || active.booked_date}</span>
              {!pendingOrder && (
                <button onClick={onCodeClick} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 transition">
                  <KeyRound className="w-3.5 h-3.5" />
                  {active.delivery_code ? `Code: ${active.delivery_code}` : 'Add Delivery Code'}
                </button>
              )}
            </div>
          ) : (
            <button type="button" onClick={onBookClick} className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden cursor-pointer group w-full">
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

      {pendingOrder && (
        <div className="glass-card p-4 mb-8 flex items-center justify-between gap-3 border-2 border-indigo-200 bg-indigo-50/60">
          <div>
            <p className="text-sm font-semibold text-slate-700">New cylinder booked on {pendingOrder.booked_date} for ₹{pendingOrder.price} — waiting for delivery.</p>
            <p className="text-xs text-slate-500 mt-0.5">The one currently in use above keeps running until this one is marked received.</p>
          </div>
          <button onClick={onCodeClick} className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-indigo-600 hover:bg-indigo-100 transition">
            <KeyRound className="w-3.5 h-3.5" />
            {pendingOrder.delivery_code ? `Code: ${pendingOrder.delivery_code}` : 'Add Delivery Code'}
          </button>
        </div>
      )}

      {active && active.received && !isCheckDue && (
        <div className="glass-card p-4 mb-8 flex items-center gap-3">
          <CalendarClock className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <p className="text-sm text-slate-500">Next check-in around <span className="font-semibold text-slate-700">{active.next_check_date}</span>.</p>
        </div>
      )}

      {active && !pendingOrder && (
        <div className="flex justify-end items-center gap-3 mb-6">
          {daysUntilRebook > 0 ? (
            <span className="text-xs text-slate-400">Distributor rule: new booking available in {daysUntilRebook} day{daysUntilRebook > 1 ? 's' : ''}</span>
          ) : (
            <button onClick={onBookClick} className="glass-btn-secondary px-5 py-3 rounded-xl font-semibold text-sm" title="Manually book a new cylinder">
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
                <th className="px-6 py-3 font-semibold text-center">Installed On</th>
                <th className="px-6 py-3 font-semibold text-center">Price</th>
                <th className="px-6 py-3 font-semibold text-center">Status</th>
                <th className="px-6 py-3 font-semibold text-center">Code</th>
                <th className="px-6 py-3 font-semibold text-center">Lasted</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100 sm:divide-y-0">
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">No cylinders booked yet.</td>
                </tr>
              )}
              {history.map((c) => (
                <tr key={c.id} className="border-b border-slate-100/50 last:border-none hover:bg-white/40 transition">
                  <td className="px-6 py-4 font-medium text-slate-700 text-center">{c.booked_date}</td>
                  <td data-label="Installed On" className="px-6 py-4 text-center text-slate-500">
                    {c.received_date || (c.received ? c.booked_date : '-')}
                  </td>
                  <td data-label="Price" className="px-6 py-4 text-center">₹{c.price}</td>
                  <td data-label="Status" className="px-6 py-4 text-center">
                    {c.status === 'active' ? (
                      <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600">Active</span>
                    ) : c.status === 'ordered' ? (
                      <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-indigo-50 text-indigo-600">Ordered</span>
                    ) : (
                      <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500">Finished</span>
                    )}
                  </td>
                  <td data-label="Code" className="px-6 py-4 text-center text-slate-500 font-mono">
                    {c.delivery_code || '-'}
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
    </>
  );
}

function AlarmingTab({ active, pendingOrder, stage, daysSinceBooked, onSnooze, onAcknowledge, onMarkReceived, onBookClick, onCodeClick }) {
  // Whichever cylinder hasn't been received yet — the pending order, or
  // (for the very first cylinder, which has no old one to wait on) active
  // itself while it's still unreceived.
  const incoming = pendingOrder || active;

  return (
    <>
      {stage === 'none' && (
        <div className="glass-card p-8 text-center">
          <Flame className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 mb-4">No cylinder booked yet — book one first.</p>
          <button onClick={onBookClick} className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition">
            Book First Cylinder
          </button>
        </div>
      )}

      {stage === 'awaiting_delivery' && (
        <div className="glass-card p-6 border-2 border-indigo-300 bg-indigo-50/60">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <PackageCheck className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-800 mb-1">Has the new cylinder arrived?</h3>
              <p className="text-sm text-slate-500 mb-4">
                Booked on {incoming.booked_date} — usually arrives within 5 days (longer during a supply crisis).
                {pendingOrder && ' The one currently in use keeps running until you mark this received.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <button onClick={onMarkReceived} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition">
                  Yes, Received It
                </button>
                <button onClick={onCodeClick} className="glass-btn-secondary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4" />
                  {incoming.delivery_code ? `Code: ${incoming.delivery_code}` : 'Add SMS Code'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {stage === 'check_due' && (
        <div className="glass-card p-6 border-2 border-amber-300 bg-amber-50/60">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
              <HelpCircle className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-800 mb-1">Has this month's gas cylinder run out?</h3>
              <p className="text-sm text-slate-500 mb-4">Received on {active.received_date || active.booked_date} — it's been {daysSinceBooked} days.</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={onSnooze} className="glass-btn-secondary px-5 py-2.5 rounded-xl font-semibold text-sm">
                  Not Yet
                </button>
                <button onClick={onAcknowledge} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition">
                  Yes, I've Noticed — I'll Book
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {stage === 'ready_to_book' && (
        <div className="glass-card p-6 border-2 border-rose-300 bg-rose-50/60">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
              <Flame className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-800 mb-1">Don't forget to book!</h3>
              <p className="text-sm text-slate-500 mb-4">You said you'd book a new cylinder — the alarm will keep reminding you daily until you do.</p>
              <button onClick={onBookClick} className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition">
                Yes, I've Booked
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'ok' && (
        <div className="glass-card p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <Check className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">All set</h3>
            <p className="text-sm text-slate-500">Cylinder received, day {daysSinceBooked}. Next check-in around <span className="font-semibold text-slate-700">{active.next_check_date}</span>.</p>
          </div>
        </div>
      )}

      {Capacitor.isNativePlatform() && (
        <button onClick={() => AlarmSettings.openGasAlarm()} className="glass-card p-6 flex items-center gap-4 w-full text-left mt-6" title="Customize the daily check-in alarm time">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
            <AlarmClock className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Alarm Time Settings</h3>
            <p className="text-sm text-slate-500">Change the daily check-in time, tone, and permissions.</p>
          </div>
        </button>
      )}
    </>
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
