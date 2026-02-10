const API_URL = window.location.origin;
let selectedId = null;
let allPaymentsData = [];

console.log('🚀 Admin Dashboard Script Loading...');

// --- UTILS ---
function openModal(id) { 
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex'; 
}

function closeModal(id) { 
    const el = document.getElementById(id);
    if (el) el.style.display = 'none'; 
}

function logout() { 
    localStorage.removeItem('adminToken'); 
    window.location.href = 'admin-login.html'; 
}

function confirmCustom(msg) { return confirm(msg); }

// --- UI SYSTEM ---
function showAlert(message, type = 'success') {
    const alert = document.getElementById('custom-alert');
    const icon = document.getElementById('alert-icon');
    const msg = document.getElementById('alert-message');
    
    if (!alert || !icon || !msg) return;

    alert.className = `alert-popup active alert-${type}`;
    icon.innerHTML = type === 'success' ? '<i class="fas fa-circle-check" style="color: var(--success)"></i>' : '<i class="fas fa-circle-exclamation" style="color: var(--danger)"></i>';
    msg.textContent = message;
    
    setTimeout(() => {
        alert.classList.remove('active');
    }, 4000);
}

// --- DATA CORE ---
async function loadData() {
    try {
        const token = localStorage.getItem('adminToken');
        if (!token) return;

        const headers = { 'x-admin-token': token };

        // 1. Fetch Inscriptions & Config
        const inscriptionsRes = await fetch(`${API_URL}/admin/inscriptions`, { headers });
        if (inscriptionsRes.status === 401) { logout(); return; }
        
        const inscriptionsData = await inscriptionsRes.json();

        // 2. Fetch Pending Submissions/Payments
        const paymentsRes = await fetch(`${API_URL}/admin/pending-payments`, { headers });
        const paymentsData = await paymentsRes.json();
        allPaymentsData = paymentsData;

        updateDashboard(inscriptionsData, paymentsData);
        loadAnalytics(); // Nouveau chargeur léger
    } catch (error) {
        console.error('📊 Sync Error:', error);
    }
}

function updateDashboard(config, payments) {
    const safeSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    const countReview = payments.filter(p => p.status === 'pending_review').length;
    const countPending = payments.filter(p => p.status === 'pending').length;
    const countApproved = payments.filter(p => p.status === 'approved').length;

    safeSetText('stat-review', countReview);
    safeSetText('stat-pending', countPending);
    safeSetText('stat-approved', countApproved);
    
    const totalInscrit = parseInt(config.total) || 0;
    const maxPlaces = parseInt(config.max) || 5;
    const occupancy = maxPlaces > 0 ? Math.round((totalInscrit / maxPlaces) * 100) : 0;
    
    safeSetText('stat-occupancy', `${occupancy}%`);
    safeSetText('stat-total', `${totalInscrit}/${maxPlaces}`);
    safeSetText('count-review', countReview);
    safeSetText('count-pending', countPending);
    safeSetText('count-approved', countApproved);

    const maxInput = document.getElementById('max-places-input');
    if (maxInput) maxInput.value = maxPlaces;
    
    const sessionBadge = document.getElementById('session-badge');
    const toggleBtn = document.getElementById('toggle-session-btn');
    const toggleText = document.getElementById('toggle-text');

    if (sessionBadge && toggleBtn && toggleText) {
        if (config.sessionOpen) {
            sessionBadge.textContent = 'Ouvert';
            sessionBadge.className = 'status-badge status-open';
            toggleBtn.className = 'btn btn-danger';
            toggleText.textContent = 'Fermer la session';
        } else {
            sessionBadge.textContent = 'Fermé';
            sessionBadge.className = 'status-badge status-closed';
            toggleBtn.className = 'btn btn-success';
            toggleText.textContent = 'Ouvrir la session';
        }
    }

    renderReviewList(payments.filter(p => p.status === 'pending_review'));
    renderPendingList(payments.filter(p => p.status === 'pending'));
    renderApprovedList(payments.filter(p => p.status === 'approved'));
}

