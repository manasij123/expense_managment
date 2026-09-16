import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building, Banknote, CheckCircle, Coins, AlertCircle, List, Plus, PlusCircle, Trash2, Lock, X, Settings } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api';
import { useFlash } from '../context/FlashContext';

const currentMonthValue = new Date().toISOString().slice(0, 7); // "YYYY-MM"

export default function FlatExpense() {
  const showFlash = useFlash();
  const [data, setData] = useState(null);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [month, setMonth] = useState(currentMonthValue);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [amountPaid, setAmountPaid] = useState('');

  function load() {
    api.get('/api/flat_expense').then(setData).catch((err) => showFlash(err.message, 'danger'));
  }

  useEffect(load, []);

  useEffect(() => {
    if (data) setAmountPaid(String(data.total));
  }, [data?.total]);

  if (!data) {
    return (
      <Layout headerContent={<HeaderTitle />}>
        <p className="text-center text-slate-500">Loading...</p>
      </Layout>
    );
  }

  const { record, total, puja_added, lift_added, paid_status_map, doc_id } = data;

  const isPayExpenseMonth = paid_status_map[`${month.split('-')[0]}_${parseInt(month.split('-')[1], 10)}`] === true;

  async function handleAddExpense(e) {
    e.preventDefault();
    try {
      const res = await api.post('/api/flat_expense/add_expense', { reason, amount: Number(amount), month });
      showFlash(res.was_paid ? `Extra expense added (Note: Month is marked as Paid).` : 'Expense added successfully.');
      setExpenseModalOpen(false);
      setReason('');
      setAmount('');
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  function openExpenseModal() {
    if (record.is_paid) {
      if (!window.confirm('This month is already marked as PAID. Do you really want to add an extra expense?')) return;
    }
    setExpenseModalOpen(true);
  }

  async function handleAddPuja() {
    try {
      await api.post('/api/flat_expense/add_puja');
      showFlash('Durga Puja added!');
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  async function handleAddLift() {
    try {
      await api.post('/api/flat_expense/add_lift');
      showFlash('Lift Maintenance added!');
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  async function handleDelete(expenseId) {
    if (!window.confirm('Are you sure you want to delete this?')) return;
    try {
      await api.post(`/api/flat_expense/delete/${expenseId}`);
      showFlash('Expense deleted successfully!');
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  async function handleTogglePaid(e) {
    e.preventDefault();
    try {
      const res = await api.post('/api/flat_expense/toggle_paid', { amount_paid: Number(amountPaid) });
      if (res.change_due > 0) {
        showFlash(`Paid! You gave ₹${amountPaid} — you should get back ₹${res.change_due} as change.`);
      } else if (res.due_amount > 0) {
        showFlash(`Paid ₹${amountPaid}. ₹${res.due_amount} is still due — it'll be added to next month's bill.`, 'warning');
      } else {
        showFlash('Paid! Exact amount given, nothing to get back.');
      }
      setPayModalOpen(false);
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  async function handleConfirmChangeReceived() {
    if (!window.confirm(`Have you actually received ₹${record.change_due} back? Only confirm once the money is really in your hand.`)) return;
    try {
      await api.post(`/api/flat_expense/confirm_change_received/${doc_id}`);
      showFlash(`₹${record.change_due} change marked as received!`);
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  return (
    <Layout headerContent={<HeaderTitle />}>
      {/* Infographic Stats Row */}
      <div className="mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden group">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Banknote className="w-6 h-6" />
            </div>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Total Expense</p>
            <h2 className="text-3xl font-extrabold text-slate-700 text-gradient">₹{total}</h2>
          </div>

          {record.is_paid ? (
            record.change_due > 0 && !record.change_received ? (
              <div className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden" title="Check it off in the Expense Report table once you've received it">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-500 flex items-center justify-center mb-2">
                  <Coins className="w-6 h-6" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Payment Status</p>
                <span className="text-amber-600 font-bold text-lg">₹{record.change_due} DUE BACK</span>
              </div>
            ) : record.due_amount > 0 ? (
              <div className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden" title="This shortfall has been added to next month's bill">
                <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-500 flex items-center justify-center mb-2">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Payment Status</p>
                <span className="text-orange-600 font-bold text-lg">₹{record.due_amount} SHORT</span>
              </div>
            ) : (
              <div className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-500 flex items-center justify-center mb-2">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Payment Status</p>
                <span className="text-emerald-600 font-bold text-lg">PAID</span>
                {record.change_due > 0 && record.change_received && (
                  <span className="text-[10px] text-emerald-500 mt-1">₹{record.change_due} change received</span>
                )}
              </div>
            )
          ) : (
            <button type="button" onClick={() => setPayModalOpen(true)} className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden cursor-pointer group w-full">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Payment Status</p>
              <span className="text-rose-500 font-bold text-lg">DUE</span>
            </button>
          )}

          <div className="glass-card p-5 flex flex-col justify-center items-center text-center relative overflow-hidden group sm:col-span-2 md:col-span-1">
            <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <List className="w-6 h-6" />
            </div>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Total Items</p>
            <h2 className="text-3xl font-extrabold text-slate-700">{record.expenses.length}</h2>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap gap-3 mb-8 action-buttons">
        {!record.is_paid ? (
          <button onClick={openExpenseModal} className="glass-btn flex-1 min-w-35 py-3 rounded-xl font-semibold text-sm flex items-center justify-center">
            <Plus className="w-5 h-5 mr-2" /> Add Expense
          </button>
        ) : (
          <button onClick={openExpenseModal} className="glass-btn-secondary flex-1 min-w-35 py-3 rounded-xl font-semibold text-sm flex items-center justify-center" title="Add extra expense to this paid month">
            <PlusCircle className="w-5 h-5 mr-2" /> Add Extra
          </button>
        )}
        {!puja_added && (
          <button onClick={handleAddPuja} className="glass-btn-secondary flex-1 min-w-50 py-3 rounded-xl font-semibold text-sm flex items-center justify-center">
            <i className="icon-durga2 text-4xl mr-2 text-white-600 dark:text-blue"></i>
            Add Puja
          </button>
        )}
        {!lift_added && (
          <button onClick={handleAddLift} className="glass-btn-secondary flex-1 min-w-35 py-3 rounded-xl font-semibold text-sm flex items-center justify-center">
            <Settings className="w-5 h-5 text-indigo-500 mr-2" /> Add Lift
          </button>
        )}
        <Link to="/history" className="glass-btn-secondary px-5 py-3 rounded-xl flex items-center justify-center" title="View History">
          <i className="fas fa-file-invoice text-2xl" style={{ color: 'rgb(86, 21, 234)' }}></i>
        </Link>
      </div>

      {/* Data Table */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/50 bg-white/30 flex justify-between items-center">
          <h3 className="font-bold text-slate-600 text-sm uppercase tracking-wide">Expense Report</h3>
          <span className="text-xs font-medium text-slate-500 bg-white/60 px-2 py-1 rounded border border-slate-200">{record.expenses.length} Rows</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse responsive-table">
            <thead>
              <tr className="text-xs text-slate-400 uppercase border-b border-slate-200/50">
                <th className="px-6 py-3 font-semibold text-center">Description (Amount)</th>
                <th className="px-6 py-3 font-semibold text-center">Category</th>
                <th className="px-6 py-3 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100 sm:divide-y-0">
              {record.expenses.map((expense) => (
                <tr key={expense.id} className="border-b border-slate-100/50 last:border-none hover:bg-white/40 transition">
                  <td className="px-6 py-4 font-medium text-slate-700 text-center description-cell">
                    <div className="flex items-center justify-center">
                      <span className={`w-2 h-2 rounded-full mr-3 ${expense.is_fixed ? 'bg-indigo-400' : 'bg-orange-400'}`}></span>
                      {expense.reason} <span className="ml-2 font-normal text-slate-500">(₹{expense.amount})</span>
                    </div>
                  </td>
                  <td data-label="Category" className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${expense.is_fixed ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'}`}>
                      {expense.is_fixed ? 'Fixed' : 'Variable'}
                    </span>
                  </td>
                  <td data-label="Action" className="px-6 py-4">
                    <div className="flex items-center justify-center">
                      {expense.id && expense.reason !== 'Monthly Maintenance' ? (
                        <button onClick={() => handleDelete(expense.id)} className="text-rose-400 hover:text-rose-600 transition p-2">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      ) : record.is_paid ? (
                        <span className="text-slate-300 p-2" title="Locked"><Lock className="w-5 h-5" /></span>
                      ) : (
                        <span className="text-slate-300 p-2">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {record.change_due > 0 && (
                <tr className="border-b border-slate-100/50 last:border-none hover:bg-white/40 transition">
                  <td className="px-6 py-4 font-medium text-slate-700 text-center description-cell">
                    <div className="flex flex-col items-center w-full">
                      <div className="flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full mr-3 bg-amber-400"></span>
                        Change to Collect <span className="ml-2 font-normal text-slate-500">(₹{record.change_due})</span>
                      </div>
                      {!record.change_received && (
                        <p className="text-[10px] font-normal text-amber-600 mt-1 leading-snug">You gave ₹{record.amount_paid} (total ₹{total}) — remind them &amp; collect it back.</p>
                      )}
                    </div>
                  </td>
                  <td data-label="Category" className="px-6 py-4 text-center">
                    {record.change_received ? (
                      <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600">Received</span>
                    ) : (
                      <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-600">Pending</span>
                    )}
                  </td>
                  <td data-label="Action" className="px-6 py-4">
                    <div className="flex items-center justify-center">
                      {record.change_received ? (
                        <span className="text-emerald-400 p-2" title={`Received on ${record.change_received_date}`}><CheckCircle className="w-5 h-5" /></span>
                      ) : (
                        <button onClick={handleConfirmChangeReceived} className="text-amber-500 hover:text-amber-600 transition p-2" title="Mark as received">
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {record.due_amount > 0 && (
                <tr className="border-b border-slate-100/50 last:border-none hover:bg-white/40 transition">
                  <td className="px-6 py-4 font-medium text-slate-700 text-center description-cell">
                    <div className="flex flex-col items-center w-full">
                      <div className="flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full mr-3 bg-orange-400"></span>
                        Short Paid <span className="ml-2 font-normal text-slate-500">(₹{record.due_amount})</span>
                      </div>
                      <p className="text-[10px] font-normal text-orange-600 mt-1 leading-snug">You gave ₹{record.amount_paid} (total ₹{total}) — the shortfall is added to next month's bill.</p>
                    </div>
                  </td>
                  <td data-label="Category" className="px-6 py-4 text-center">
                    <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-orange-50 text-orange-600">Carried Forward</span>
                  </td>
                  <td data-label="Action" className="px-6 py-4">
                    <div className="flex items-center justify-center">
                      <span className="text-slate-300 p-2">-</span>
                    </div>
                  </td>
                </tr>
              )}

              <tr className="bg-white/30 total-row">
                <td className="px-6 py-4 font-bold text-slate-700 text-right" colSpan={2}>Total Amount</td>
                <td className="px-6 py-4 font-bold text-slate-700 text-right">₹{total}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Expense Modal */}
      {expenseModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full sm:w-96 rounded-t-2xl sm:rounded-xl p-6 transform transition-all animate-bounce-up shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800">Add New Expense</h3>
              <button onClick={() => setExpenseModalOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddExpense}>
              <div className="mb-4">
                <label className="block text-gray-600 text-sm font-medium mb-2">Select Month</label>
                <input type="month" value={month} max={currentMonthValue} onChange={(e) => setMonth(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500" />
              </div>
              <div className="mb-4">
                <label className="block text-gray-600 text-sm font-medium mb-2">Expense Name</label>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Bulb change" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500" required />
              </div>
              <div className="mb-6">
                <label className="block text-gray-600 text-sm font-medium mb-2">Amount (Tk)</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500" required />
              </div>
              <button type="submit" className={`w-full py-3.5 text-white rounded-xl font-bold transition ${isPayExpenseMonth ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-800 hover:bg-slate-700'}`}>
                {isPayExpenseMonth ? 'Pay Expense' : 'Save Expense'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {payModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full sm:w-96 rounded-t-2xl sm:rounded-xl p-6 transform transition-all animate-bounce-up shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800">Mark as Paid</h3>
              <button onClick={() => setPayModalOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Total Due: <span className="font-bold text-slate-700">₹{total}</span></p>
            <form onSubmit={handleTogglePaid}>
              <div className="mb-6">
                <label className="block text-gray-600 text-sm font-medium mb-2">Amount You're Giving (₹)</label>
                <input type="number" min={0} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" required />
                <p className="text-xs text-slate-400 mt-2">Giving more? We'll remind you to collect the change. Giving less? The shortfall carries over to next month's bill.</p>
              </div>
              <button type="submit" className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition">Confirm Payment</button>
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
        <Building className="w-8 h-8 text-indigo-500 mr-2" />
        FLAT EXPENSE
      </h1>
    </div>
  );
}
