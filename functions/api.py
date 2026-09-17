"""
JSON API for the React frontend (client/). Additive only — every route here is a
thin wrapper around the exact same helper functions the existing Jinja routes in
app.py already use, so business logic and Firestore schema stay identical to the
server-rendered app. Nothing in app.py is modified by this file.
"""
import calendar
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from firebase_admin import firestore

# Injected by app.py after it finishes defining everything (see bottom of app.py).
# Not imported directly here: when app.py is run as the entrypoint (`python app.py`)
# it loads as module '__main__', so `import app` from inside api.py would load a
# SECOND, separate copy of app.py from scratch and re-trigger this same import —
# a circular import. Injecting the already-loaded module avoids that entirely.
core = None

api_bp = Blueprint('api', __name__)


# --- Current user ---
@api_bp.route('/me')
@login_required
def api_me():
    return jsonify({
        'id': current_user.id,
        'name': current_user.name,
        'email': current_user.email,
        'profile_pic': current_user.profile_pic,
    })


# --- Flat Expense ---
@api_bp.route('/flat_expense')
@login_required
def api_flat_expense():
    core.ensure_past_months(current_user.id)
    record, _ = core.get_or_create_record(current_user.id)
    doc_id, _, _, _ = core.get_current_month_id()

    total_amount = sum(item['amount'] for item in record.get('expenses', []))

    current_year = core.get_ist_now().year
    year_docs = core.db.collection('users').document(current_user.id).collection('expenses').where('year', '==', current_year).stream()

    puja_added = False
    lift_added = False
    for doc in year_docs:
        data = doc.to_dict()
        expenses = data.get('expenses', [])
        if not puja_added and any(item['reason'] == "Durga Puja Chada" for item in expenses):
            puja_added = True
        if not lift_added and any(item['reason'] == "Yearly Lift Maintenance" for item in expenses):
            lift_added = True

    all_months_docs = core.db.collection('users').document(current_user.id).collection('expenses').stream()
    paid_status_map = {doc.id: doc.to_dict().get('is_paid', False) for doc in all_months_docs}

    return jsonify({
        'record': record,
        'total': total_amount,
        'puja_added': puja_added,
        'lift_added': lift_added,
        'paid_status_map': paid_status_map,
        'doc_id': doc_id,
    })


@api_bp.route('/flat_expense/add_expense', methods=['POST'])
@login_required
def api_add_expense():
    data = request.get_json(silent=True) or {}
    reason = data.get('reason')
    amount = data.get('amount')
    month_input = data.get('month')  # "YYYY-MM"

    if month_input:
        try:
            year, month = map(int, month_input.split('-'))
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid month format selected.'}), 400
        doc_id = f"{year}_{month}"
        doc_ref = core.db.collection('users').document(current_user.id).collection('expenses').document(doc_id)
        doc = doc_ref.get()
        if doc.exists:
            record = doc.to_dict()
        else:
            record = {
                'year': year, 'month': month, 'month_name': calendar.month_name[month],
                'is_paid': False, 'paid_date': None,
                'amount_paid': None, 'change_due': 0, 'change_received': False, 'change_received_date': None,
                'due_amount': 0,
                'expenses': [],
            }
            doc_ref.set(record)
    else:
        record, doc_ref = core.get_or_create_record(current_user.id)

    if not reason or amount is None:
        return jsonify({'status': 'error', 'message': 'Reason and amount are required.'}), 400

    new_expense = {
        'id': str(core.uuid.uuid4()),
        'reason': reason,
        'amount': int(amount),
        'is_fixed': False,
        'date': core.get_ist_now().strftime("%Y-%m-%d"),
    }
    doc_ref.update({'expenses': firestore.ArrayUnion([new_expense])})
    return jsonify({'status': 'success', 'was_paid': bool(record.get('is_paid'))})


