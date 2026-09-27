function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ---------- Tab switching ----------
function switchTab(tab) {
    document.getElementById('view-search').classList.toggle('hidden', tab !== 'search');
    document.getElementById('view-dashboard').classList.toggle('hidden', tab !== 'dashboard');
    document.getElementById('tab-search').classList.toggle('active', tab === 'search');
    document.getElementById('tab-dashboard').classList.toggle('active', tab === 'dashboard');
    document.getElementById('user-button').classList.toggle('active', tab === 'dashboard');
    if (tab === 'dashboard') checkSession();
}

// ---------- Search ----------
const input = document.getElementById('search-input');
const btn = document.getElementById('search-btn');
const resultsDiv = document.getElementById('results');
const stockOnly = document.getElementById('stock-only');
const sortSelect = document.getElementById('sort-select');
const locationSelect = document.getElementById('location-select');
const resultsSummary = document.getElementById('results-summary');
let searchResults = [];

btn.addEventListener('click', search);
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') search();
});
stockOnly.addEventListener('change', () => renderResults(searchResults));
sortSelect.addEventListener('change', () => renderResults(searchResults));
locationSelect.addEventListener('change', () => renderResults(searchResults));
document.querySelectorAll('.suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
        input.value = chip.dataset.query;
        search();
    });
});

