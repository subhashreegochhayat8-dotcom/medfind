import sqlite3
import random
from datetime import datetime, timedelta

random.seed(42)

DB_PATH = 'medfind.db'

MEDICINES = [
    ('Paracetamol', '500 mg', 'Tablet'),
    ('Ibuprofen', '400 mg', 'Tablet'),
    ('Azithromycin', '500 mg', 'Tablet'),
    ('Amoxicillin', '500 mg', 'Capsule'),
    ('Cetirizine', '10 mg', 'Tablet'),
    ('Metformin', '500 mg', 'Tablet'),
    ('Omeprazole', '20 mg', 'Capsule'),
    ('Pantoprazole', '40 mg', 'Tablet'),
    ('Aspirin', '75 mg', 'Tablet'),
    ('Amoxiclav', '625 mg', 'Tablet'),
    ('Ciprofloxacin', '500 mg', 'Tablet'),
    ('Dolo', '650 mg', 'Tablet'),
    ('Cough Syrup', '100 ml', 'Syrup'),
    ('Vitamin C', '500 mg', 'Tablet'),
    ('Vitamin D3', '60K IU', 'Capsule'),
    ('Calcium', '500 mg', 'Tablet'),
    ('Iron', '100 mg', 'Tablet'),
    ('Losartan', '50 mg', 'Tablet'),
    ('Amlodipine', '5 mg', 'Tablet'),
    ('Atorvastatin', '10 mg', 'Tablet'),
    ('Metoprolol', '25 mg', 'Tablet'),
    ('Insulin', '100 IU', 'Injection'),
    ('Salbutamol', '100 mcg', 'Inhaler'),
    ('Montelukast', '10 mg', 'Tablet'),
    ('Ranitidine', '150 mg', 'Tablet'),
    ('Domperidone', '10 mg', 'Tablet'),
    ('Ondansetron', '4 mg', 'Tablet'),
    ('Diclofenac', '50 mg', 'Tablet'),
    ('Mefenamic Acid', '250 mg', 'Tablet'),
    ('ORS', '21 g', 'Powder'),
]

PHARMACIES = [
    ('MedPlus Pharmacy', 'Kharavela Nagar, Bhubaneswar', 20.2961, 85.8245, 1),
    ('Apollo Pharmacy', 'Saheed Nagar, Bhubaneswar', 20.2980, 85.8260, 1),
    ('LifeCare Pharmacy', 'Patia, Bhubaneswar', 20.3500, 85.8200, 1),
    ('Sunrise Medical', 'Bapuji Nagar, Bhubaneswar', 20.2900, 85.8300, 1),
    ('City Chemist', 'Old Town, Bhubaneswar', 20.2400, 85.8400, 1),
    ('Wellness Pharmacy', 'Jaydev Vihar, Bhubaneswar', 20.3100, 85.8100, 1),
]

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Drop and recreate tables
cur.execute('DROP TABLE IF EXISTS availability_requests')
cur.execute('DROP TABLE IF EXISTS inventory')
cur.execute('DROP TABLE IF EXISTS medicines')
cur.execute('DROP TABLE IF EXISTS pharmacies')

cur.execute('''
    CREATE TABLE pharmacies (
        pharmacy_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        is_open INTEGER DEFAULT 1
    )
''')

cur.execute('''
    CREATE TABLE medicines (
        medicine_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        strength TEXT NOT NULL,
        form TEXT NOT NULL
    )
''')

cur.execute('''
    CREATE TABLE inventory (
        pharmacy_id INTEGER NOT NULL,
        medicine_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        last_updated TEXT NOT NULL,
        PRIMARY KEY (pharmacy_id, medicine_id),
        FOREIGN KEY (pharmacy_id) REFERENCES pharmacies(pharmacy_id),
        FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id)
    )
''')

cur.execute('''
    CREATE TABLE availability_requests (
        request_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        pharmacy_id INTEGER NOT NULL,
        medicine_id INTEGER,
        quantity INTEGER DEFAULT 1,
        status TEXT DEFAULT 'pending',
        timestamp TEXT NOT NULL
    )
''')

# Insert pharmacies
for name, address, lat, lon, is_open in PHARMACIES:
    cur.execute(
        'INSERT INTO pharmacies (name, address, latitude, longitude, is_open) VALUES (?, ?, ?, ?, ?)',
        (name, address, lat, lon, is_open)
    )

# Insert medicines
for name, strength, form in MEDICINES:
    cur.execute(
        'INSERT INTO medicines (name, strength, form) VALUES (?, ?, ?)',
        (name, strength, form)
    )

# Insert inventory: each pharmacy carries most medicines with varied stock
now = datetime.now()
for ph_id in range(1, len(PHARMACIES) + 1):
    for med_id in range(1, len(MEDICINES) + 1):
        # Each pharmacy carries ~80% of medicines
        if random.random() < 0.8:
            quantity = random.choice([0, 0, 0, 5, 12, 20, 35, 42, 60, 60, 60, 60])
            minutes_ago = random.choice([5, 25, 45, 120, 300, 600, 900, 1500, 2000])
            last_updated = (now - timedelta(minutes=minutes_ago)).isoformat()
            cur.execute(
                'INSERT INTO inventory (pharmacy_id, medicine_id, quantity, last_updated) VALUES (?, ?, ?, ?)',
                (ph_id, med_id, quantity, last_updated)
            )

conn.commit()
conn.close()
print(f"Database seeded: {len(PHARMACIES)} pharmacies, {len(MEDICINES)} medicines.")