@api_bp.route('/flat_expense/add_puja', methods=['POST'])
@login_required
def api_add_puja():
    current_year = core.get_ist_now().year
    year_docs = core.db.collection('users').document(current_user.id).collection('expenses').where('year', '==', current_year).stream()
    for doc in year_docs:
        if any(item['reason'] == "Durga Puja Chada" for item in doc.to_dict().get('expenses', [])):
            return jsonify({'status': 'error', 'message': 'Durga Puja is already added for this year.'}), 400

    record, doc_ref = core.get_or_create_record(current_user.id)
    if record.get('is_paid'):
        return jsonify({'status': 'error', 'message': 'Cannot add Puja expense to a month that has already been paid.'}), 400

    puja_expense = {
        'id': str(core.uuid.uuid4()), 'reason': "Durga Puja Chada", 'amount': 500,
        'is_fixed': False, 'date': core.get_ist_now().strftime("%Y-%m-%d"),
    }
    doc_ref.update({'expenses': firestore.ArrayUnion([puja_expense])})
    return jsonify({'status': 'success'})


@api_bp.route('/flat_expense/add_lift', methods=['POST'])
@login_required
def api_add_lift():
    current_year = core.get_ist_now().year
    year_docs = core.db.collection('users').document(current_user.id).collection('expenses').where('year', '==', current_year).stream()
    for doc in year_docs:
        if any(item['reason'] == "Yearly Lift Maintenance" for item in doc.to_dict().get('expenses', [])):
            return jsonify({'status': 'error', 'message': 'Lift Maintenance is already added for this year.'}), 400

    record, doc_ref = core.get_or_create_record(current_user.id)
    if record.get('is_paid'):
        return jsonify({'status': 'error', 'message': 'Cannot add Lift expense to a month that has already been paid.'}), 400

    lift_expense = {
        'id': str(core.uuid.uuid4()), 'reason': "Yearly Lift Maintenance", 'amount': 1000,
        'is_fixed': True, 'date': core.get_ist_now().strftime("%Y-%m-%d"),
    }
    doc_ref.update({'expenses': firestore.ArrayUnion([lift_expense])})
    return jsonify({'status': 'success'})


@api_bp.route('/flat_expense/delete/<string:expense_id>', methods=['POST'])
@login_required
def api_delete_expense(expense_id):
    record, doc_ref = core.get_or_create_record(current_user.id)
    expenses = record.get('expenses', [])
    expense_to_remove = next((exp for exp in expenses if exp.get('id') == expense_id), None)

    if record.get('is_paid') and expense_to_remove and expense_to_remove.get('reason') == 'Monthly Maintenance':
        return jsonify({'status': 'error', 'message': 'Cannot delete Monthly Maintenance from a paid month.'}), 400

    if expense_to_remove and expense_to_remove.get('reason') != 'Monthly Maintenance':
        doc_ref.update({'expenses': firestore.ArrayRemove([expense_to_remove])})
        return jsonify({'status': 'success'})

    return jsonify({'status': 'error', 'message': 'Expense not found or cannot be deleted.'}), 400


@api_bp.route('/flat_expense/toggle_paid', methods=['POST'])
@login_required
def api_toggle_paid():
    record, doc_ref = core.get_or_create_record(current_user.id)

    if not record.get('is_paid'):
        data = request.get_json(silent=True) or {}
        total_amount = sum(item['amount'] for item in record.get('expenses', []))
        try:
            amount_paid = int(data.get('amount_paid'))
        except (TypeError, ValueError):
            return jsonify({'status': 'error', 'message': 'Please enter a valid amount to mark this month as paid.'}), 400

        if amount_paid < 0:
            return jsonify({'status': 'error', 'message': 'Amount cannot be negative.'}), 400

        change_due = max(0, amount_paid - total_amount)
        due_amount = max(0, total_amount - amount_paid)
        doc_ref.update({
            'is_paid': True,
            'paid_date': core.get_ist_now().strftime("%d/%m/%Y %I:%M %p"),
            'amount_paid': amount_paid,
            'change_due': change_due,
            'change_received': False,
            'change_received_date': None,
            'due_amount': due_amount,
        })
        return jsonify({'status': 'success', 'change_due': change_due, 'due_amount': due_amount})

    doc_ref.update({
        'is_paid': False, 'paid_date': None,
        'amount_paid': None, 'change_due': 0, 'change_received': False, 'change_received_date': None,
        'due_amount': 0,
    })
    return jsonify({'status': 'success'})


