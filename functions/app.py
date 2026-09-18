import os
import uuid, json
import calendar
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, abort
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.exceptions import BadRequest
import firebase_admin
from firebase_admin import credentials, firestore, auth, exceptions, storage
from datetime import datetime, timezone, timedelta
from fpdf import FPDF
from apscheduler.schedulers.background import BackgroundScheduler
from firebase_admin import messaging
from itsdangerous import URLSafeSerializer


app = Flask(__name__)
app.config['SECRET_KEY'] = 'supersecretkey'
app.config['SESSION_COOKIE_NAME'] = '__session'

# Define Indian Standard Time (IST)
IST = timezone(timedelta(hours=5, minutes=30))

def get_ist_now():
    return datetime.now(IST)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.unauthorized_handler
def unauthorized():
    # JSON API clients (React app, native Android app) get a clean 401 instead
    # of being redirected to an HTML login page. Server-rendered pages keep
    # the original redirect-to-/login behavior, unchanged.
    if request.path.startswith('/api/'):
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401
    return redirect(url_for('login'))

# --- Firebase Initialization ---
db = None
init_error = None  # To store the specific error message

def init_firebase():
    """
    Initializes Firebase Admin SDK and Firestore client lazily.
    This prevents deployment timeouts and ensures the app only tries to connect
    when it's actually handling a request.
    """
    global db, init_error
    # Do nothing if already initialized
    if db is not None:
        return

    try:
        # The SDK is smart. It will use service account credentials in a deployed
        # environment (Cloud Functions, Cloud Run) automatically.
        # We only need to initialize it once.
        if not firebase_admin._apps:
            print("Initializing Firebase Admin SDK...")
            storage_bucket_url = 'expensemanagement-178bf.appspot.com'
            # Check for Local Environment first (Testing on your PC)
            if os.path.exists("serviceAccountKey.json"):
                cred = credentials.Certificate("serviceAccountKey.json")
                firebase_admin.initialize_app(cred, {'storageBucket': storage_bucket_url})
            else:
                # Cloud Environment (Production)
                firebase_admin.initialize_app(options={'storageBucket': storage_bucket_url})
        
        # Let the library automatically detect the project ID from credentials
        db = firestore.client()
        print("Firebase Admin SDK initialized successfully. Firestore client is available.")
    except Exception as e:
        # If ANY error occurs during initialization, we catch it here.
        # This is most likely a permissions issue in the cloud environment.
        print(f"--- FATAL FIREBASE INITIALIZATION ERROR ---")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Details: {e}")
        print(f"-------------------------------------------")
        init_error = f"{type(e).__name__}: {e}"
        db = None

@app.before_request
def check_db_connection():
    """
    This function runs before every request. It ensures that the
    Firebase connection is established. If it fails, it stops the
    request and returns a detailed error.
    """
    # Ignore Firebase's internal requests during deployment.
    if request.path.startswith('/__/'):
        return

    # If db is not initialized, try to initialize it.
    if db is None:
        init_firebase()
        
    # If after trying, db is STILL None, it means init_firebase() failed.
    if db is None:
        # This message will be visible in the browser console.
        error_description = (
            "The server could not connect to the database. "
            "This is usually due to a permissions issue with the service account in Google Cloud. "
            f"Specific Error: {init_error}"
        )
        print(f"Aborting request. Reason: {error_description}")
        abort(500, description=error_description)

@app.before_request
def authenticate_bearer_token():
    """
    Lets non-browser clients (the native Android app) authenticate without a
    session cookie: if the request carries `Authorization: Bearer <firebase-id-token>`,
    verify it the same way /authorize does and log that user in for this request.
    Browser/React traffic never sends this header, so this is purely additive.
    """
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return

    id_token = auth_header[len('Bearer '):]
    try:
        decoded_token = auth.verify_id_token(id_token)
        user = load_user(decoded_token['uid'])
        if user:
            login_user(user)
    except Exception as e:
        print(f"Bearer token authentication failed: {e}")

# --- Custom Error Handler ---
@app.errorhandler(500)
def handle_500(e):
    """Return a JSON response for internal server errors to be parsed by the client."""
    # The description comes from our abort() call in check_db_connection
    original_description = getattr(e, 'description', 'An internal server error occurred on the server.')
    response = {
        "status": "error",
        "message": original_description
    }
    return jsonify(response), 500

# --- PDF Generation ---
def generate_yearly_report(user_id, year):
    """Fetches data for a given year, generates a PDF report, and uploads it to Storage."""
    print(f"Starting PDF generation for year {year} for user {user_id}...")
    # 1. Fetch and organize data
    docs_ref = db.collection('users').document(user_id).collection('expenses')
    monthly_data = {}
    for m in range(1, 13):
        doc = docs_ref.document(f"{year}_{m}").get()
        if doc.exists:
            monthly_data[m] = doc.to_dict()

    # 2. Prepare data for the table
    table_data = [
        ("MONTH", "TICKS / DESCRIPTION", "AMOUNTS", "STATUS"),
    ]
    grand_total = 0
    
    for m in range(1, 13):
        month_name = calendar.month_name[m].upper()
        record = monthly_data.get(m)
        
        if record and record.get('is_paid'):
            expenses = record.get('expenses', [])
            ticks = "\n".join([f"- {exp['reason']} (₹{exp['amount']})" for exp in expenses])
            total = sum(exp['amount'] for exp in expenses)
            grand_total += total
            amounts = f"₹{total}"
            status = "PAID"
            table_data.append((month_name, ticks, amounts, status))
        else:
            # Append even if unpaid/non-existent to maintain 12 rows
            table_data.append((month_name, "-", "-", "UNPAID" if record else "N/A"))

    # 3. Generate PDF using FPDF2
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", "B", 16)
    pdf.cell(0, 10, f"YEARLY EXPENSE REPORT: {year}", ln=True, align="C")
    pdf.ln(10)

    pdf.set_font("helvetica", size=9)
    with pdf.table(col_widths=(30, 85, 25, 25), text_align=("LEFT", "LEFT", "RIGHT", "CENTER")) as table:
        for data_row in table_data:
            row = table.row()
            for datum in data_row:
                row.cell(datum)
    
    pdf.set_font("helvetica", "B", 12)
    pdf.cell(0, 15, f"GRAND TOTAL: ₹{grand_total}", ln=True, align="R")

    # 4. Upload PDF to Firebase Storage
    pdf_bytes = pdf.output()
    bucket = storage.bucket()
    blob = bucket.blob(f'users/{user_id}/reports/yearly_expense_{year}.pdf')
    blob.upload_from_string(pdf_bytes, content_type='application/pdf')
    blob.make_public()
    pdf_url = blob.public_url
    
    # 5. Save the URL in Firestore
    report_doc_ref = db.collection('users').document(user_id).collection('yearly_reports').document(str(year))
    report_doc_ref.set({'year': year, 'pdf_url': pdf_url, 'generated_at': firestore.SERVER_TIMESTAMP})
    print(f"Successfully generated and saved report for {year}. URL: {pdf_url}")