async function loadAnalytics() {
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/analytics`, {
            headers: { 'x-admin-token': token }
        });
        const data = await res.json();

        // Rendu des barres pour les secteurs
        renderStatBars('analytics-sectors', data.sectors);
        // Rendu des barres pour les ODD
        renderStatBars('analytics-odd', data.odd);

    } catch (e) { console.error("Analytics error:", e); }
}

function renderStatBars(containerId, dataObj) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const entries = Object.entries(dataObj || {}).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((acc, curr) => acc + curr[1], 0);

    if (entries.length === 0) {
        container.innerHTML = '<small style="color:var(--text-dim)">Aucune donnée disponible</small>';
        return;
    }

    container.innerHTML = entries.map(([label, value]) => {
        const percent = total > 0 ? Math.round((value / total) * 100) : 0;
        return `
            <div class="stat-bar-item">
                <div class="bar-info">
                    <span>${label}</span>
                    <span>${value} (${percent}%)</span>
                </div>
                <div class="bar-rail">
                    <div class="bar-progress" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// --- RENDERERS ---
function renderReviewList(data) {
    const list = document.getElementById('review-list');
    if (!list) return;
    if (data.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 40px;">Aucun projet en attente.</div>';
        return;
    }
    list.innerHTML = data.map(p => `
        <div class="data-item">
            <div class="item-main">
                <div class="item-title">${p.nom}</div>
                <div class="item-meta">
                    <span><i class="fab fa-whatsapp"></i> ${p.whatsapp}</span>
                    <span><i class="fas fa-calendar"></i> ${new Date(p.date).toLocaleDateString()}</span>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn btn-outline" onclick="viewProject('${p.id}')"><i class="fas fa-eye"></i> Lire Projet</button>
                <button class="btn btn-success btn-icon" onclick="approveProject('${p.id}')"><i class="fas fa-check"></i></button>
                <button class="btn btn-danger btn-icon" onclick="openRejectModal('${p.id}')"><i class="fas fa-times"></i></button>
            </div>
        </div>
    `).join('');
}

function renderPendingList(data) {
    const list = document.getElementById('pending-list');
    if (!list) return;
    if (data.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 40px;">Aucun paiement à vérifier.</div>';
        return;
    }
    list.innerHTML = data.map(p => `
        <div class="data-item">
            <div class="item-main">
                <div class="item-title">${p.nom}</div>
                <div class="item-meta">
                    <span><i class="fas fa-credit-card"></i> ${p.method === 'screenshot' ? 'Capture Écran' : 'ID Transaction'}</span>
                    <span><i class="fas fa-clock"></i> ${new Date(p.date).toLocaleTimeString()}</span>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn btn-outline" onclick="viewProof('${p.id}')"><i class="fas fa-image"></i> Voir Preuve</button>
                <button class="btn btn-primary" onclick="openConfirmPaymentModal('${p.id}')"><i class="fas fa-check-double"></i> Valider</button>
                <button class="btn btn-danger btn-icon" onclick="rejectPayment('${p.id}')"><i class="fas fa-times"></i></button>
            </div>
        </div>
    `).join('');
}

function renderApprovedList(data) {
    const list = document.getElementById('approved-list');
    if (!list) return;
    if (data.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 40px;">Aucun membre officiel.</div>';
        return;
    }
    list.innerHTML = data.map(p => `
        <div class="data-item">
            <div class="item-main">
                <div class="item-title">${p.nom}</div>
                <div class="item-meta">
                    <span><i class="fas fa-envelope"></i> ${p.email}</span>
                    <span><i class="fas fa-check-circle" style="color: var(--success)"></i> Approuvé</span>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn btn-ghost" onclick="viewProject('${p.id}')"><i class="fas fa-file-invoice"></i> Détails</button>
            </div>
        </div>
    `).join('');
}

// --- ACTIONS ---
function viewProject(id) {
    const project = allPaymentsData.find(p => p.id == id);
    if (!project) return;
    const info = document.getElementById('project-details-info');
    if (info) info.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px;">
            <div><strong>Client:</strong> ${project.nom}</div>
            <div><strong>WhatsApp:</strong> ${project.whatsapp}</div>
            <div><strong>Email:</strong> ${project.email}</div>
            <div><strong>Date:</strong> ${new Date(project.date).toLocaleString()}</div>
        </div>
    `;
    const text = document.getElementById('project-full-text');
    if (text) text.textContent = project.projet;
    openModal('project-modal');
}

async function approveProject(id) {
    if (!confirmCustom('Valider l\'analyse technique et autoriser le paiement ?')) return;
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/approve-project/${id}`, {
            method: 'POST',
            headers: { 'x-admin-token': token }
        });
        if (res.ok) { showAlert('Projet validé !'); loadData(); }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

function openRejectModal(id) { selectedId = id; openModal('reject-modal'); }

async function confirmRejectProject() {
    const reason = document.getElementById('reject-reason').value;
    if (!reason) { showAlert('Motif requis', 'error'); return; }
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/reject-project/${selectedId}`, {
            method: 'POST',
            headers: { 'x-admin-token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        if (res.ok) { showAlert('Projet rejeté.'); closeModal('reject-modal'); loadData(); }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

function viewProof(id) {
    const p = allPaymentsData.find(x => x.id == id);
    const container = document.getElementById('proof-container');
    if (!p || !container) return;
    if (p.method === 'screenshot' && p.proof) {
        container.innerHTML = `<img src="data:${p.proofmime || 'image/png'};base64,${p.proof}" style="max-width:100%; border-radius:12px; border: 1px solid var(--border);">`;
    } else {
        container.innerHTML = `<div style="padding: 40px; background: rgba(0,0,0,0.3); border-radius: 12px; border: 1px dashed var(--primary); text-align: center;"><h2 style="color: var(--primary); font-size: 2rem;">${p.transactionid}</h2></div>`;
    }
    openModal('proof-modal');
}

function openConfirmPaymentModal(id) { selectedId = id; openModal('confirm-payment-modal'); }

async function confirmApprovePayment() {
    const groupLink = document.getElementById('group-link-input').value;
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/approve-payment/${selectedId}`, {
            method: 'POST',
            headers: { 'x-admin-token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupLink })
        });
        if (res.ok) { showAlert('Paiement validé !'); closeModal('confirm-payment-modal'); loadData(); }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

async function rejectPayment(id) {
    if (!confirmCustom('Rejeter ce paiement ?')) return;
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/reject-payment/${id}`, {
            method: 'POST',
            headers: { 'x-admin-token': token }
        });
        if (res.ok) { showAlert('Paiement rejeté.'); loadData(); }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

async function toggleSession() {
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/toggle-session`, {
            method: 'POST',
            headers: { 'x-admin-token': token }
        });
        if (res.ok) { const data = await res.json(); showAlert(data.message); loadData(); }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

async function updatePlaces(action) {
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/update-places`, {
            method: 'POST',
            headers: { 'x-admin-token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        if (res.ok) loadData();
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

async function resetAll() {
    if (!confirmCustom('⚠️ RESET GLOBAL ?')) return;
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/reset-all`, {
            method: 'POST',
            headers: { 'x-admin-token': token }
        });
        if (res.ok) { showAlert('Reset terminé !'); loadData(); }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

async function resetPlaces() {
    if (!confirmCustom('Reset places à 5 ?')) return;
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/update-places`, {
            method: 'POST',
            headers: { 'x-admin-token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reset' })
        });
        if (res.ok) loadData();
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOM Ready');
    if (!localStorage.getItem('adminToken')) {
        window.location.href = 'admin-login.html';
    } else {
        loadData();
        setInterval(loadData, 15000); // Polling toutes les 15s
    }
});