@api_bp.route('/flat_expense/confirm_change_received/<string:doc_id>', methods=['POST'])
@login_required
def api_confirm_change_received(doc_id):
    doc_ref = core.db.collection('users').document(current_user.id).collection('expenses').document(doc_id)
    doc = doc_ref.get()
    if doc.exists:
        data = doc.to_dict()
        if data.get('change_due', 0) > 0 and not data.get('change_received'):
            doc_ref.update({
                'change_received': True,
                'change_received_date': core.get_ist_now().strftime("%d/%m/%Y %I:%M %p"),
            })
            return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Nothing to confirm.'}), 400


# --- History ---
@api_bp.route('/history')
@login_required
def api_history():
    docs = core.db.collection('users').document(current_user.id).collection('expenses').stream()

    history_data = []
    grand_total_paid = 0
    unpaid_past_records = []

    reports_docs = core.db.collection('users').document(current_user.id).collection('yearly_reports').order_by('year', direction=firestore.Query.DESCENDING).stream()
    yearly_reports = []
    for doc in reports_docs:
        d = doc.to_dict()
        generated_at = d.get('generated_at')
        yearly_reports.append({
            'year': d.get('year'),
            'pdf_url': d.get('pdf_url'),
            'generated_at': generated_at.isoformat() if hasattr(generated_at, 'isoformat') else None,
        })

    now = core.get_ist_now()
    current_year = now.year
    current_month_num = now.month
    current_year_paid_status = {m: False for m in range(1, 13)}

    for doc in docs:
        data = doc.to_dict()
        total = sum(item['amount'] for item in data.get('expenses', []))
        item_obj = {'id': doc.id, 'record': data, 'total': total}
        history_data.append(item_obj)

        if data.get('is_paid'):
            grand_total_paid += total
            if data.get('year') == current_year:
                month = data.get('month')
                if month:
                    current_year_paid_status[month] = True
        else:
            if data.get('year', 0) < current_year:
                unpaid_past_records.append(item_obj)

    month_names = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    monthly_payment_status = [{'name': month_names[i - 1], 'is_paid': current_year_paid_status[i]} for i in range(1, 13)]

    history_data.sort(key=lambda x: (x.get('record', {}).get('year', 0), x.get('record', {}).get('month', 0)), reverse=True)
    filter_years = sorted(list(set(item['record'].get('year') for item in history_data if item['record'].get('year'))), reverse=True)

    current_year_preview_data = []
    current_year_grand_total = 0
    report_for_current_year_exists = any(report['year'] == current_year for report in yearly_reports)

    if not report_for_current_year_exists:
        monthly_data_preview = {item['record'].get('month'): item['record'] for item in history_data if item['record'].get('year') == current_year}
        for m in range(1, 13):
            month_name = calendar.month_name[m].upper()
            record = monthly_data_preview.get(m)
            row_data = {'month_name': month_name, 'ticks': "-", 'amounts': "-", 'status': "N/A"}
            if record:
                if record.get('is_paid'):
                    expenses = record.get('expenses', [])
                    ticks = "\n".join([f"- {exp['reason']} (₹{exp['amount']})" for exp in expenses])
                    total = sum(exp['amount'] for exp in expenses)
                    current_year_grand_total += total
                    row_data.update({'ticks': ticks, 'amounts': f"₹{total}", 'status': "PAID"})
                else:
                    row_data['status'] = "UNPAID"
            current_year_preview_data.append(row_data)

    return jsonify({
        'history': history_data,
        'grand_total_paid': grand_total_paid,
        'monthly_payment_status': monthly_payment_status,
        'current_month_num': current_month_num,
        'yearly_reports': yearly_reports,
        'current_year_preview_data': current_year_preview_data,
        'current_year_grand_total': current_year_grand_total,
        'current_year_for_preview': current_year,
        'unpaid_past_records': unpaid_past_records,
        'filter_years': filter_years,
    })