def check_and_generate_report(user_id, year):
    """Checks if all 12 months of a year are paid and triggers PDF generation."""
    print(f"Checking completion for year {year} for user {user_id}...")
    docs_ref = db.collection('users').document(user_id).collection('expenses')
    
    paid_months = 0
    for m in range(1, 13):
        doc = docs_ref.document(f"{year}_{m}").get()
        if doc.exists and doc.to_dict().get('is_paid') is True:
            paid_months += 1
    
    print(f"Found {paid_months} paid months for {year}.")
    if paid_months == 12:
        print(f"All 12 months for {year} are paid. Generating report...")
        generate_yearly_report(user_id, year)
        flash(f"Congratulations! Report for {year} has been generated.", "info")

# --- User Authentication ---
class User(UserMixin):
    def __init__(self, id, name, email, profile_pic):
        self.id = id
        self.name = name
        self.email = email
        self.profile_pic = profile_pic

@login_manager.user_loader
def load_user(user_id):
    if db is None:
        init_firebase()
        
    if db is None:
        return None
        
    user_doc = db.collection('users').document(user_id).get()
    if user_doc.exists:
        user_data = user_doc.to_dict()
        return User(id=user_id, name=user_data.get('name'), email=user_data.get('email'), profile_pic=user_data.get('profile_pic'))
    return None

@app.context_processor
def inject_now():
    return {'now': get_ist_now}

# --- Helper Functions ---
def get_current_month_id():
    """Returns unique ID like '2026_3' for March 2026"""
    today = get_ist_now()
    return f"{today.year}_{today.month}", today.year, today.month, today.strftime("%B")

def get_carried_due(user_id, year, month):
    """Returns the unpaid shortfall (if any) from the previous month, so it
    can be added as a line item on the new month's bill."""
    prev_month = month - 1
    prev_year = year
    if prev_month == 0:
        prev_month = 12
        prev_year -= 1
    prev_doc = db.collection('users').document(user_id).collection('expenses').document(f"{prev_year}_{prev_month}").get()
    if prev_doc.exists:
        return prev_doc.to_dict().get('due_amount', 0)
    return 0

def build_month_expenses(user_id, year, month):
    """Base 'Monthly Maintenance' line, plus any shortfall carried over from
    last month's underpayment."""
    expenses = [
        {'id': str(uuid.uuid4()), 'reason': 'Monthly Maintenance', 'amount': 485, 'is_fixed': True}
    ]
    carried_due = get_carried_due(user_id, year, month)
    if carried_due > 0:
        expenses.append({'id': str(uuid.uuid4()), 'reason': 'Previous Month Due', 'amount': carried_due, 'is_fixed': True})
    return expenses

def get_or_create_record(user_id):
    """Gets or creates the expense record for a specific user for the current month."""
    doc_id, year, month, month_name = get_current_month_id()

    doc_ref = db.collection('users').document(user_id).collection('expenses').document(doc_id)
    doc = doc_ref.get()

    if not doc.exists:
        # Create new month data
        data = {
            'year': year,
            'month': month,
            'month_name': month_name,
            'is_paid': False,
            'paid_date': None,
            'amount_paid': None,
            'change_due': 0,
            'change_received': False,
            'change_received_date': None,
            'due_amount': 0,
            'expenses': build_month_expenses(user_id, year, month)
        }

        doc_ref.set(data)
        return data, doc_ref
    
    # পুরনো ডাটা ঠিক করা (যাদের ID নেই তাদের ID দেওয়া)
    data = doc.to_dict()
    expenses = data.get('expenses', [])
    updated = False
    for expense in expenses:
        if 'id' not in expense:
            expense['id'] = str(uuid.uuid4())
            updated = True
            
    if updated:
        doc_ref.update({'expenses': expenses})
        
    return data, doc_ref

