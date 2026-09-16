import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, History as HistoryIcon, Printer, AlertTriangle, Search, SearchX, FileText, FileDown, Check, Coins, X } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api';
import { useFlash } from '../context/FlashContext';

export default function History() {
  const showFlash = useFlash();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('monthly');
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [searchResults, setSearchResults] = useState(null); // null = not searching
  const [payTarget, setPayTarget] = useState(null); // {docId, total}
  const [amountPaid, setAmountPaid] = useState('');

  function load() {
    api.get('/api/history').then(setData).catch((err) => showFlash(err.message, 'danger'));
  }

  useEffect(load, []);

  if (!data) {
    return (
      <Layout headerContent={<HeaderTitle />}>
        <p className="text-center text-slate-500">Loading...</p>
      </Layout>
    );
  }

  const { history, grand_total_paid, monthly_payment_status, current_month_num, yearly_reports, current_year_preview_data, current_year_grand_total, current_year_for_preview, unpaid_past_records, filter_years } = data;

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    const params = new URLSearchParams({ q: searchTerm, year: yearFilter });
    const res = await fetch(`/search_history?${params}`, { credentials: 'include' });
    setSearchResults(await res.json());
  }

  function clearSearch() {
    setSearchResults(null);
    setSearchTerm('');
  }

  function openPayModal(docId, total) {
    setPayTarget({ docId, total });
    setAmountPaid(String(total));
  }

  async function handlePay(e) {
    e.preventDefault();
    try {
      const res = await api.post(`/api/history/pay/${payTarget.docId}`, { amount_paid: Number(amountPaid) });
      if (res.change_due > 0) {
        showFlash(`Payment successful! You should get back ₹${res.change_due} as change.`);
      } else if (res.due_amount > 0) {
        showFlash(`Paid ₹${amountPaid}. ₹${res.due_amount} is still due — it'll be added to next month's bill.`, 'warning');
      } else {
        showFlash('Payment was successful!');
      }
      setPayTarget(null);
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  async function handleConfirmChangeReceived(item) {
    if (!window.confirm(`Have you actually received ₹${item.record.change_due} back? Only confirm once the money is really in your hand.`)) return;
    try {
      await api.post(`/api/flat_expense/confirm_change_received/${item.id}`);
      showFlash(`₹${item.record.change_due} change marked as received!`);
      load();
    } catch (err) {
      showFlash(err.message, 'danger');
    }
  }

  return (
    <Layout headerContent={<HeaderTitle />}>
      {/* Tab Buttons */}
      <div className="mb-6 border-b border-slate-200/80 dark:border-slate-700">
        <nav className="flex -mb-px" aria-label="Tabs">
          <button onClick={() => setTab('monthly')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${tab === 'monthly' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300'}`}>
            Monthly View
          </button>
          <button onClick={() => setTab('yearly')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ml-8 ${tab === 'yearly' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300'}`}>
            Yearly Reports
          </button>
        </nav>
      </div>

      {tab === 'monthly' && (
        <div>
          {unpaid_past_records.length > 0 && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-4 mb-6 rounded-r-lg shadow-sm">
              <div className="flex items-center mb-2">
                <AlertTriangle className="w-6 h-6 text-rose-500 mr-2" />
                <div>
                  <h3 className="text-rose-800 font-bold text-sm">Action Required: Past Year Dues</h3>
                  <p className="text-rose-600 text-xs">These months are pending from previous years.</p>
                </div>
              </div>
              <div className="pl-8 grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                {unpaid_past_records.map((item) => (
                  <div key={item.id} className="flex items-center justify-between bg-white/60 p-2 rounded border border-rose-100">
                    <span className="text-sm font-bold text-slate-700">{item.record.month_name} {item.record.year}</span>
                    <button type="button" onClick={() => openPayModal(item.id, item.total)} className="bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold px-3 py-1.5 rounded transition shadow-sm">
                      Pay ₹{item.total}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults === null ? (
            <>
              <form onSubmit={handleSearch} className="glass-card p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-8">
                    <label className="text-xs font-bold text-slate-500 uppercase">Search Expenses</label>
                    <div className="relative mt-1">
                      <input
                        type="search"
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); if (searchResults !== null) setSearchResults(null); }}
                        placeholder="Search by reason, amount, or month..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white/60 border border-slate-200/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center">
                        <Search className="w-5 h-5 text-slate-400" />
                      </div>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Filter by Year</label>
                    <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="w-full mt-1 pl-3 pr-8 py-2.5 bg-white/60 border border-slate-200/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="all">All Years</option>
                      {filter_years.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </div>
                  <button type="submit" className="md:col-span-2 w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold text-sm shadow-sm hover:bg-indigo-700 transition flex items-center justify-center">
                    <Search className="w-5 h-5 mr-2" /> Search
                  </button>
                </div>
              </form>

              <div className="glass-card p-4 mb-6">
                <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3 text-center">Current Year Payment Status</h3>
                <div className="grid grid-cols-6 md:grid-cols-12 gap-2 md:gap-3 payment-grid">
                  {monthly_payment_status.map((m, i) => (
                    <div key={m.name} className={`month-block ${m.is_paid ? 'paid' : 'unpaid'} ${i + 1 === current_month_num ? 'current' : ''}`} title={`${m.name} - ${m.is_paid ? 'Paid' : 'Unpaid'}`}>
                      <span className="font-bold text-xs">{m.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse responsive-table">
                    <thead>
                      <tr className="text-xs text-slate-500 uppercase font-semibold tracking-wider border-b border-slate-200/50">
                        <th className="px-6 py-4">Period</th>
                        <th className="px-6 py-4 text-center">Status</th>
                        <th className="px-6 py-4 text-center">Items</th>
                        <th className="px-6 py-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {history.map((item) => (
                        <tr key={item.id} className="history-row hover:bg-white/40 transition">
                          <td className="px-6 py-4" data-label="Period">
                            <p className="font-bold text-slate-800">{item.record.month_name || 'N/A'}</p>
                            <p className="text-xs text-slate-400">{item.record.year || '----'}</p>
                          </td>
                          <td className="px-6 py-4 text-center" data-label="Status">
                            {item.record.is_paid ? (
                              <div className="flex flex-col items-center gap-2">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">Paid</span>
                                {item.record.paid_date && <span className="text-[10px] text-gray-500 mt-1 font-medium">{item.record.paid_date}</span>}
                                {item.record.change_due > 0 && (
                                  item.record.change_received ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                                      <Check className="w-3 h-3 mr-1" /> ₹{item.record.change_due} Change Received
                                    </span>
                                  ) : (
                                    <button onClick={() => handleConfirmChangeReceived(item)} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition">
                                      <Coins className="w-3 h-3 mr-1" /> ₹{item.record.change_due} Due Back
                                    </button>
                                  )
                                )}
                                {item.record.due_amount > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-200" title="Added to next month's bill">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> ₹{item.record.due_amount} Short
                                  </span>
                                )}
                              </div>
                            ) : (
                              <button type="button" onClick={() => openPayModal(item.id, item.total)} className="pay-now-btn bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold text-xs shadow-sm hover:bg-indigo-700 transition">
                                Pay Now
                              </button>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 text-center align-top" data-label="Items">
                            <div className="flex flex-col gap-3 items-center">
                              {(item.record.expenses || []).map((expense, i) => (
                                <div key={i} className="flex flex-col items-center">
                                  <span className="font-medium text-slate-700">{expense.reason}</span>
                                  <span className="text-[10px] text-slate-500 bg-slate-100 px-2 rounded-full mt-0.5">₹{expense.amount}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-slate-800 align-top" data-label="Total">₹{item.total}</td>
                        </tr>
                      ))}
                      <tr className="bg-white/30 border-t-2 border-slate-200/50 total-row">
                        <td className="px-6 py-4 font-bold text-slate-700 uppercase tracking-wider" colSpan={3}>Grand Total (Paid)</td>
                        <td className="px-6 py-4 text-right font-extrabold text-slate-900 text-lg">₹{grand_total_paid}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-700">Search Results</h2>
                <button onClick={clearSearch} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">&times; Clear Search</button>
              </div>
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-xs text-slate-500 uppercase font-semibold tracking-wider border-b border-slate-200/50">
                        <th className="px-6 py-4">Expense Reason</th>
                        <th className="px-6 py-4 text-right">Amount</th>
                        <th className="px-6 py-4">Period</th>
                        <th className="px-6 py-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {searchResults.map((r, i) => (
                        <tr key={i} className="hover:bg-white/40 transition">
                          <td className="px-6 py-4 font-medium text-slate-800">{r.reason}</td>
                          <td className="px-6 py-4 text-right font-semibold text-slate-700">₹{r.amount}</td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-700 text-sm">{r.month_name}</p>
                            <p className="text-xs text-slate-400">{r.year}</p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {r.is_paid ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">Paid</span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-200">Unpaid</span>
                              )}
                              {r.paid_date && <span className="text-[10px] text-gray-500">{r.paid_date}</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {searchResults.length === 0 && (
                    <div className="text-center py-12">
                      <SearchX className="w-16 h-16 text-slate-300 mb-4 mx-auto" />
                      <p className="font-bold text-slate-600">No Results Found</p>
                      <p className="text-sm text-slate-400">Try a different search term or filter.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'yearly' && (
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-4">Generated Yearly Reports</h2>
          {yearly_reports.length > 0 ? (
            <ul className="divide-y divide-slate-200/80 dark:divide-slate-700">
              {yearly_reports.map((report) => (
                <li key={report.year} className="py-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <FileText className="w-8 h-8 text-indigo-500 mr-4" />
                    <div>
                      <p className="font-bold text-slate-800">Expense Report - {report.year}</p>
                      <p className="text-xs text-slate-500">Generated on: {report.generated_at ? new Date(report.generated_at).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </div>
                  <a href={report.pdf_url} target="_blank" rel="noreferrer" className="glass-btn-secondary px-4 py-2 rounded-lg font-semibold text-xs flex items-center">
                    <FileDown className="w-5 h-5 text-indigo-500 mr-2" /> View PDF
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div>
              <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-6">No reports generated yet. Below is a live preview for the current year.</p>
              <div className="border border-slate-200/80 dark:border-slate-700 rounded-lg p-4">
                <h3 className="text-center font-bold text-slate-800 dark:text-slate-200 text-lg mb-4">YEAR {current_year_for_preview} (PREVIEW)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-xs text-slate-500 uppercase font-semibold tracking-wider border-b border-slate-200/80 dark:border-slate-700">
                        <th className="py-3 pr-3">Month</th>
                        <th className="py-3 px-3">Ticks / Description</th>
                        <th className="py-3 px-3 text-right">Amount</th>
                        <th className="py-3 pl-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 dark:divide-slate-700 text-sm">
                      {current_year_preview_data.map((row) => (
                        <tr key={row.month_name}>
                          <td className="py-3 pr-3 font-semibold text-slate-600 dark:text-slate-300">{row.month_name}</td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-400 whitespace-pre-line">{row.ticks}</td>
                          <td className="py-3 px-3 text-right font-medium text-slate-700 dark:text-slate-300">{row.amounts}</td>
                          <td className={`py-3 pl-3 text-center font-bold ${row.status === 'PAID' ? 'text-emerald-600 dark:text-emerald-400' : row.status === 'UNPAID' ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300/80 dark:border-slate-600">
                        <td colSpan={2} className="pt-3 text-right font-bold text-slate-800 dark:text-slate-200">CURRENT GRAND TOTAL (PAID)</td>
                        <td className="pt-3 text-right font-bold text-slate-800 dark:text-slate-200">₹{current_year_grand_total}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {payTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full sm:w-96 rounded-t-2xl sm:rounded-xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800">Mark as Paid</h3>
              <button type="button" onClick={() => setPayTarget(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Total Due: <span className="font-bold text-slate-700">₹{payTarget.total}</span></p>
            <form onSubmit={handlePay}>
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
      <Link to="/flat_expense" className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-black/5 transition border border-gray-200 mr-4">
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <h1 className="font-bold text-lg sm:text-xl tracking-tight text-slate-700 flex items-center">
        <HistoryIcon className="w-6 h-6 text-slate-500 mr-2" />
        Payment History
      </h1>
      <button onClick={() => window.print()} className="w-10 h-10 rounded-full text-slate-500 hover:bg-black/5 flex items-center justify-center transition ml-auto" title="Print History">
        <Printer className="w-6 h-6" />
      </button>
    </div>
  );
}