@api_bp.route('/history/pay/<string:doc_id>', methods=['POST'])
@login_required
def api_pay_month(doc_id):
    doc_ref = core.db.collection('users').document(current_user.id).collection('expenses').document(doc_id)
    doc = doc_ref.get()
    if not doc.exists:
        return jsonify({'status': 'error', 'message': 'Record not found.'}), 404

    data = doc.to_dict()
    total_amount = sum(item.get('amount', 0) for item in data.get('expenses', []))
    body = request.get_json(silent=True) or {}
    try:
        amount_paid = int(body.get('amount_paid'))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'Please enter a valid amount.'}), 400

    if amount_paid < 0:
        return jsonify({'status': 'error', 'message': 'Amount cannot be negative.'}), 400

    change_due = max(0, amount_paid - total_amount)
    due_amount = max(0, total_amount - amount_paid)
    doc_ref.update({
        'is_paid': True,
        'paid_date': core.get_ist_now().strftime("%d/%m/%Y %I:%M %p"),
        'amount_paid': amount_paid,
        'change_due': change_due,
        'change_received': False,
        'change_received_date': None,
        'due_amount': due_amount,
    })

    try:
        year_to_check = int(doc_id.split('_')[0])
        core.check_and_generate_report(current_user.id, year_to_check)
    except (ValueError, IndexError):
        pass

    return jsonify({'status': 'success', 'change_due': change_due, 'due_amount': due_amount})


@api_bp.route('/history/unpay/<string:doc_id>', methods=['POST'])
@login_required
def api_unpay_month(doc_id):
    doc_ref = core.db.collection('users').document(current_user.id).collection('expenses').document(doc_id)
    doc = doc_ref.get()
    if doc.exists:
        doc_ref.update({
            'is_paid': False, 'paid_date': None,
            'amount_paid': None, 'change_due': 0, 'change_received': False, 'change_received_date': None,
            'due_amount': 0,
        })
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Record not found.'}), 404


# --- Newspaper Tracker ---
@api_bp.route('/newspaper')
@login_required
def api_newspaper():
    record = core.get_or_create_newspaper_record(current_user.id)
    year = record['year']
    month = record['month']
    today = core.get_ist_now()

    cal = calendar.Calendar()
    cal.setfirstweekday(calendar.SUNDAY)
    month_days = cal.monthdayscalendar(year, month)
    month_name = core.datetime(year, month, 1).strftime("%B")

    taken_sundays = 0
    taken_weekdays = 0
    missed_days = 0
    num_days_in_month = calendar.monthrange(year, month)[1]

    for day_num in range(1, num_days_in_month + 1):
        day_str = str(day_num)
        is_taken = record.get('days_taken', {}).get(day_str, False)
        try:
            day_date = core.datetime(year, month, day_num)
            if is_taken:
                if day_date.weekday() == 6:
                    taken_sundays += 1
                else:
                    taken_weekdays += 1
            elif day_date.date() < today.date():
                missed_days += 1
        except ValueError:
            continue

    return jsonify({
        'record': record,
        'month_days': month_days,
        'month_name': month_name,
        'year': year,
        'today': today.strftime('%Y-%m-%d'),
        'taken_sundays': taken_sundays,
        'taken_weekdays': taken_weekdays,
        'missed_days': missed_days,
    })


@api_bp.route('/newspaper/toggle/<string:day_str>', methods=['POST'])
@login_required
def api_toggle_newspaper_day(day_str):
    try:
        date_obj = core.datetime.strptime(day_str, '%Y-%m-%d')
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format.'}), 400

    doc_id = f"{date_obj.year}_{date_obj.month}"
    doc_ref = core.db.collection('users').document(current_user.id).collection('newspaper_tracker').document(doc_id)
    doc = doc_ref.get()
    if not doc.exists:
        num_days = calendar.monthrange(date_obj.year, date_obj.month)[1]
        record = {
            'year': date_obj.year, 'month': date_obj.month,
            'days_taken': {str(d): False for d in range(1, num_days + 1)},
            'extra_papers': {str(d): 0 for d in range(1, num_days + 1)},
            'total_amount': 0,
        }
        doc_ref.set(record)
    else:
        record = doc.to_dict()

    day_key = str(date_obj.day)
    new_status = not record.get('days_taken', {}).get(day_key, False)
    record['days_taken'][day_key] = new_status
    extra_papers = record.get('extra_papers', {})
    new_total = core.calculate_newspaper_total(date_obj.year, date_obj.month, record['days_taken'], extra_papers)
    doc_ref.update({f'days_taken.{day_key}': new_status, 'total_amount': new_total})

    return jsonify({'status': 'success', 'is_taken': new_status, 'total_amount': new_total})