def ensure_past_months(user_id):
    """Ensures records exist from January to current month of current year"""
    today = get_ist_now()
    current_year = today.year
    current_month = today.month
    
    for m in range(1, current_month + 1):
        doc_id = f"{current_year}_{m}"
        doc_ref = db.collection('users').document(user_id).collection('expenses').document(doc_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            month_date = datetime(current_year, m, 1)
            month_name = month_date.strftime("%B")
            
            data = {
                'year': current_year,
                'month': m,
                'month_name': month_name,
                'is_paid': False,
                'paid_date': None,
                'amount_paid': None,
                'change_due': 0,
                'change_received': False,
                'change_received_date': None,
                'due_amount': 0,
                'expenses': build_month_expenses(user_id, current_year, m)
            }
            doc_ref.set(data)

# --- Newspaper Helper Functions ---
def get_or_create_newspaper_record(user_id):
    doc_id, year, month, _ = get_current_month_id()
    doc_ref = db.collection('users').document(user_id).collection('newspaper_tracker').document(doc_id)
    doc = doc_ref.get()

    num_days = calendar.monthrange(year, month)[1]

    if not doc.exists:
        # Create a map for all days, initialized to False
        days_taken = {str(day): False for day in range(1, num_days + 1)}
        extra_papers = {str(day): 0 for day in range(1, num_days + 1)}
        data = {
            'year': year,
            'month': month,
            'days_taken': days_taken,
            'extra_papers': extra_papers,
            'total_amount': 0
        }
        doc_ref.set(data)
        return data

    data = doc.to_dict()
    if 'extra_papers' not in data:
        data['extra_papers'] = {str(day): 0 for day in range(1, num_days + 1)}
        doc_ref.update({'extra_papers': data['extra_papers']})
        
    return data

def calculate_newspaper_total(year, month, days_taken, extra_papers=None):
    if extra_papers is None:
        extra_papers = {}
    total = 0
    for day, taken in days_taken.items():
        if taken:
            date_obj = datetime(year, month, int(day))
            # weekday() -> Monday is 0 and Sunday is 6
            if date_obj.weekday() == 6: # Sunday
                total += 7
            else:
                total += 6
        total += int(extra_papers.get(str(day), 0))
    return total

# --- Gas Cylinder Helper Functions ---
# A cylinder typically lasts 1 month 10-15 days; we start checking in at the
# shorter end so an unfinished cylinder just gets asked again in 5 days,
# rather than risking asking late.
GAS_CHECK_IN_AFTER_DAYS = 40
GAS_RECHECK_INTERVAL_DAYS = 5
GAS_DEFAULT_PRICE = 986
# Distributor rule: a new cylinder can't be booked until at least this many
# days have passed since the last booking.
GAS_MIN_REBOOK_DAYS = 15

def get_active_gas_cylinder(user_id):
    """Returns (data, doc_ref) for the cylinder currently connected and in
    use, or (None, None)."""
    docs = db.collection('users').document(user_id).collection('gas_cylinders') \
        .where('status', '==', 'active').limit(1).stream()
    doc = next(docs, None)
    if doc:
        return doc.to_dict(), doc.reference
    return None, None

def get_pending_gas_order(user_id):
    """Returns (data, doc_ref) for a cylinder that's been booked with the
    distributor but hasn't been delivered yet, or (None, None)."""
    docs = db.collection('users').document(user_id).collection('gas_cylinders') \
        .where('status', '==', 'ordered').limit(1).stream()
    doc = next(docs, None)
    if doc:
        return doc.to_dict(), doc.reference
    return None, None

def get_stored_gas_cylinder(user_id):
    """Returns (data, doc_ref) for a cylinder that's been delivered and is
    sitting at home as a spare — full, but not yet connected — or
    (None, None)."""
    docs = db.collection('users').document(user_id).collection('gas_cylinders') \
        .where('status', '==', 'stored').limit(1).stream()
    doc = next(docs, None)
    if doc:
        return doc.to_dict(), doc.reference
    return None, None

def get_last_gas_cylinder(user_id):
    """The most recently booked cylinder overall, regardless of status —
    used for the distributor's minimum-days-between-bookings rule, which is
    about order frequency, not about whichever cylinder happens to be
    active right now."""
    docs = db.collection('users').document(user_id).collection('gas_cylinders') \
        .order_by('booked_date', direction=firestore.Query.DESCENDING).limit(1).stream()
    doc = next(docs, None)
    return doc.to_dict() if doc else None

def get_last_gas_price(user_id):
    """Most recently used cylinder price, for pre-filling the booking form."""
    last = get_last_gas_cylinder(user_id)
    return last.get('price', GAS_DEFAULT_PRICE) if last else GAS_DEFAULT_PRICE

def book_gas_cylinder(user_id, price):
    """Places an order for a new cylinder with the distributor. Always
    starts as 'ordered' — booking never touches whatever's currently active
    or already sitting in storage; the caller is responsible for only
    allowing one order/spare in the pipeline at a time."""
    today_str = get_ist_now().strftime('%Y-%m-%d')
    new_doc = {
        'booked_date': today_str,
        'received_date': None,      # when it was delivered (became 'stored')
        'installed_date': None,     # when it was actually connected (became 'active')
        'price': price,
        'status': 'ordered',
        'finished_date': None,
        'next_check_date': None,
        'last_notified_date': None,
        'delivery_code': None,
        'created_at': firestore.SERVER_TIMESTAMP,
    }
    db.collection('users').document(user_id).collection('gas_cylinders').add(new_doc)
    return new_doc

def add_existing_active_gas_cylinder(user_id, price, booked_date, received_date, installed_date):
    """Registers a cylinder that was already connected and in use before the
    user started tracking it in this app — most people have gas running
    already when they first open this page, they didn't just book it
    through here. Skips the ordered -> stored pipeline entirely and goes
    straight to active. The three dates can genuinely differ (booked one
    day, delivered the next, installed later still, once the previous
    cylinder actually ran out) — the check-in clock starts from
    installed_date, not from today or from booked_date."""
    installed_dt = datetime.strptime(installed_date, '%Y-%m-%d')
    next_check = (installed_dt + timedelta(days=GAS_CHECK_IN_AFTER_DAYS)).strftime('%Y-%m-%d')
    new_doc = {
        'booked_date': booked_date,
        'received_date': received_date,
        'installed_date': installed_date,
        'price': price,
        'status': 'active',
        'finished_date': None,
        'next_check_date': next_check,
        'last_notified_date': None,
        'delivery_code': None,
        'created_at': firestore.SERVER_TIMESTAMP,
    }
    db.collection('users').document(user_id).collection('gas_cylinders').add(new_doc)
    return new_doc

def mark_gas_delivered(user_id):
    """Confirms the ordered cylinder has arrived — it becomes a stored
    spare, full but not connected. Whatever's currently active (if
    anything) keeps running untouched; this cylinder just waits its turn."""
    pending_data, pending_ref = get_pending_gas_order(user_id)
    if pending_ref is None:
        return False
    today_str = get_ist_now().strftime('%Y-%m-%d')
    pending_ref.update({'status': 'stored', 'received_date': today_str})
    return True

def install_stored_gas_cylinder(user_id):
    """The active cylinder has run out (or nothing was connected yet):
    finishes off whatever was active, if anything, and connects the stored
    spare in its place, starting its own ~40-day check-in clock from now —
    not from whenever it was booked or delivered."""
    stored_data, stored_ref = get_stored_gas_cylinder(user_id)
    if stored_ref is None:
        return False

    today = get_ist_now()
    today_str = today.strftime('%Y-%m-%d')

    active_data, active_ref = get_active_gas_cylinder(user_id)
    if active_ref:
        active_ref.update({'status': 'finished', 'finished_date': today_str})

    next_check = (today + timedelta(days=GAS_CHECK_IN_AFTER_DAYS)).strftime('%Y-%m-%d')
    stored_ref.update({'status': 'active', 'installed_date': today_str, 'next_check_date': next_check})
    return True

def snooze_gas_checkin(user_id):
    """User said the current cylinder hasn't run out yet — ask again in 5 days."""
    active_data, active_ref = get_active_gas_cylinder(user_id)
    if not active_ref:
        return None
    next_check = (get_ist_now() + timedelta(days=GAS_RECHECK_INTERVAL_DAYS)).strftime('%Y-%m-%d')
    active_ref.update({'next_check_date': next_check, 'last_notified_date': None})
    return next_check

def set_gas_delivery_code(user_id, code):
    """The distributor's SMS verification code, given to the delivery
    person to confirm the right customer — only relevant to a cylinder
    that's been ordered but not delivered yet."""
    pending_data, pending_ref = get_pending_gas_order(user_id)
    if not pending_ref:
        return False
    pending_ref.update({'delivery_code': code})
    return True

# --- Routes ---
@app.route('/')
def root():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/login')
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return render_template('login.html')

@app.route('/authorize', methods=['POST'])
def authorize():
    try:
        # Ensure the request is JSON and has content
        json_data = request.get_json()
        if not json_data:
            raise BadRequest("No JSON data received.")
        
        id_token = json_data.get('token')
        if not id_token:
            raise BadRequest("No token found in request.")

        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        
        user_ref = db.collection('users').document(uid)
        if not user_ref.get().exists:
            # New user, create a document
            user_ref.set({
                'name': decoded_token.get('name'),
                'email': decoded_token.get('email'),
                'profile_pic': decoded_token.get('picture')
            })
        
        user = load_user(uid)
        
        # Handle case where database connection failed or user creation failed
        if user is None:
            raise Exception("Failed to load user from database. Please try again.")
            
        login_user(user)
        return jsonify({"status": "success"}), 200
    except BadRequest as e:
        print(f"Bad Request during authorization: {e}. Body: {request.get_data(as_text=True)}")
        return jsonify({"status": "error", "message": f"Invalid request: {e}"}), 400
    except Exception as e:
        print(f"Authorization error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 401

@app.route('/flat_expense')
@login_required
def flat_expense():
    ensure_past_months(current_user.id)
    record, _ = get_or_create_record(current_user.id)
    doc_id, _, _, _ = get_current_month_id()

    # Calculate Total
    total_amount = sum(item['amount'] for item in record.get('expenses', []))
    
    # --- Logic Updated: Check GLOBAL yearly status ---
    current_year = get_ist_now().year
    year_docs = db.collection('users').document(current_user.id).collection('expenses').where('year', '==', current_year).stream()
    
    puja_added = False
    lift_added = False
    
    for doc in year_docs:
        data = doc.to_dict()
        expenses = data.get('expenses', [])
        if not puja_added and any(item['reason'] == "Durga Puja Chada" for item in expenses):
            puja_added = True
        if not lift_added and any(item['reason'] == "Yearly Lift Maintenance" for item in expenses):
            lift_added = True

    # Get paid status of all months to update modal button dynamically
    all_months_docs = db.collection('users').document(current_user.id).collection('expenses').stream()
    paid_status_map = {doc.id: doc.to_dict().get('is_paid', False) for doc in all_months_docs}

    return render_template('flat_expense.html', record=record, total=total_amount, puja_added=puja_added, lift_added=lift_added, paid_status_map=paid_status_map, doc_id=doc_id)

@app.route('/add_expense', methods=['POST'])
@login_required
def add_expense():
    reason = request.form.get('reason')
    amount = request.form.get('amount')
    month_input = request.form.get('month')

    if month_input:
        try:
            year, month = map(int, month_input.split('-'))
            doc_id = f"{year}_{month}"
            doc_ref = db.collection('users').document(current_user.id).collection('expenses').document(doc_id)
            doc = doc_ref.get()
            
            if doc.exists:
                record = doc.to_dict()
            else:
                # Create record if it doesn't exist (e.g. past month)
                record = {
                    'year': year,
                    'month': month,
                    'month_name': calendar.month_name[month],
                    'is_paid': False,
                    'paid_date': None,
                    'amount_paid': None,
                    'change_due': 0,
                    'change_received': False,
                    'change_received_date': None,
                    'due_amount': 0,
                    'expenses': []
                }
                doc_ref.set(record)
        except ValueError:
            flash('Invalid month format selected.', 'danger')
            return redirect(url_for('flat_expense'))
    else:
        # Default to current month if no month selected
        record, doc_ref = get_or_create_record(current_user.id)

    if reason and amount:
        new_expense = {
            'id': str(uuid.uuid4()),
            'reason': reason,
            'amount': int(amount),
            'is_fixed': False,
            'date': get_ist_now().strftime("%Y-%m-%d")
        }
        doc_ref.update({
            'expenses': firestore.ArrayUnion([new_expense])
        })
        
        if record.get('is_paid'):
            flash(f'Extra expense added to {record.get("month_name")} (Note: Month is marked as Paid).', 'success')
        else:
            flash('Expense added successfully.', 'success')
    
    return redirect(url_for('flat_expense'))

@app.route('/add_puja')
@login_required
def add_puja():
    # Global Year Check: Prevent adding if already exists in current year
    current_year = get_ist_now().year
    year_docs = db.collection('users').document(current_user.id).collection('expenses').where('year', '==', current_year).stream()
    for doc in year_docs:
        if any(item['reason'] == "Durga Puja Chada" for item in doc.to_dict().get('expenses', [])):
            flash('Durga Puja is already added for this year.', 'warning')
            return redirect(url_for('flat_expense'))

    record, doc_ref = get_or_create_record(current_user.id)
    
    if record.get('is_paid'):
        flash('Cannot add Puja expense to a month that has already been paid.', 'warning')
        return redirect(url_for('flat_expense'))

    puja_expense = {
        'id': str(uuid.uuid4()),
        'reason': "Durga Puja Chada",
        'amount': 500,
        'is_fixed': False,
        'date': get_ist_now().strftime("%Y-%m-%d")
    }
    doc_ref.update({
        'expenses': firestore.ArrayUnion([puja_expense]),
    })
    flash('Durga Puja added!', 'success')
    
    return redirect(url_for('flat_expense'))

@app.route('/add_lift')
@login_required
def add_lift():
    # Global Year Check: Prevent adding if already exists in current year
    current_year = get_ist_now().year
    year_docs = db.collection('users').document(current_user.id).collection('expenses').where('year', '==', current_year).stream()
    for doc in year_docs:
        if any(item['reason'] == "Yearly Lift Maintenance" for item in doc.to_dict().get('expenses', [])):
            flash('Lift Maintenance is already added for this year.', 'warning')
            return redirect(url_for('flat_expense'))

    record, doc_ref = get_or_create_record(current_user.id)
    
    if record.get('is_paid'):
        flash('Cannot add Lift expense to a month that has already been paid.', 'warning')
        return redirect(url_for('flat_expense'))

    lift_expense = {
        'id': str(uuid.uuid4()),
        'reason': "Yearly Lift Maintenance",
        'amount': 1000,
        'is_fixed': True,
        'date': get_ist_now().strftime("%Y-%m-%d")
    }
    doc_ref.update({
        'expenses': firestore.ArrayUnion([lift_expense]),
    })
    flash('Lift Maintenance added!', 'success')
    
    return redirect(url_for('flat_expense'))

@app.route('/delete/<string:expense_id>')
@login_required
def delete_expense(expense_id):
    record, doc_ref = get_or_create_record(current_user.id)
    
    expenses = record.get('expenses', [])
    
    # Find the exact expense object to remove
    expense_to_remove = next((exp for exp in expenses if exp.get('id') == expense_id), None)

    # Security Check: Cannot delete Monthly Maintenance if paid (allow others)
    if record.get('is_paid') and expense_to_remove and expense_to_remove.get('reason') == 'Monthly Maintenance':
        flash('Cannot delete Monthly Maintenance from a paid month.', 'warning')
        return redirect(url_for('flat_expense'))
    
    # Ensure the found expense is not the fixed 'Monthly Maintenance'
    if expense_to_remove and expense_to_remove.get('reason') != 'Monthly Maintenance':
        # Use ArrayRemove for an atomic and more efficient deletion
        doc_ref.update({
            'expenses': firestore.ArrayRemove([expense_to_remove])
        })
        flash('Expense deleted successfully!', 'success')
    
    return redirect(url_for('flat_expense'))

@app.route('/toggle_paid', methods=['GET', 'POST'])
@login_required
def toggle_paid():
    record, doc_ref = get_or_create_record(current_user.id)

    if not record.get('is_paid'):
        total_amount = sum(item['amount'] for item in record.get('expenses', []))

        try:
            amount_paid = int(request.form.get('amount_paid', ''))
        except (TypeError, ValueError):
            flash('Please enter a valid amount to mark this month as paid.', 'danger')
            return redirect(url_for('flat_expense'))

        if amount_paid < 0:
            flash('Amount cannot be negative.', 'danger')
            return redirect(url_for('flat_expense'))

        change_due = max(0, amount_paid - total_amount)
        due_amount = max(0, total_amount - amount_paid)
        doc_ref.update({
            'is_paid': True,
            'paid_date': get_ist_now().strftime("%d/%m/%Y %I:%M %p"),
            'amount_paid': amount_paid,
            'change_due': change_due,
            'change_received': False,
            'change_received_date': None,
            'due_amount': due_amount
        })

        if change_due > 0:
            flash(f'Paid! You gave ₹{amount_paid} — you should get back ₹{change_due} as change.', 'success')
        elif due_amount > 0:
            flash(f'Paid ₹{amount_paid}. ₹{due_amount} is still due — it will be added to next month\'s bill.', 'warning')
        else:
            flash('Paid! Exact amount given, nothing to get back.', 'success')
    else:
        doc_ref.update({
            'is_paid': False,
            'paid_date': None,
            'amount_paid': None,
            'change_due': 0,
            'change_received': False,
            'change_received_date': None,
            'due_amount': 0
        })

    return redirect(url_for('flat_expense'))

@app.route('/pay/<string:doc_id>', methods=['POST'])
@login_required
def pay_month(doc_id):
    doc_ref = db.collection('users').document(current_user.id).collection('expenses').document(doc_id)
    doc = doc_ref.get()
    if doc.exists:
        data = doc.to_dict()
        total_amount = sum(item.get('amount', 0) for item in data.get('expenses', []))

        try:
            amount_paid = int(request.form.get('amount_paid', ''))
        except (TypeError, ValueError):
            flash('Please enter a valid amount.', 'danger')
            return redirect(url_for('history'))

        if amount_paid < 0:
            flash('Amount cannot be negative.', 'danger')
            return redirect(url_for('history'))

        change_due = max(0, amount_paid - total_amount)
        due_amount = max(0, total_amount - amount_paid)
        doc_ref.update({
            'is_paid': True,
            'paid_date': get_ist_now().strftime("%d/%m/%Y %I:%M %p"),
            'amount_paid': amount_paid,
            'change_due': change_due,
            'change_received': False,
            'change_received_date': None,
            'due_amount': due_amount
        })

        if change_due > 0:
            flash(f"Payment for {doc_id.replace('_', '/')} was successful! You should get back ₹{change_due} as change.", "success")
        elif due_amount > 0:
            flash(f"Payment for {doc_id.replace('_', '/')} recorded. ₹{due_amount} is still due — it will be added to next month's bill.", "warning")
        else:
            flash(f"Payment for month {doc_id.replace('_', '/')} was successful!", "success")

        # NEW: Check if the year is complete
        try:
            year_to_check = int(doc_id.split('_')[0])
            check_and_generate_report(current_user.id, year_to_check)
        except (ValueError, IndexError):
            print(f"Could not parse year from doc_id: {doc_id}")
    return redirect(url_for('history'))

@app.route('/unpay/<string:doc_id>')
@login_required
def unpay_month(doc_id):
    doc_ref = db.collection('users').document(current_user.id).collection('expenses').document(doc_id)
    doc = doc_ref.get()
    if doc.exists:
        doc_ref.update({
            'is_paid': False,
            'paid_date': None,
            'amount_paid': None,
            'change_due': 0,
            'change_received': False,
            'change_received_date': None,
            'due_amount': 0
        })
        flash(f"Payment for month {doc_id.replace('_', '/')} was reverted.", "success")
    return redirect(url_for('history'))

@app.route('/confirm_change_received/<string:doc_id>')
@login_required
def confirm_change_received(doc_id):
    doc_ref = db.collection('users').document(current_user.id).collection('expenses').document(doc_id)
    doc = doc_ref.get()
    if doc.exists:
        data = doc.to_dict()
        if data.get('change_due', 0) > 0 and not data.get('change_received'):
            doc_ref.update({
                'change_received': True,
                'change_received_date': get_ist_now().strftime("%d/%m/%Y %I:%M %p")
            })
            flash(f"₹{data.get('change_due')} change marked as received!", "success")

    next_page = request.args.get('next')
    if next_page == 'history':
        return redirect(url_for('history'))
    return redirect(url_for('flat_expense'))

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/history')
@login_required
def history():
    docs = db.collection('users').document(current_user.id).collection('expenses').stream()
    
    history_data = []
    grand_total_paid = 0
    unpaid_past_records = []  # List to store full objects of past dues

    # Fetch yearly reports
    reports_docs = db.collection('users').document(current_user.id).collection('yearly_reports').order_by('year', direction=firestore.Query.DESCENDING).stream()
    yearly_reports = [doc.to_dict() for doc in reports_docs]

    # --- New Logic for Monthly Status ---
    now = get_ist_now()
    current_year = now.year
    current_month_num = now.month
    # Initialize all months of the current year as unpaid
    current_year_paid_status = {m: False for m in range(1, 13)}

    for doc in docs:
        data = doc.to_dict()
        total = sum(item['amount'] for item in data.get('expenses', []))
        item_obj = {'id': doc.id, 'record': data, 'total': total}
        history_data.append(item_obj)

        # Add to grand total only if the month is paid
        if data.get('is_paid'):
            grand_total_paid += total

            # Check if the record is from the current year and update its paid status
            if data.get('year') == current_year:
                month = data.get('month')
                if month:
                    current_year_paid_status[month] = True
        else:
            # Check if this unpaid record belongs to a past year
            if data.get('year', 0) < current_year:
                unpaid_past_records.append(item_obj)
    
    # Create the list for the template
    monthly_payment_status = []
    month_names = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    for i in range(1, 13):
        monthly_payment_status.append({
            'name': month_names[i-1],
            'is_paid': current_year_paid_status[i]
        })

    # Sort by Year then Month (Descending) -> Newest items first
    history_data.sort(key=lambda x: (x.get('record', {}).get('year', 0), x.get('record', {}).get('month', 0)), reverse=True)

    # Get unique years for the filter dropdown
    filter_years = sorted(list(set(item['record'].get('year') for item in history_data if item['record'].get('year'))), reverse=True)

    # --- NEW LOGIC FOR DYNAMIC DEMO ---
    current_year_preview_data = []
    current_year_grand_total = 0
    
    # Check if a report for the current year already exists. If so, no need for a demo.
    report_for_current_year_exists = any(report['year'] == current_year for report in yearly_reports)

    if not report_for_current_year_exists:
        # Use the already fetched docs to build the preview
        monthly_data_preview = {item['record'].get('month'): item['record'] for item in history_data if item['record'].get('year') == current_year}

        for m in range(1, 13):
            month_name = calendar.month_name[m].upper()
            record = monthly_data_preview.get(m)
            
            row_data = {
                'month_name': month_name,
                'ticks': "-",
                'amounts': "-",
                'status': "N/A"
            }

            if record:
                if record.get('is_paid'):
                    expenses = record.get('expenses', [])
                    # Use whitespace-pre-line in HTML to render newlines
                    ticks = "\n".join([f"- {exp['reason']} (₹{exp['amount']})" for exp in expenses])
                    total = sum(exp['amount'] for exp in expenses)
                    current_year_grand_total += total
                    
                    row_data['ticks'] = ticks
                    row_data['amounts'] = f"₹{total}"
                    row_data['status'] = "PAID"
                else:
                    row_data['status'] = "UNPAID"
            
            current_year_preview_data.append(row_data)

    return render_template('history.html', history=history_data, grand_total_paid=grand_total_paid, 
                           monthly_payment_status=monthly_payment_status, current_month_num=current_month_num,
                           yearly_reports=yearly_reports,
                           current_year_preview_data=current_year_preview_data,
                           current_year_grand_total=current_year_grand_total,
                           current_year_for_preview=current_year,
                           unpaid_past_records=unpaid_past_records,
                           filter_years=filter_years)

@app.route('/search_history')
@login_required
def search_history():
    query = request.args.get('q', '').lower().strip()
    year_filter = request.args.get('year', 'all')

    if not query:
        return jsonify([])

    docs = list(db.collection('users').document(current_user.id).collection('expenses').stream())
    
    # Sort docs first to get a somewhat ordered result
    docs.sort(key=lambda x: (x.to_dict().get('year', 0), x.to_dict().get('month', 0)), reverse=True)

    results = []
    for doc in docs:
        data = doc.to_dict()
        
        doc_year = data.get('year')
        if year_filter != 'all':
            try:
                if str(doc_year) != str(year_filter):
                    continue
            except (ValueError, TypeError):
                continue

        for expense in data.get('expenses', []):
            search_haystack = [str(expense.get('reason', '')).lower(), str(expense.get('amount', '')).lower(), str(data.get('month_name', '')).lower()]
            
            if any(query in s for s in search_haystack):
                results.append({
                    'reason': expense.get('reason', 'N/A'),
                    'amount': expense.get('amount', 0),
                    'month_name': data.get('month_name', 'N/A'),
                    'year': data.get('year', '----'),
                    'is_paid': data.get('is_paid', False),
                    'paid_date': data.get('paid_date', None)
                })
                
    return jsonify(results)

@app.route('/save_fcm_token', methods=['POST'])
@login_required
def save_fcm_token():
    data = request.get_json()
    token = data.get('token')
    if token:
        user_ref = db.collection('users').document(current_user.id)
        # merge=True দিলে ইউজারের অন্য ডাটা ডিলিট না হয়ে শুধু টোকেনটি আপডেট হবে
        # fcm_tokens ekta list, jate ekjon user multiple device-e (mobile + desktop)
        # notification enable korle sob-koyta-tei push jay, age-r moto ekta token
        # arekta-ke overwrite na kore. ArrayUnion dile ekই token dubar add hobe na.
        user_ref.set({'fcm_tokens': firestore.ArrayUnion([token])}, merge=True)
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'No token provided'}), 400

