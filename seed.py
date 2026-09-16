import sqlite3
import random
from datetime import datetime, timedelta

DB = 'medfind.db'

MEDICINES = [
    ('Paracetamol', 'Acetaminophen', '500 mg', 'Tablet'),
    ('Azithromycin', 'Azithromycin', '500 mg', 'Tablet'),
    ('Cetirizine', 'Cetirizine', '10 mg', 'Tablet'),
    ('Pantoprazole', 'Pantoprazole', '40 mg', 'Tablet'),
    ('Amoxicillin', 'Amoxicillin', '500 mg', 'Capsule'),
    ('Metformin', 'Metformin', '500 mg', 'Tablet'),
    ('Omeprazole', 'Omeprazole', '20 mg', 'Capsule'),
    ('Ibuprofen', 'Ibuprofen', '400 mg', 'Tablet'),
]

PHARMACIES = [
    ('MedPlus Pharmacy', 'Kharavela Nagar, Bhubaneswar', 20.2961, 85.8245),
    ('Apollo Pharmacy', 'Saheed Nagar, Bhubaneswar', 20.2958, 85.8230),
    ('LifeCare Pharmacy', 'Patia, Bhubaneswar', 20.3511, 85.8234),
    ('Sunrise Medical', 'Bapuji Nagar, Bhubaneswar', 20.2910, 85.8300),
    ('City Chemist', 'Unit-4, Bhubaneswar', 20.2760, 85.8390),
    ('Wellness Pharmacy', 'Jaydev Vihar, Bhubaneswar', 20.3020, 85.8200),
]

def seed():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    with open('schema.sql') as f:
        cur.executescript(f.read())

    # Insert medicines
    for med in MEDICINES:
        cur.execute(
            'INSERT INTO medicines (name, generic_name, strength, form) VALUES (?,?,?,?)',
            med
        )

    # Insert pharmacies
    for ph in PHARMACIES:
        cur.execute(
            'INSERT INTO pharmacies (name, address, latitude, longitude, is_open) VALUES (?,?,?,?,1)',
            ph
        )

    # Insert inventory with staggered freshness
    now = datetime.now()
    for ph_id in range(1, len(PHARMACIES) + 1):
        for med_id in range(1, len(MEDICINES) + 1):
            # Random quantity, sometimes 0 (out of stock)
            qty = random.choice([0, 0, 5, 12, 20, 35, 42, 60])
            # Stagger last_updated: 5 min to 30 hours ago
            minutes_ago = random.choice([5, 12, 35, 90, 240, 720, 1080, 1800])
            updated = now - timedelta(minutes=minutes_ago)
            cur.execute(
                'INSERT INTO inventory (pharmacy_id, medicine_id, quantity, last_updated) VALUES (?,?,?,?)',
                (ph_id, med_id, qty, updated.isoformat())
            )

    # Seed one demo user
    cur.execute(
        'INSERT INTO users (name, email, location) VALUES (?,?,?)',
        ('Demo User', 'demo@medfind.com', 'Bhubaneswar')
    )

    conn.commit()
    conn.close()
    print('Database seeded.')

if __name__ == '__main__':
    seed()

