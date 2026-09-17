const input = document.getElementById('search-input');
const btn = document.getElementById('search-btn');
const resultsDiv = document.getElementById('results');

btn.addEventListener('click', search);
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') search();
});

async function search() {
    const q = input.value.trim();
    if (!q) return;

    let lat = 20.2961, lon = 85.8245;

    resultsDiv.innerHTML = '<p class="loading">Searching...</p>';

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lon}`);
        const data = await res.json();
        renderResults(data);
    } catch (err) {
        resultsDiv.innerHTML = '<p class="error">Something went wrong. Try again.</p>';
    }
}

function renderResults(results) {
    if (results.length === 0) {
        resultsDiv.innerHTML = '<p class="error">No pharmacies found for that medicine.</p>';
        return;
    }

    resultsDiv.innerHTML = results.map((r, i) => {
        const badge = availabilityBadge(r);
        const fresh = freshnessBadge(r);
        const medal = i === 0 ? ' 🥇' : '';
        return `
            <div class="card ${i === 0 ? 'best-option' : ''}">
                <div class="card-header">
                    <h3>${medal} ${r.pharmacy}</h3>
                    <span class="score">Score: ${r.score}</span>
                </div>
                <p class="medicine">${r.medicine} ${r.strength} ${r.form}</p>
                <p class="address">📍 ${r.address}</p>
                <div class="meta">
                    ${badge}
                    ${fresh}
                    <span class="distance">${r.distance_km} km</span>
                    <span class="open">${r.is_open ? '🕐 Open' : '🕐 Closed'}</span>
                </div>
            </div>`;
    }).join('');
}

function availabilityBadge(r) {
    if (r.availability === 'in_stock') return '<span class="badge in-stock">🟢 Available</span>';
    if (r.availability === 'low_stock') return '<span class="badge low-stock">🟡 Low stock</span>';
    return '<span class="badge out-of-stock">🔴 Out of stock</span>';
}

function freshnessBadge(r) {
    if (r.freshness === 'fresh') return `<span class="badge fresh">Updated ${r.last_updated_minutes_ago} min ago</span>`;
    if (r.freshness === 'aging') return `<span class="badge aging">Updated ${Math.floor(r.last_updated_minutes_ago / 60)}h ago</span>`;
    return '<span class="badge stale">⚠️ Availability uncertain</span>';
}