@app.route('/api/unpaid_dues')
@login_required
def get_unpaid_dues():
    today = get_ist_now()
    current_year = today.year
    current_month = today.month
    
    docs = db.collection('users').document(current_user.id).collection('expenses').where('is_paid', '==', False).stream()
    
    unpaid_months = []
    for doc in docs:
        data = doc.to_dict()
        doc_year = data.get('year', 0)
        doc_month = data.get('month', 0)
        
        # Condition: Only past months (either past year OR past month of current year)
        if doc_year < current_year or (doc_year == current_year and doc_month < current_month):
            total = sum(item.get('amount', 0) for item in data.get('expenses', []))
            if total > 0:
                unpaid_months.append({
                    'id': doc.id,
                    'month_name': data.get('month_name', ''),
                    'year': doc_year,
                    'total': total
                })
                
    # Sort chronologically (oldest first)
    unpaid_months.sort(key=lambda x: (x['year'], int(x['id'].split('_')[1]) if '_' in x['id'] else 0))
    return jsonify(unpaid_months)

# --- Newspaper Tracker Routes ---
@app.route('/newspaper')
@login_required
def newspaper():
    record = get_or_create_newspaper_record(current_user.id)
    year = record['year']
    month = record['month']
    today = get_ist_now()

    # Get calendar data for rendering
    cal = calendar.Calendar()
    # Set first day to Sunday to match the template's headers
    cal.setfirstweekday(calendar.SUNDAY)
    month_days = cal.monthdayscalendar(year, month)

    month_name = datetime(year, month, 1).strftime("%B")

    # --- NEW: Calculate summary counts ---
    taken_sundays = 0
    taken_weekdays = 0
    missed_days = 0
    
    num_days_in_month = calendar.monthrange(year, month)[1]

    for day_num in range(1, num_days_in_month + 1):
        day_str = str(day_num)
        is_taken = record.get('days_taken', {}).get(day_str, False)
        
        try:
            day_date = datetime(year, month, day_num)
            
            if is_taken:
                if day_date.weekday() == 6: # Sunday
                    taken_sundays += 1
                else:
                    taken_weekdays += 1
            # A day is "missed" only if it's in the past and not taken
            elif day_date.date() < today.date():
                missed_days += 1

        except ValueError:
            # Handles cases like day 32 which shouldn't happen with monthrange
            continue

    return render_template('newspaper.html',
                           record=record,
                           month_days=month_days,
                           month_name=month_name,
                           year=year,
                           today=today, # Pass today to template
                           taken_sundays=taken_sundays,
                           taken_weekdays=taken_weekdays,
                           missed_days=missed_days)