async function search() {
    const displayQuery = input.value.trim();
    if (!displayQuery) return;

    const lat = 20.2961;
    const lon = 85.8245;
    const apiQuery = displayQuery.toLowerCase().includes('amoxicillin') && displayQuery.toLowerCase().includes('clavulanate')
        ? 'Amoxiclav'
        : (displayQuery.match(/[a-z][a-z-]*/i) || [''])[0];

    resultsSummary.innerHTML = `<span class="summary-icon" aria-hidden="true">⛭</span> Searching verified pharmacies for <strong>“${escapeHtml(displayQuery)}”</strong>`;
    resultsDiv.innerHTML = '<p class="loading">Querying pharmacy inventory...</p>';

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(apiQuery)}&lat=${lat}&lon=${lon}`);
        if (!res.ok) throw new Error('Search request failed');
        const data = await res.json();
        searchResults = data;
        renderResults(searchResults);
    } catch (err) {
        resultsSummary.innerHTML = `<span class="summary-icon" aria-hidden="true">⛭</span> Search unavailable for <strong>“${escapeHtml(displayQuery)}”</strong>`;
        resultsDiv.innerHTML = '<p class="error">Could not reach the pharmacy network. Try again.</p>';
    }
}

function renderResults(results) {
    const maxDistance = Number(locationSelect.value);
    let visibleResults = results.filter((result) => result.distance_km <= maxDistance);
    if (stockOnly.checked) {
        visibleResults = visibleResults.filter((result) => result.availability === 'in_stock');
    }

    const sortMode = sortSelect.value;
    visibleResults.sort((first, second) => {
        if (sortMode === 'distance') return first.distance_km - second.distance_km;
        if (sortMode === 'availability') {
            const availabilityRank = { in_stock: 0, low_stock: 1, out_of_stock: 2 };
            return availabilityRank[first.availability] - availabilityRank[second.availability] || second.score - first.score;
        }
        return second.score - first.score;
    });

    const queryLabel = input.value.trim() || 'medicine';
    resultsSummary.innerHTML = `<span class="summary-icon" aria-hidden="true">⛭</span> Showing ${visibleResults.length} verified pharmacies with stock for <strong>“${escapeHtml(queryLabel)}”</strong>`;
    if (visibleResults.length === 0) {
        resultsDiv.innerHTML = `<div class="empty-state"><span class="empty-code">NO MATCHING ENDPOINTS</span><h2>No pharmacy results in this search area</h2><p>Try a larger radius, a different medicine name, or turn off “In stock only.”</p></div>`;
        return;
    }

    resultsDiv.innerHTML = visibleResults.map((r, index) => {
        const status = r.availability === 'out_of_stock' ? 'Out of stock' : r.availability === 'low_stock' ? 'Low stock' : 'In stock';
        const statusClass = r.availability === 'out_of_stock' ? 'out-of-stock' : r.availability === 'low_stock' ? 'low-stock' : 'in-stock';
        const freshness = r.last_updated_minutes_ago >= 60
            ? `${Math.floor(r.last_updated_minutes_ago / 60)}h ago`
            : `${r.last_updated_minutes_ago}m ago`;
        const score = Math.max(0, Math.min(100, Math.round(Number(r.score || 0) * 100)));
        const hours = r.is_open ? 'Open now' : 'Closed';
        const stockDescription = r.availability === 'out_of_stock'
            ? '✕ Out of Stock'
            : r.availability === 'low_stock'
                ? `△ Low Stock (${Number(r.quantity)} units remaining)`
                : `• ${Number(r.quantity)} units in stock`;
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`;
        const stockAction = r.availability === 'out_of_stock'
            ? `<button class="notify-btn" type="button" data-pharmacy="${r.pharmacy_id}"><span aria-hidden="true">♧</span> Notify when restocked</button>`
            : `<button class="request-btn" type="button" data-pharmacy="${r.pharmacy_id}" data-medicine="${escapeHtml(r.medicine)}"><span aria-hidden="true">♧</span> Request Availability</button>`;
        return `
            <article class="result-card ${statusClass}">
                <div class="card-head">
                    <div class="card-badges"><span class="rank-badge">♙ Rank #${index + 1}${index === 0 ? ' · Best Match' : ''}</span><span class="match-badge">${score}% Match Score</span>${index === 0 ? '<span class="realtime-badge">⚡ Realtime API Live</span>' : ''}</div>
                    <div class="card-title-row"><div><h2>${escapeHtml(r.pharmacy)}</h2><p class="medicine-detail">${escapeHtml(r.medicine)} ${escapeHtml(r.strength || '')} <span>•</span> ${escapeHtml(r.form || '—')}</p></div><div class="card-price"><strong>—</strong><span>/ pack</span><small>—</small></div></div>
                </div>
                <div class="metrics-grid">
                    <div class="metric-cell"><div class="metric-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"></path><circle cx="12" cy="10" r="2.2"></circle></svg> LOCATION</div><div class="metric-value">${escapeHtml(r.address || '—')}</div><div class="metric-sub distance-value">${Number(r.distance_km).toFixed(1)} km away</div></div>
                    <div class="metric-cell"><div class="metric-label"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="1"></rect><path d="M9 8h6M9 12h6M9 16h3"></path></svg> AVAILABLE UNITS</div><div class="metric-stock ${statusClass}">${stockDescription}</div></div>
                    <div class="metric-cell"><div class="metric-label"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg> OPERATING HOURS</div><div class="metric-value">${hours} · —</div><div class="metric-sub">—</div></div>
                    <div class="metric-cell"><div class="metric-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5l2 2"></path><path d="M20 4v5h-5M20 12a8 8 0 0 1-14 5l-2-2"></path><path d="M4 20v-5h5"></path></svg> TELEMETRY SYNC</div><div class="metric-value">Updated ${escapeHtml(freshness)}</div><div class="metric-sub">—</div></div>
                </div>
                <div class="card-bottom">
                    <div class="contact-row"><span class="phone-placeholder">☎ &nbsp;—</span><span class="contact-divider">·</span><a class="directions-link" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">◇ &nbsp;Directions</a></div>
                    <div class="card-actions">${stockAction}</div>
                </div>
            </article>`;
    }).join('');

    resultsDiv.querySelectorAll('.request-btn').forEach((requestButton) => {
        requestButton.addEventListener('click', () => requestReservation(requestButton, Number(requestButton.dataset.pharmacy)));
    });
    resultsDiv.querySelectorAll('.notify-btn').forEach((notifyButton) => {
        notifyButton.addEventListener('click', () => {
            notifyButton.textContent = 'Restock alert set';
            notifyButton.classList.add('notification-set');
            notifyButton.disabled = true;
        });
    });
}

async function requestReservation(btn, pharmacyId) {
    const medicineName = btn.dataset.medicine;
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
        const res = await fetch('/api/reserve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pharmacy_id: pharmacyId, medicine: medicineName, quantity: 1 })
        });
        if (res.ok) {
            btn.innerHTML = 'Request Sent <span aria-hidden="true">✓</span>';
            btn.classList.add('request-sent');
        } else {
            btn.innerHTML = 'Request Availability <span aria-hidden="true">→</span>';
            btn.disabled = false;
        }
    } catch (err) {
        btn.innerHTML = 'Request Availability <span aria-hidden="true">→</span>';
        btn.disabled = false;
    }
}

document.getElementById('help-link').addEventListener('click', (event) => {
    event.preventDefault();
    document.getElementById('demo-guide').showModal();
});
document.getElementById('dialog-close').addEventListener('click', () => document.getElementById('demo-guide').close());
document.getElementById('demo-guide').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
});

// ---------- Login / Session ----------
const loginBox = document.getElementById('login-box');
const dashboardContent = document.getElementById('dashboard-content');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

