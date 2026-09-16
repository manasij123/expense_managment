from firebase_functions import https_fn, scheduler_fn
from werkzeug.wrappers import Response

@https_fn.on_request()
def expensemanagement(req: https_fn.Request) -> https_fn.Response:
    """The main Cloud Function for the Flask app."""
    # Lazy load the app to prevent deployment timeouts
    from app import app

    environ = req.environ.copy()

    # Clear SCRIPT_NAME to ensure Flask routes match from the root
    environ['SCRIPT_NAME'] = ''

    # Ensure PATH_INFO is set
    if not environ.get('PATH_INFO'):
        environ['PATH_INFO'] = '/'

    return Response.from_app(app, environ)

    if __name__ == '__main__':
        # debug=True দিলে কোড চেঞ্জ করলে সার্ভার নিজে থেকেই রিস্টার্ট হয়
        # এবং কোনো এরর হলে ব্রাউজারে বিস্তারিত দেখা যায়।
        app.run(debug=True)


# --- Reliable newspaper-reminder triggers (12:30 / 15:00 / 16:00 IST) ---
# The in-process APScheduler jobs defined in app.py only fire on the local dev
# server (gated behind WERKZEUG_RUN_MAIN) — a deployed Cloud Function instance
# isn't kept alive in the background for scheduled tasks, so that scheduler
# never actually runs once deployed. These three functions instead deploy as
# real Google Cloud Scheduler jobs (Firebase wires this up automatically on
# `firebase deploy`), which reliably invoke this Cloud Function at the right
# time regardless of whether any instance happens to be warm.
def _run_newspaper_alarm_check() -> None:
    from app import check_newspaper_and_alarm
    check_newspaper_and_alarm()

@scheduler_fn.on_schedule(schedule="30 12 * * *", timezone=scheduler_fn.Timezone("Asia/Kolkata"))
def newspaper_alarm_1230(event: scheduler_fn.ScheduledEvent) -> None:
    _run_newspaper_alarm_check()

@scheduler_fn.on_schedule(schedule="0 15 * * *", timezone=scheduler_fn.Timezone("Asia/Kolkata"))
def newspaper_alarm_1500(event: scheduler_fn.ScheduledEvent) -> None:
    _run_newspaper_alarm_check()

@scheduler_fn.on_schedule(schedule="0 16 * * *", timezone=scheduler_fn.Timezone("Asia/Kolkata"))
def newspaper_alarm_1600(event: scheduler_fn.ScheduledEvent) -> None:
    _run_newspaper_alarm_check()


# --- Gas cylinder check-in reminder (10:00 IST daily) ---
@scheduler_fn.on_schedule(schedule="0 10 * * *", timezone=scheduler_fn.Timezone("Asia/Kolkata"))
def gas_cylinder_reminder(event: scheduler_fn.ScheduledEvent) -> None:
    from app import check_gas_cylinder_reminders
    check_gas_cylinder_reminders()