@app.route('/newspaper/toggle/<string:day_str>')
@login_required
def toggle_newspaper_day(day_str):
    try:
        date_obj = datetime.strptime(day_str, '%Y-%m-%d')
    except ValueError:
        flash('Invalid date format.', 'danger')
        return redirect(url_for('newspaper'))

    doc_id = f"{date_obj.year}_{date_obj.month}"
    doc_ref = db.collection('users').document(current_user.id).collection('newspaper_tracker').document(doc_id)
    
    doc = doc_ref.get()
    if not doc.exists:
        num_days = calendar.monthrange(date_obj.year, date_obj.month)[1]
        days_taken = {str(day): False for day in range(1, num_days + 1)}
        extra_papers = {str(day): 0 for day in range(1, num_days + 1)}
        record = {
            'year': date_obj.year,
            'month': date_obj.month,
            'days_taken': days_taken,
            'extra_papers': extra_papers,
            'total_amount': 0
        }
        doc_ref.set(record)
    else:
        record = doc.to_dict()

    day_key = str(date_obj.day)
    current_status = record.get('days_taken', {}).get(day_key, False)
    new_status = not current_status
    
    record['days_taken'][day_key] = new_status
    extra_papers = record.get('extra_papers', {})
    new_total = calculate_newspaper_total(date_obj.year, date_obj.month, record['days_taken'], extra_papers)
    doc_ref.update({
        f'days_taken.{day_key}': new_status,
        'total_amount': new_total
    })

    next_page = request.args.get('next')
    if next_page == 'history':
        return redirect(url_for('newspaper_history'))
    return redirect(url_for('newspaper'))

