import sqlite3
import os
import joblib
import numpy as np
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template, request, session
from functools import wraps

app = Flask(__name__)
app.secret_key = 'medfind-demo-secret-key'
DB_PATH = 'medfind.db'

# Load ML model if it exists
MODEL_PATH = 'ranking_model.joblib'
model = None
if os.path.exists(MODEL_PATH):
    model = joblib.load(MODEL_PATH)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# Pharmacy credentials (demo only)
PHARMACY_PASSWORDS = {
    'MedPlus Pharmacy': 'medplus123',
    'Apollo Pharmacy': 'apollo123',
    'LifeCare Pharmacy': 'lifecare123',
    'Sunrise Medical': 'sunrise123',
    'City Chemist': 'city123',
    'Wellness Pharmacy': 'wellness123',
}


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'pharmacy_id' not in session:
            return jsonify({'error': 'Login required'}), 401
        return f(*args, **kwargs)
    return decorated


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    pharmacy_name = data.get('pharmacy_name', '')
    password = data.get('password', '')

    if pharmacy_name not in PHARMACY_PASSWORDS:
        return jsonify({'error': 'Unknown pharmacy'}), 401

    if PHARMACY_PASSWORDS[pharmacy_name] != password:
        return jsonify({'error': 'Incorrect password'}), 401

    conn = get_db()
    row = conn.execute(
        'SELECT pharmacy_id, name FROM pharmacies WHERE name = ?',
        (pharmacy_name,)
    ).fetchone()
    conn.close()

    if not row:
        return jsonify({'error': 'Pharmacy not found'}), 404

    session['pharmacy_id'] = row['pharmacy_id']
    session['pharmacy_name'] = row['name']
    return jsonify({'success': True, 'pharmacy_id': row['pharmacy_id'], 'name': row['name']})


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})


@app.route('/api/session')
def get_session():
    if 'pharmacy_id' in session:
        return jsonify({'logged_in': True, 'pharmacy_id': session['pharmacy_id'], 'name': session['pharmacy_name']})
    return jsonify({'logged_in': False})


@app.route('/api/search')
def search():
    query = request.args.get('q', '').strip()
    lat = float(request.args.get('lat', 20.2961))
    lon = float(request.args.get('lon', 85.8245))

    conn = get_db()
    results = conn.execute('''
        SELECT
            p.pharmacy_id, p.name AS pharmacy, p.address, p.latitude, p.longitude,
            p.is_open, m.name AS medicine, m.strength, m.form,
            i.quantity, i.last_updated
        FROM pharmacies p
        JOIN inventory i ON i.pharmacy_id = p.pharmacy_id
        JOIN medicines m ON i.medicine_id = m.medicine_id
        WHERE LOWER(m.name) LIKE ?
        ORDER BY p.name
    ''', (f'%{query.lower()}%',)).fetchall()

    conn.close()

    if not results:
        return jsonify([])

    def haversine(lat1, lon1, lat2, lon2):
        from math import radians, sin, cos, sqrt, atan2
        R = 6371.0
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return R * c

    now = datetime.now()
    output = []
    for row in results:
        distance = round(haversine(lat, lon, row['latitude'], row['longitude']), 2)

        minutes_ago = int((now - datetime.fromisoformat(row['last_updated'])).total_seconds() / 60)
        if minutes_ago < 30:
            freshness = 'fresh'
        elif minutes_ago < 720:
            freshness = 'aging'
        else:
            freshness = 'stale'

        if row['quantity'] <= 0:
            availability = 'out_of_stock'
        elif row['quantity'] <= 10:
            availability = 'low_stock'
        else:
            availability = 'in_stock'

        # Score using ML model if available, else fallback to hand-written formula
        if model is not None:
            avail_score = 2 if availability == 'in_stock' else (1 if availability == 'low_stock' else 0)
            fresh_score = 2 if freshness == 'fresh' else (1 if freshness == 'aging' else 0)
            features = np.array([[avail_score, fresh_score, distance, int(row['is_open'])]])

            # Use the model's probability of "user picks this pharmacy"
            score = round(float(model.predict_proba(features)[0][1]), 3)
        else:
            score = 0.0
            if availability == 'in_stock':
                score += 40
            elif availability == 'low_stock':
                score += 25
            if freshness == 'fresh':
                score += 30
            elif freshness == 'aging':
                score += 15
            score += max(0, 20 - distance * 2)
            if row['is_open']:
                score += 10
            score = round(score / 100, 3)

        output.append({
            'pharmacy_id': row['pharmacy_id'],
            'pharmacy': row['pharmacy'],
            'address': row['address'],
            'medicine': row['medicine'],
            'strength': row['strength'],
            'form': row['form'],
            'quantity': row['quantity'],
            'availability': availability,
            'freshness': freshness,
            'last_updated_minutes_ago': minutes_ago,
            'distance_km': distance,
            'is_open': bool(row['is_open']),
            'score': score
        })

    output.sort(key=lambda x: x['score'], reverse=True)
    return jsonify(output)