@api_bp.route('/newspaper/add_extra', methods=['POST'])
@login_required
def api_add_extra_newspaper():
    body = request.get_json(silent=True) or {}
    day_str = body.get('date')
    try:
        date_obj = core.datetime.strptime(day_str, '%Y-%m-%d')
        extra_amount = int(body.get('amount', 0))
    except (ValueError, TypeError):
        return jsonify({'status': 'error', 'message': 'Invalid date format.'}), 400

    doc_id = f"{date_obj.year}_{date_obj.month}"
    doc_ref = core.db.collection('users').document(current_user.id).collection('newspaper_tracker').document(doc_id)
    doc = doc_ref.get()

    if not doc.exists:
        num_days = calendar.monthrange(date_obj.year, date_obj.month)[1]
        days_taken = {str(d): False for d in range(1, num_days + 1)}
        extra_papers = {str(d): 0 for d in range(1, num_days + 1)}
        extra_papers[str(date_obj.day)] = extra_amount
        record = {
            'year': date_obj.year, 'month': date_obj.month,
            'days_taken': days_taken, 'extra_papers': extra_papers,
            'total_amount': core.calculate_newspaper_total(date_obj.year, date_obj.month, days_taken, extra_papers),
        }
        doc_ref.set(record)
        new_total = record['total_amount']
        new_extra = extra_amount
    else:
        record = doc.to_dict()
        extra_papers = record.get('extra_papers', {})
        day_key = str(date_obj.day)
        current_extra = int(extra_papers.get(day_key, 0))
        new_extra = current_extra + extra_amount
        extra_papers[day_key] = new_extra
        new_total = core.calculate_newspaper_total(date_obj.year, date_obj.month, record.get('days_taken', {}), extra_papers)
        doc_ref.update({f'extra_papers.{day_key}': new_extra, 'total_amount': new_total})

    return jsonify({'status': 'success', 'extra_amount': new_extra, 'total_amount': new_total})


@api_bp.route('/newspaper/reset_extra/<string:day_str>', methods=['POST'])
@login_required
def api_reset_extra_newspaper(day_str):
    try:
        date_obj = core.datetime.strptime(day_str, '%Y-%m-%d')
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format.'}), 400

    doc_id = f"{date_obj.year}_{date_obj.month}"
    doc_ref = core.db.collection('users').document(current_user.id).collection('newspaper_tracker').document(doc_id)
    doc = doc_ref.get()
    if doc.exists:
        record = doc.to_dict()
        extra_papers = record.get('extra_papers', {})
        day_key = str(date_obj.day)
        extra_papers[day_key] = 0
        new_total = core.calculate_newspaper_total(date_obj.year, date_obj.month, record.get('days_taken', {}), extra_papers)
        doc_ref.update({f'extra_papers.{day_key}': 0, 'total_amount': new_total})
        return jsonify({'status': 'success', 'total_amount': new_total})

    return jsonify({'status': 'error', 'message': 'Record not found.'}), 404


@api_bp.route('/newspaper/history')
@login_required
def api_newspaper_history():
    docs = core.db.collection('users').document(current_user.id).collection('newspaper_tracker').stream()

    history = []
    cal = calendar.Calendar()
    cal.setfirstweekday(calendar.SUNDAY)

    today = core.get_ist_now()
    current_year = today.year
    current_month = today.month

    for doc in docs:
        data = doc.to_dict()
        month_num = data.get('month')
        year_num = data.get('year')
        if month_num and year_num:
            data['month_name'] = core.datetime(year_num, month_num, 1).strftime('%B')
            data['calendar_grid'] = cal.monthdayscalendar(year_num, month_num)

            is_editable = False
            if year_num == current_year and month_num == current_month:
                is_editable = True
            elif year_num == current_year and month_num == current_month - 1:
                is_editable = True
            elif current_month == 1 and year_num == current_year - 1 and month_num == 12:
                is_editable = True
            data['is_editable'] = is_editable

        history.append(data)

    history.sort(key=lambda x: (x.get('year', 0), x.get('month', 0)), reverse=True)
    grand_total = sum(item.get('total_amount', 0) for item in history)

    return jsonify({'history': history, 'grand_total': grand_total})