@app.route('/newspaper/add_extra', methods=['POST'])
@login_required
def add_extra_newspaper():
    day_str = request.form.get('date')
    amount = request.form.get('amount', 0)
    
    try:
        date_obj = datetime.strptime(day_str, '%Y-%m-%d')
        extra_amount = int(amount)
    except ValueError:
        flash('Invalid date format.', 'danger')
        return redirect(url_for('newspaper'))

    doc_id = f"{date_obj.year}_{date_obj.month}"
    doc_ref = db.collection('users').document(current_user.id).collection('newspaper_tracker').document(doc_id)
    
    doc = doc_ref.get()
    if not doc.exists:
        num_days = calendar.monthrange(date_obj.year, date_obj.month)[1]
        days_taken = {str(day): False for day in range(1, num_days + 1)}
        extra_papers = {str(day): 0 for day in range(1, num_days + 1)}
        extra_papers[str(date_obj.day)] = extra_amount
        record = {
            'year': date_obj.year,
            'month': date_obj.month,
            'days_taken': days_taken,
            'extra_papers': extra_papers,
            'total_amount': calculate_newspaper_total(date_obj.year, date_obj.month, days_taken, extra_papers)
        }
        doc_ref.set(record)
    else:
        record = doc.to_dict()
        extra_papers = record.get('extra_papers', {})
        day_key = str(date_obj.day)
        
        current_extra = int(extra_papers.get(day_key, 0))
        extra_papers[day_key] = current_extra + extra_amount
        
        new_total = calculate_newspaper_total(date_obj.year, date_obj.month, record.get('days_taken', {}), extra_papers)
        doc_ref.update({
            f'extra_papers.{day_key}': current_extra + extra_amount,
            'total_amount': new_total
        })

    flash(f'Extra ₹{extra_amount} added for {date_obj.strftime("%d %B, %Y")}.', 'success')
    return redirect(url_for('newspaper'))