loginBtn.addEventListener('click', doLogin);
document.getElementById('login-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') doLogin();
});
document.getElementById('logout-btn').addEventListener('click', doLogout);
document.getElementById('quick-demo').addEventListener('click', () => {
    document.getElementById('login-pharmacy').value = 'MedPlus Pharmacy';
    document.getElementById('login-password').value = 'medplus123';
    doLogin();
});
document.getElementById('password-toggle').addEventListener('click', (event) => {
    const password = document.getElementById('login-password');
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    event.currentTarget.textContent = visible ? 'HIDE' : 'SHOW';
    event.currentTarget.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
});

async function checkSession() {
    try {
        const res = await fetch('/api/session');
        const data = await res.json();
        if (data.logged_in) {
            showDashboard(data.pharmacy_id, data.name);
        } else {
            showLogin();
        }
    } catch (err) {
        showLogin();
    }
}

function showLogin() {
    loginBox.classList.remove('hidden');
    dashboardContent.classList.add('hidden');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In to Dashboard';
    loginError.classList.add('hidden');
}

async function doLogin() {
    const pharmacyName = document.getElementById('login-pharmacy').value;
    const password = document.getElementById('login-password').value;

    loginError.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Authenticating endpoint...';

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pharmacy_name: pharmacyName, password: password })
        });
        const data = await res.json();
        if (res.ok) {
            showDashboard(data.pharmacy_id, data.name);
        } else {
            loginError.textContent = data.error || 'Login failed';
            loginError.classList.remove('hidden');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In to Dashboard';
        }
    } catch (err) {
        loginError.textContent = 'Something went wrong. Try again.';
        loginError.classList.remove('hidden');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In to Dashboard';
    }
}

async function doLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (err) {}
    document.getElementById('login-password').value = '';
    showLogin();
}

function showDashboard(pharmacyId, name) {
    loginBox.classList.add('hidden');
    dashboardContent.classList.remove('hidden');
    document.getElementById('pharmacy-name').textContent = name;
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In to Dashboard';
    loginError.classList.add('hidden');
    loadInventory(pharmacyId);
}

search();

// ---------- Dashboard Inventory ----------
const inventoryDiv = document.getElementById('inventory');

async function loadInventory(pharmacyId) {
    inventoryDiv.innerHTML = '<p class="loading">Loading inventory...</p>';
    try {
        const res = await fetch(`/api/pharmacy/${pharmacyId}/inventory`);
        if (res.status === 401) {
            showLogin();
            return;
        }
        const data = await res.json();
        renderInventory(data, pharmacyId);
    } catch (err) {
        inventoryDiv.innerHTML = '<p class="error">Failed to load inventory.</p>';
    }
}

function renderInventory(items, pharmacyId) {
    if (items.length === 0) {
        inventoryDiv.innerHTML = '<p class="error">No inventory found.</p>';
        return;
    }
    inventoryDiv.innerHTML = items.map(item => {
        let freshStr = 'Fresh';
        if (item.freshness === 'aging') {
            freshStr = `${Math.floor(item.last_updated_minutes_ago / 60)}h ago`;
        } else if (item.freshness === 'stale') {
            freshStr = 'Stale';
        }

        return `
            <div class="inv-row">
                <div class="inv-info">
                    <div class="inv-name">${escapeHtml(item.name)} ${escapeHtml(item.strength || '')}</div>
                    <div class="inv-meta">
                        <span>Quantity: ${item.quantity}</span>
                        <span>·</span>
                        <span>${freshStr}</span>
                    </div>
                </div>
                <div class="inv-controls">
                    <input type="number" class="qty-input" value="${item.quantity}" min="0">
                    <button class="update-btn" onclick="updateStock(${pharmacyId}, ${item.medicine_id}, this)">Update</button>
                </div>
            </div>`;
    }).join('');
}

async function updateStock(pharmacyId, medicineId, btn) {
    const input = btn.previousElementSibling;
    const newQty = parseInt(input.value);
    if (isNaN(newQty) || newQty < 0) return;

    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
        const res = await fetch(`/api/pharmacy/${pharmacyId}/inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ medicine_id: medicineId, quantity: newQty })
        });
        if (res.ok) {
            btn.textContent = 'Saved';
            setTimeout(() => {
                btn.textContent = 'Update';
                btn.disabled = false;
            }, 1200);
        } else {
            btn.textContent = 'Update';
            btn.disabled = false;
        }
    } catch (err) {
        btn.textContent = 'Update';
        btn.disabled = false;
    }
}
