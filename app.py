from flask import Flask, render_template, request, jsonify
import sqlite3
from datetime import datetime, timezone

app = Flask(__name__)
DB = 'medfind.db'

# Stock freshness: older than 24h = unverified
STALE_HOURS = 24

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def freshness_status(last_updated_str):
    """Return a freshness label and age in minutes."""
    updated = datetime.fromisoformat(last_updated_str)
    now = datetime.now()
    age_minutes = (now - updated).total_seconds() / 60
    if age_minutes < 30:
        return 'fresh', int(age_minutes)
    elif age_minutes < STALE_HOURS * 60:
        return 'aging', int(age_minutes)
    else:
        return 'stale', int(age_minutes)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/search')
def search():
    """Search medicines by name, return pharmacies with stock."""
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([])

    conn = get_db()
    rows = conn.execute('''
        SELECT m.name AS medicine, m.strength, m.form,
               p.name AS pharmacy, p.address, p.latitude, p.longitude,
               i.quantity, i.last_updated
        FROM inventory i
        JOIN medicines m ON i.medicine_id = m.medicine_id
        JOIN pharmacies p ON i.pharmacy_id = p.pharmacy_id
        WHERE m.name LIKE ? OR m.generic_name LIKE ?
        ORDER BY i.last_updated DESC
    ''', (f'%{query}%', f'%{query}%')).fetchall()
    conn.close()

    results = []
    for row in rows:
        status, age = freshness_status(row['last_updated'])
        results.append({
            'medicine': row['medicine'],
            'strength': row['strength'],
            'form': row['form'],
            'pharmacy': row['pharmacy'],
            'address': row['address'],
            'quantity': row['quantity'],
            'availability': 'in_stock' if row['quantity'] > 0 else 'out_of_stock',
            'freshness': status,
            'last_updated_minutes_ago': age,
        })
    return jsonify(results)

@app.route('/pharmacy')
def pharmacy_dashboard():
    """Pharmacy dashboard — list their inventory."""
    return render_template('pharmacy.html')

if __name__ == '__main__':
    app.run(debug=True)