@app.route('/newspaper/reset_extra/<string:day_str>')
@login_required
def reset_extra_newspaper(day_str):
    try:
        date_obj = datetime.strptime(day_str, '%Y-%m-%d')
    except ValueError:
        flash('Invalid date format.', 'danger')
        return redirect(url_for('newspaper'))

    doc_id = f"{date_obj.year}_{date_obj.month}"
    doc_ref = db.collection('users').document(current_user.id).collection('newspaper_tracker').document(doc_id)
    
    doc = doc_ref.get()
    if doc.exists:
        record = doc.to_dict()
        extra_papers = record.get('extra_papers', {})
        day_key = str(date_obj.day)
        
        extra_papers[day_key] = 0
            
        new_total = calculate_newspaper_total(date_obj.year, date_obj.month, record.get('days_taken', {}), extra_papers)
        doc_ref.update({
            f'extra_papers.{day_key}': 0,
            'total_amount': new_total
        })
        flash(f'Extra price reset for {date_obj.strftime("%d %B, %Y")}.', 'info')

    next_page = request.args.get('next')
    if next_page == 'history':
        return redirect(url_for('newspaper_history'))
    return redirect(url_for('newspaper'))

@app.route('/newspaper/history')
@login_required
def newspaper_history():
    docs = db.collection('users').document(current_user.id).collection('newspaper_tracker').stream()
    
    history = []
    cal = calendar.Calendar()
    cal.setfirstweekday(calendar.SUNDAY)

    today = get_ist_now()
    current_year = today.year
    current_month = today.month

    for doc in docs:
        data = doc.to_dict()
        # Add month name for easy display in template
        month_num = data.get('month')
        year_num = data.get('year')
        if month_num and year_num:
            data['month_name'] = datetime(year_num, month_num, 1).strftime('%B')
            # Generate calendar grid for this specific month
            data['calendar_grid'] = cal.monthdayscalendar(year_num, month_num)
            
            # Determine if this month is editable (current month or immediate previous month)
            is_editable = False
            if year_num == current_year and month_num == current_month:
                is_editable = True
            elif year_num == current_year and month_num == current_month - 1:
                is_editable = True
            elif current_month == 1 and year_num == current_year - 1 and month_num == 12:
                is_editable = True
            data['is_editable'] = is_editable
            
        history.append(data)
        
    # Sort by year then month, descending
    history.sort(key=lambda x: (x.get('year', 0), x.get('month', 0)), reverse=True)
    
    grand_total = sum(item.get('total_amount', 0) for item in history)
    
    return render_template('newspaper_history.html', history=history, grand_total=grand_total)

def generate_share_token(user_id, year, month):
    s = URLSafeSerializer(app.config['SECRET_KEY'])
    salt = str(uuid.uuid4())
    
    # Save salt in Firestore to invalidate old links
    doc_id = f"{year}_{month}"
    doc_ref = db.collection('users').document(user_id).collection('newspaper_tracker').document(doc_id)
    doc_ref.set({'share_salt': salt}, merge=True)
    
    return s.dumps({'u': user_id, 'y': year, 'm': month, 'salt': salt})

def decode_share_token(token):
    s = URLSafeSerializer(app.config['SECRET_KEY'])
    try:
        data = s.loads(token)
        return data.get('u'), data.get('y'), data.get('m'), data.get('salt')
    except Exception:
        return None, None, None, None

@app.route('/api/generate_share_link/newspaper/<int:year>/<int:month>')
@login_required
def api_generate_share_link(year, month):
    token = generate_share_token(current_user.id, year, month)
    link = url_for('shared_newspaper_secure', token=token, _external=True)
    return jsonify({'link': link})