@app.route('/api/pharmacy/<int:pharmacy_id>/inventory')
@login_required
def pharmacy_inventory(pharmacy_id):
    # Only allow a pharmacy to view its own inventory
    if pharmacy_id != session['pharmacy_id']:
        return jsonify({'error': 'Not authorized'}), 403

    conn = get_db()
    items = conn.execute('''
        SELECT m.medicine_id, m.name, m.strength, m.form, i.quantity, i.last_updated
        FROM inventory i
        JOIN medicines m ON i.medicine_id = m.medicine_id
        WHERE i.pharmacy_id = ?
        ORDER BY m.name
    ''', (pharmacy_id,)).fetchall()
    conn.close()

    now = datetime.now()
    result = []
    for item in items:
        minutes_ago = int((now - datetime.fromisoformat(item['last_updated'])).total_seconds() / 60)
        if minutes_ago < 30:
            freshness = 'fresh'
        elif minutes_ago < 720:
            freshness = 'aging'
        else:
            freshness = 'stale'

        result.append({
            'medicine_id': item['medicine_id'],
            'name': item['name'],
            'strength': item['strength'],
            'form': item['form'],
            'quantity': item['quantity'],
            'freshness': freshness,
            'last_updated_minutes_ago': minutes_ago
        })

    return jsonify(result)


@app.route('/api/pharmacy/<int:pharmacy_id>/inventory', methods=['POST'])
@login_required
def update_inventory(pharmacy_id):
    # Only allow a pharmacy to edit its own inventory
    if pharmacy_id != session['pharmacy_id']:
        return jsonify({'error': 'Not authorized'}), 403

    data = request.get_json()
    medicine_id = data.get('medicine_id')
    quantity = data.get('quantity')

    if medicine_id is None or quantity is None:
        return jsonify({'error': 'medicine_id and quantity required'}), 400

    now = datetime.now().isoformat()
    conn = get_db()
    conn.execute('''
        UPDATE inventory
        SET quantity = ?, last_updated = ?
        WHERE pharmacy_id = ? AND medicine_id = ?
    ''', (quantity, now, pharmacy_id, medicine_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'quantity': quantity, 'last_updated': now})


@app.route('/api/reserve', methods=['POST'])
def reserve():
    data = request.get_json()
    pharmacy_id = data.get('pharmacy_id')
    medicine_name = data.get('medicine', '')
    quantity = data.get('quantity', 1)
    user_id = 1  # Demo user

    conn = get_db()
    name = medicine_name.split(' ')[0]
    med_row = conn.execute(
        'SELECT medicine_id FROM medicines WHERE name = ? LIMIT 1',
        (name,)
    ).fetchone()
    medicine_id = med_row['medicine_id'] if med_row else None

    now = datetime.now().isoformat()
    cur = conn.execute('''
        INSERT INTO availability_requests (user_id, pharmacy_id, medicine_id, quantity, status, timestamp)
        VALUES (?, ?, ?, ?, 'pending', ?)
    ''', (user_id, pharmacy_id, medicine_id, quantity, now))
    conn.commit()
    conn.close()

    return jsonify({
        'request_id': cur.lastrowid,
        'status': 'pending',
        'message': 'Availability request sent. The pharmacy has 30 minutes to confirm.'
    })


if __name__ == '__main__':
    app.run(debug=True)
