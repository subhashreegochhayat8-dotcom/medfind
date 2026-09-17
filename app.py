from flask import Flask, render_template, request, jsonify
import sqlite3
from datetime import datetime
from math import radians, sin, cos, sqrt, atan2

app = Flask(__name__)
DB = 'medfind.db'

STALE_HOURS = 24
LOW_STOCK_THRESHOLD = 10

# Ranking weights
W_AVAIL = 0.4
W_FRESH = 0.3
W_DIST = 0.2
W_OPEN = 0.1

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def haversine(lat1, lon1, lat2, lon2):
    """Distance in km between two lat/long points."""
    R = 6371  # Earth radius in km
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))

def freshness_score(last_updated_str):
    """Return (label, age_minutes, score 0-1)."""
    updated = datetime.fromisoformat(last_updated_str)
    age_minutes = (datetime.now() - updated).total_seconds() / 60
    if age_minutes < 30:
        label, score = 'fresh', 1.0
    elif age_minutes < STALE_HOURS * 60:
        label = 'aging'
        # Decay from 1.0 down to 0.3 as it ages
        score = max(0.3, 1.0 - (age_minutes / (STALE_HOURS * 60)) * 0.7)
    else:
        label, score = 'stale', 0.3
    return label, int(age_minutes), score

def availability_score(quantity):
    if quantity <= 0:
        return 0.0
    if quantity < LOW_STOCK_THRESHOLD:
        return 0.5
    return 1.0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/search')
def search():
    query = request.args.get('q', '').strip()
    # User location from query params; default to Bhubaneswar center
    user_lat = float(request.args.get('lat', 20.2961))
    user_lon = float(request.args.get('lon', 85.8245))

    if not query:
        return jsonify([])

    conn = get_db()
    rows = conn.execute('''
        SELECT m.name AS medicine, m.strength, m.form,
               p.pharmacy_id, p.name AS pharmacy, p.address,
               p.latitude, p.longitude, p.is_open,
               i.quantity, i.last_updated
        FROM inventory i
        JOIN medicines m ON i.medicine_id = m.medicine_id
        JOIN pharmacies p ON i.pharmacy_id = p.pharmacy_id
        WHERE m.name LIKE ? OR m.generic_name LIKE ?
    ''', (f'%{query}%', f'%{query}%')).fetchall()
    conn.close()

    # Build result objects with all the raw signals
    results = []
    for row in rows:
        dist_km = haversine(user_lat, user_lon, row['latitude'], row['longitude'])
        fresh_label, age_min, fresh_score = freshness_score(row['last_updated'])
        avail_score = availability_score(row['quantity'])
        results.append({
            'medicine': row['medicine'],
            'strength': row['strength'],
            'form': row['form'],
            'pharmacy_id': row['pharmacy_id'],
            'pharmacy': row['pharmacy'],
            'address': row['address'],
            'distance_km': round(dist_km, 2),
            'quantity': row['quantity'],
            'availability': 'in_stock' if avail_score == 1.0 else ('low_stock' if avail_score == 0.5 else 'out_of_stock'),
            'freshness': fresh_label,
            'last_updated_minutes_ago': age_min,
            'is_open': bool(row['is_open']),
            '_avail_score': avail_score,
            '_fresh_score': fresh_score,
            '_open_score': 1.0 if row['is_open'] else 0.0,
        })

    # Normalize distance: best (smallest) gets 1.0
    if results:
        max_dist = max(r['distance_km'] for r in results)
        for r in results:
            r['_dist_score'] = 1.0 - (r['distance_km'] / max_dist) if max_dist > 0 else 1.0

    # Compute final score and rank
    for r in results:
        r['score'] = round(
            W_AVAIL * r['_avail_score'] +
            W_FRESH * r['_fresh_score'] +
            W_DIST * r['_dist_score'] +
            W_OPEN * r['_open_score'],
            3
        )
    results.sort(key=lambda r: r['score'], reverse=True)

    # Clean up internal fields before sending
    for r in results:
        for k in ['_avail_score', '_fresh_score', '_dist_score', '_open_score']:
            r.pop(k)

    return jsonify(results)

@app.route('/pharmacy')
def pharmacy_dashboard():
    return render_template('pharmacy.html')

if __name__ == '__main__':
    app.run(debug=True)
