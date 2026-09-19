// ---------- Tab switching ----------
function switchTab(tab) {
    document.getElementById('view-search').classList.toggle('hidden', tab !== 'search');
    document.getElementById('view-dashboard').classList.toggle('hidden', tab !== 'dashboard');
    document.getElementById('tab-search').classList.toggle('active', tab === 'search');
    document.getElementById('tab-dashboard').classList.toggle('active', tab === 'dashboard');
    if (tab === 'dashboard') checkSession();
}

// ---------- Search ----------
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
                <button class="reserve-btn" onclick="requestReservation(this, ${r.pharmacy_id}, '${r.medicine}')">Request availability</button>
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

async function requestReservation(btn, pharmacyId, medicineName) {
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
        const res = await fetch('/api/reserve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pharmacy_id: pharmacyId, medicine: medicineName, quantity: 1 })
        });
        if (res.ok) {
            btn.textContent = '✅ Request sent';
            btn.classList.add('sent');
        } else {
            btn.textContent = 'Request availability';
            btn.disabled = false;
        }
    } catch (err) {
        btn.textContent = 'Request availability';
        btn.disabled = false;
    }
}

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
    // Reset button and error
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
    loginError.classList.add('hidden');
}

async function doLogin() {
    const pharmacyName = document.getElementById('login-pharmacy').value;
    const password = document.getElementById('login-password').value;

    loginError.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

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
            loginBtn.textContent = 'Login';
        }
    } catch (err) {
        loginError.textContent = 'Something went wrong. Try again.';
        loginError.classList.remove('hidden');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
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
    // Reset login button state
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
    loginError.classList.add('hidden');
    loadInventory(pharmacyId);
}

// ---------- Dashboard ----------
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
        let statusTag;
        if (item.freshness === 'fresh') {
            statusTag = '<span class="status-tag status-fresh">Fresh</span>';
        } else if (item.freshness === 'aging') {
            statusTag = `<span class="status-tag status-aging">${Math.floor(item.last_updated_minutes_ago / 60)}h ago</span>`;
        } else {
            statusTag = '<span class="status-tag status-stale">Stale</span>';
        }
        return `
            <div class="inv-row">
                <div>
                    <div class="inv-name">${item.name} ${item.strength} ${item.form}</div>
                    <div class="inv-detail">
                        <span class="qty-label">Qty: ${item.quantity}</span>
                        ${statusTag}
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
            btn.textContent = '✓ Saved';
            btn.classList.add('saved');
            setTimeout(() => {
                btn.textContent = 'Update';
                btn.classList.remove('saved');
                btn.disabled = false;
            }, 1500);
        } else {
            btn.textContent = 'Update';
            btn.disabled = false;
        }
    } catch (err) {
        btn.textContent = 'Update';
        btn.disabled = false;
    }
}