# --- Gas Cylinder Tracker ---
@api_bp.route('/gas')
@login_required
def api_gas():
    active, _ = core.get_active_gas_cylinder(current_user.id)
    pending_order, _ = core.get_pending_gas_order(current_user.id)
    today_str = core.get_ist_now().strftime('%Y-%m-%d')
    is_check_due = bool(active and active.get('next_check_date', '9999-99-99') <= today_str)

    days_until_rebook = 0
    if active and not pending_order:
        reference_date = active.get('installed_date') or active['booked_date']
        today_dt = core.datetime.strptime(today_str, '%Y-%m-%d')
        ref_dt = core.datetime.strptime(reference_date, '%Y-%m-%d')
        days_since = (today_dt - ref_dt).days
        days_until_rebook = max(0, core.GAS_MIN_REBOOK_DAYS - days_since)

    docs = core.db.collection('users').document(current_user.id).collection('gas_cylinders') \
        .order_by('booked_date', direction=firestore.Query.DESCENDING).stream()
    history = []
    total_expense = 0
    for doc in docs:
        d = doc.to_dict()
        d['id'] = doc.id
        d['days_lasted'] = None
        # "Lasted" counts from when the cylinder actually went into use, not
        # from when it was booked — those can be days apart.
        start_date = d.get('installed_date') or d.get('booked_date')
        if d.get('status') == 'finished' and d.get('finished_date') and start_date:
            try:
                b = core.datetime.strptime(start_date, '%Y-%m-%d')
                f = core.datetime.strptime(d['finished_date'], '%Y-%m-%d')
                d['days_lasted'] = (f - b).days
            except ValueError:
                pass
        total_expense += d.get('price', 0)
        history.append(d)

    return jsonify({
        'active': active,
        'pending_order': pending_order,
        'is_check_due': is_check_due,
        'days_until_rebook': days_until_rebook,
        'history': history,
        'total_expense': total_expense,
        'default_price': core.get_last_gas_price(current_user.id),
    })


@api_bp.route('/gas/book', methods=['POST'])
@login_required
def api_gas_book():
    data = request.get_json(silent=True) or {}
    try:
        price = int(data.get('price'))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'Please enter a valid price.'}), 400
    if price <= 0:
        return jsonify({'status': 'error', 'message': 'Price must be greater than 0.'}), 400

    booking_code = (data.get('booking_code') or '').strip() or None
    if booking_code and (not booking_code.isdigit() or len(booking_code) != 4):
        return jsonify({'status': 'error', 'message': 'Booking code must be exactly 4 digits.'}), 400

    expected_delivery_date = (data.get('expected_delivery_date') or '').strip() or None
    if expected_delivery_date:
        try:
            core.datetime.strptime(expected_delivery_date, '%Y-%m-%d')
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid expected delivery date.'}), 400

    pending_order, _ = core.get_pending_gas_order(current_user.id)
    if pending_order:
        return jsonify({'status': 'error', 'message': 'A cylinder is already booked and waiting to be marked as installed.'}), 400

    active, _ = core.get_active_gas_cylinder(current_user.id)
    if active:
        reference_date = active.get('installed_date') or active['booked_date']
        today_dt = core.datetime.strptime(core.get_ist_now().strftime('%Y-%m-%d'), '%Y-%m-%d')
        ref_dt = core.datetime.strptime(reference_date, '%Y-%m-%d')
        days_since = (today_dt - ref_dt).days
        if days_since < core.GAS_MIN_REBOOK_DAYS:
            remaining = core.GAS_MIN_REBOOK_DAYS - days_since
            return jsonify({
                'status': 'error',
                'message': f"Distributor rule: a new cylinder can only be booked {core.GAS_MIN_REBOOK_DAYS}+ days after the last one — {remaining} day(s) left.",
            }), 400

    core.book_gas_cylinder(current_user.id, price, booking_code, expected_delivery_date)
    return jsonify({'status': 'success'})