@app.route('/shared/report/<token>')
def shared_newspaper_secure(token):
    user_id, year, month, token_salt = decode_share_token(token)
    if not user_id:
        return "Invalid or expired link.", 400

    doc_id = f"{year}_{month}"
    doc_ref = db.collection('users').document(user_id).collection('newspaper_tracker').document(doc_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return "Report not found or has been deleted.", 404

    record = doc.to_dict()
    
    # Validate salt to ensure it's the latest generated link
    db_salt = record.get('share_salt')
    if not db_salt or db_salt != token_salt:
        return "This link has expired because a new share link was generated.", 400

    today = get_ist_now()

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
            day_date = datetime(year, month, day_num)
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

    return render_template('shared_newspaper.html', record=record, month_days=month_days, month_name=month_name, year=year, today=today, taken_sundays=taken_sundays, taken_weekdays=taken_weekdays, missed_days=missed_days, sunday_cost=sunday_cost, weekday_cost=weekday_cost, total_extra=total_extra)

# --- JSON API for the React frontend (client/) ---
# Registered here (not at the top of the file) so every helper/route above is
# already defined by the time it's injected into api.py. We inject a reference to
# this already-loaded module rather than having api.py `import app` itself, because
# when this file is run directly (`python app.py`) it loads as '__main__', not
# 'app' — a plain import from api.py would load a second copy of this file and
# recurse back into this exact line, causing a circular import.
import sys
import api as api_module
api_module.core = sys.modules[__name__]
app.register_blueprint(api_module.api_bp, url_prefix='/api')

def send_push_to_user(user_id, user_data, title, body):
    """Sends an FCM push notification to every device registered for a user,
    cleaning up any stale/invalid tokens it finds along the way."""
    fcm_tokens = list(user_data.get('fcm_tokens', []))
    legacy_token = user_data.get('fcm_token')
    if legacy_token and legacy_token not in fcm_tokens:
        fcm_tokens.append(legacy_token)

    if not fcm_tokens:
        return

    stale_tokens = []
    for fcm_token in fcm_tokens:
        try:
            message = messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                token=fcm_token,
            )
            response = messaging.send(message)
            print(f"Successfully sent push to {user_data.get('name')}: {response}")
        except exceptions.FirebaseError as e:
            print(f"Failed to send push to {user_data.get('name')} ({fcm_token[:12]}...): {e}")
            if getattr(e, 'code', None) in ('NOT_FOUND', 'UNREGISTERED', 'INVALID_ARGUMENT'):
                stale_tokens.append(fcm_token)

    if stale_tokens:
        update_payload = {'fcm_tokens': firestore.ArrayRemove(stale_tokens)}
        if legacy_token in stale_tokens:
            update_payload['fcm_token'] = firestore.DELETE_FIELD
        db.collection('users').document(user_id).update(update_payload)

def check_newspaper_and_alarm():
    """Scheduled job to check newspaper status and send alarms."""
    # app_context is needed for background tasks to access Flask's context
    with app.app_context():
        init_firebase()
        if db is None:
            return

        print(f"[{get_ist_now()}] Running newspaper alarm check...")

        today = get_ist_now()
        doc_id = f"{today.year}_{today.month}"
        day_key = str(today.day)

        users_ref = db.collection('users').stream()
        for user_doc in users_ref:
            user_id = user_doc.id
            user_data = user_doc.to_dict()

            if not user_data.get('fcm_tokens') and not user_data.get('fcm_token'):
                continue # Skip user if they don't have any notification token

            is_paper_taken = False # Default to False
            try:
                # Get the newspaper record for the current month
                newspaper_doc_ref = db.collection('users').document(user_id).collection('newspaper_tracker').document(doc_id)
                newspaper_doc = newspaper_doc_ref.get()

                if newspaper_doc.exists:
                    newspaper_data = newspaper_doc.to_dict()
                    # Check the 'days_taken' map for today's date. get() is safer.
                    if newspaper_data.get('days_taken', {}).get(day_key) is True:
                        is_paper_taken = True
            except Exception as e:
                print(f"Error checking newspaper status for user {user_id}: {e}")
                continue # Move to the next user

            # If paper is NOT taken, send the alarm to every registered device
            if not is_paper_taken:
                print(f"Paper not taken for {user_data.get('name')}. Sending alarm...")
                send_push_to_user(
                    user_id, user_data,
                    '🔔 Newspaper Reminder',
                    'আজকের নিউজপেপার এখনো রিসিভ করা হয়নি। দয়া করে আপডেট করুন।',
                )
            else:
                print(f"Paper already taken for {user_data.get('name')}. No alarm needed.")

def check_gas_cylinder_reminders():
    """Scheduled job: once a cylinder has been active for ~40 days, ask
    whether it's run out yet. If the user doesn't respond, keep asking once a
    day (never more than once/day, via last_notified_date) until they do."""
    with app.app_context():
        init_firebase()
        if db is None:
            return

        print(f"[{get_ist_now()}] Running gas cylinder check...")
        today_str = get_ist_now().strftime('%Y-%m-%d')

        users_ref = db.collection('users').stream()
        for user_doc in users_ref:
            user_id = user_doc.id
            user_data = user_doc.to_dict()

            if not user_data.get('fcm_tokens') and not user_data.get('fcm_token'):
                continue

            try:
                cylinder, cylinder_ref = get_active_gas_cylinder(user_id)
            except Exception as e:
                print(f"Error checking gas cylinder for user {user_id}: {e}")
                continue

            if not cylinder:
                continue  # nothing connected right now — nothing to ask about
            if (cylinder.get('next_check_date') or '9999-99-99') > today_str:
                continue
            if cylinder.get('last_notified_date') == today_str:
                continue  # already pinged today, don't spam

            print(f"Gas check-in due for {user_data.get('name')}. Sending reminder...")
            send_push_to_user(
                user_id, user_data,
                '🔥 Gas Check-in',
                'এই মাসের গ্যাস সিলিন্ডার কি শেষ হয়ে গেছে? অ্যাপে গিয়ে জানান।',
            )
            cylinder_ref.update({'last_notified_date': today_str})

# শিডিউলার সেটআপ করা (Asia/Dhaka বা Asia/Kolkata টাইমজোন দিতে পারেন)
scheduler = BackgroundScheduler(timezone="Asia/Kolkata") 

# প্রতিদিন ১২:৩০, ০৩:০০ এবং ০৪:০০ টায় এই ফাংশনটি চলবে
scheduler.add_job(func=check_newspaper_and_alarm, trigger="cron", hour=12, minute=30)
scheduler.add_job(func=check_newspaper_and_alarm, trigger="cron", hour=15, minute=0)
scheduler.add_job(func=check_newspaper_and_alarm, trigger="cron", hour=16, minute=0)

# গ্যাস সিলিন্ডার চেক-ইন রিমাইন্ডার — প্রতিদিন সকাল ১০টায়
scheduler.add_job(func=check_gas_cylinder_reminders, trigger="cron", hour=10, minute=0)

# টেস্টিংয়ের জন্য: সার্ভার রিস্টার্ট করার ঠিক ১ মিনিট পর একবার অ্যালার্ম চেক করবে!
scheduler.add_job(func=check_newspaper_and_alarm, trigger="date", run_date=get_ist_now() + timedelta(minutes=1))

if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
    scheduler.start()


if __name__ == '__main__':
    # debug=True দিলে কোড চেঞ্জ করলে সার্ভার নিজে থেকেই রিস্টার্ট হয় 
    # এবং কোনো এরর হলে ব্রাউজারে বিস্তারিত দেখা যায়।
    app.run(debug=True)
