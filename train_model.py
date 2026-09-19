import random
import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression

random.seed(42)
np.random.seed(42)

# Generate synthetic training data
# Features: [availability_score, freshness_score, distance_km, is_open]
# availability_score: 0=out, 1=low, 2=in stock
# freshness_score: 0=stale, 1=aging, 2=fresh

rows = []
labels = []

for _ in range(5000):
    availability = random.choice([0, 1, 2])
    freshness = random.choice([0, 1, 2])
    distance = random.uniform(0, 10)
    is_open = random.choice([0, 1])

    # Realistic user preference: they pick in-stock, fresh, close, open pharmacies
    score = availability * 2.0 + freshness * 1.5 - distance * 0.4 + is_open * 1.0
    noise = random.gauss(0, 1.5)
    picked = 1 if score + noise > 3.0 else 0

    rows.append([availability, freshness, distance, is_open])
    labels.append(picked)

X = np.array(rows)
y = np.array(labels)

model = LogisticRegression()
model.fit(X, y)

joblib.dump(model, 'ranking_model.joblib')
print(f"Model trained on {len(rows)} samples. Accuracy: {model.score(X, y):.3f}")