@api_bp.route('/gas/update_order', methods=['POST'])
@login_required
def api_gas_update_order():
    data = request.get_json(silent=True) or {}

    booking_code = (data.get('booking_code') or '').strip() or None
    if booking_code and (not booking_code.isdigit() or len(booking_code) != 4):
        return jsonify({'status': 'error', 'message': 'Booking code must be exactly 4 digits.'}), 400

    expected_delivery_date = (data.get('expected_delivery_date') or '').strip() or None
    if expected_delivery_date:
        try:
            core.datetime.strptime(expected_delivery_date, '%Y-%m-%d')
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid expected delivery date.'}), 400

    updated = core.update_pending_gas_order(current_user.id, booking_code, expected_delivery_date)
    if updated is None:
        return jsonify({'status': 'error', 'message': 'No booked cylinder waiting to be installed.'}), 400
    return jsonify({'status': 'success'})


@api_bp.route('/gas/install', methods=['POST'])
@login_required
def api_gas_install():
    installed_date = core.install_gas_cylinder(current_user.id)
    if installed_date is None:
        return jsonify({'status': 'error', 'message': 'No booked cylinder waiting to be installed.'}), 400
    return jsonify({'status': 'success', 'installed_date': installed_date})


@api_bp.route('/gas/snooze', methods=['POST'])
@login_required
def api_gas_snooze():
    next_check = core.snooze_gas_checkin(current_user.id)
    if next_check is None:
        return jsonify({'status': 'error', 'message': 'No active cylinder to check in on.'}), 400
    return jsonify({'status': 'success', 'next_check_date': next_check})


# --- Public share view (no auth) ---
@api_bp.route('/shared/report/<token>')
def api_shared_newspaper(token):
    user_id, year, month, token_salt = core.decode_share_token(token)
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Invalid or expired link.'}), 400

    doc_id = f"{year}_{month}"
    doc_ref = core.db.collection('users').document(user_id).collection('newspaper_tracker').document(doc_id)
    doc = doc_ref.get()
    if not doc.exists:
        return jsonify({'status': 'error', 'message': 'Report not found or has been deleted.'}), 404

    record = doc.to_dict()
    db_salt = record.get('share_salt')
    if not db_salt or db_salt != token_salt:
        return jsonify({'status': 'error', 'message': 'This link has expired because a new share link was generated.'}), 400

    today = core.get_ist_now()
    cal = calendar.Calendar()
    cal.setfirstweekday(calendar.SUNDAY)
    month_days = cal.monthdayscalendar(year, month)
    month_name = calendar.month_name[month]

    taken_sundays = 0
    taken_weekdays = 0
    missed_days = 0
    num_days_in_month = calendar.monthrange(year, month)[1]

    for day_num in range(1, num_days_in_month + 1):
        day_str = str(day_num)
        is_taken = record.get('days_taken', {}).get(day_str, False)
        try:
            day_date = core.datetime(year, month, day_num)
            if is_taken:
                if day_date.weekday() == 6:
                    taken_sundays += 1
                else:
                    taken_weekdays += 1
            elif day_date.date() < today.date():
                missed_days += 1
        except ValueError:
            continue

    total_extra = sum(int(amt) for amt in record.get('extra_papers', {}).values())
    sunday_cost = taken_sundays * 7
    weekday_cost = taken_weekdays * 6

    return jsonify({
        'record': record, 'month_days': month_days, 'month_name': month_name, 'year': year,
        'today': today.strftime('%Y-%m-%d'),
        'taken_sundays': taken_sundays, 'taken_weekdays': taken_weekdays, 'missed_days': missed_days,
        'sunday_cost': sunday_cost, 'weekday_cost': weekday_cost, 'total_extra': total_extra,
    })
