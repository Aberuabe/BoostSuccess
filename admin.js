const API_URL = window.location.origin;
let selectedId = null;
let allPaymentsData = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = 'admin-login.html';
        return;
    }
    
    loadData();
    // Sync every 15 seconds
    setInterval(loadData, 15000);
});

// Custom Alert System
function showAlert(message, type = 'success') {
    const alert = document.getElementById('custom-alert');
    const icon = document.getElementById('alert-icon');
    const msg = document.getElementById('alert-message');
    
    alert.className = `alert-popup active alert-${type}`;
    icon.innerHTML = type === 'success' ? '<i class="fas fa-circle-check" style="color: var(--success)"></i>' : '<i class="fas fa-circle-exclamation" style="color: var(--danger)"></i>';
    msg.textContent = message;
    
    setTimeout(() => {
        alert.classList.remove('active');
    }, 4000);
}

// Global Load Data
async function loadData() {
    try {
        const token = localStorage.getItem('adminToken');
        const headers = { 'x-admin-token': token };

        // 1. Fetch Inscriptions & Config
        const inscriptionsRes = await fetch(`${API_URL}/admin/inscriptions`, { headers });
        const inscriptionsData = await inscriptionsRes.json();

        if (inscriptionsRes.status === 401) {
            logout();
            return;
        }

        // 2. Fetch Pending Submissions/Payments
        const paymentsRes = await fetch(`${API_URL}/admin/pending-payments`, { headers });
        const paymentsData = await paymentsRes.json();
        allPaymentsData = paymentsData;

        updateDashboard(inscriptionsData, paymentsData);
    } catch (error) {
        console.error('Sync Error:', error);
        // Silent fail for polling
    }
}

function updateDashboard(config, payments) {
    // Helper to safely set text content
    const safeSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    const countReview = payments.filter(p => p.status === 'pending_review').length;
    const countPending = payments.filter(p => p.status === 'pending').length;
    const countApproved = payments.filter(p => p.status === 'approved').length;

    // Update Stats
    safeSetText('stat-review', countReview);
    safeSetText('stat-pending', countPending);
    safeSetText('stat-approved', countApproved);
    
    // Config values from /admin/inscriptions response
    const totalInscrit = parseInt(config.total) || 0;
    const maxPlaces = parseInt(config.max) || 5;
    
    const occupancy = maxPlaces > 0 ? Math.round((totalInscrit / maxPlaces) * 100) : 0;
    safeSetText('stat-occupancy', `${occupancy}%`);
    safeSetText('stat-total', `${totalInscrit}/${maxPlaces}`);

    // Badge counts in section headers
    safeSetText('count-review', countReview);
    safeSetText('count-pending', countPending);
    safeSetText('count-approved', countApproved);

    // Update Controls
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

    // Render Lists
    renderReviewList(payments.filter(p => p.status === 'pending_review'));
    renderPendingList(payments.filter(p => p.status === 'pending'));
    renderApprovedList(payments.filter(p => p.status === 'approved'));
}

function renderReviewList(data) {
    const list = document.getElementById('review-list');
    document.getElementById('count-review').textContent = data.length;

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
                <button class="btn btn-success btn-icon" title="Approuver" onclick="approveProject('${p.id}')"><i class="fas fa-check"></i></button>
                <button class="btn btn-danger btn-icon" title="Rejeter" onclick="openRejectModal('${p.id}')"><i class="fas fa-times"></i></button>
            </div>
        </div>
    `).join('');
}

function renderPendingList(data) {
    const list = document.getElementById('pending-list');
    document.getElementById('count-pending').textContent = data.length;

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
    document.getElementById('count-approved').textContent = data.length;

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

// Project Functions
function viewProject(id) {
    const project = allPaymentsData.find(p => p.id == id);
    if (!project) return;
    
    document.getElementById('project-details-info').innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px;">
            <div><strong>Client:</strong> ${project.nom}</div>
            <div><strong>WhatsApp:</strong> ${project.whatsapp}</div>
            <div><strong>Email:</strong> ${project.email}</div>
            <div><strong>Date:</strong> ${new Date(project.date).toLocaleString()}</div>
        </div>
    `;
    document.getElementById('project-full-text').textContent = project.projet;
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
        
        if (res.ok) {
            showAlert('Projet validé ! Client notifié par email.');
            loadData();
        } else {
            showAlert('Erreur lors de la validation', 'error');
        }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

function openRejectModal(id) {
    selectedId = id;
    openModal('reject-modal');
}

async function confirmRejectProject() {
    const reason = document.getElementById('reject-reason').value;
    if (!reason) { showAlert('Veuillez saisir un motif', 'error'); return; }
    
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/reject-project/${selectedId}`, {
            method: 'POST',
            headers: { 
                'x-admin-token': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        if (res.ok) {
            showAlert('Projet rejeté et client notifié.');
            closeModal('reject-modal');
            loadData();
        }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

// Payment Functions
function viewProof(id) {
    const p = allPaymentsData.find(x => x.id == id);
    const container = document.getElementById('proof-container');
    
    if (p.method === 'screenshot' && p.proof) {
        container.innerHTML = `<img src="data:${p.proofmime || 'image/png'};base64,${p.proof}" style="max-width:100%; border-radius:12px; border: 1px solid var(--border);">`;
    } else {
        container.innerHTML = `
            <div style="padding: 40px; background: rgba(0,0,0,0.3); border-radius: 12px; border: 1px dashed var(--primary); text-align: center;">
                <h2 style="color: var(--primary); font-size: 2rem; letter-spacing: 2px;">${p.transactionid}</h2>
                <p style="margin-top: 10px; color: var(--text-dim);">Identifiant de transaction (Mobile Money)</p>
            </div>
        `;
    }
    openModal('proof-modal');
}

function openConfirmPaymentModal(id) {
    selectedId = id;
    openModal('confirm-payment-modal');
}

async function confirmApprovePayment() {
    const groupLink = document.getElementById('group-link-input').value;
    
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/approve-payment/${selectedId}`, {
            method: 'POST',
            headers: { 
                'x-admin-token': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ groupLink })
        });
        
        if (res.ok) {
            showAlert('Paiement validé ! Inscription terminée.');
            closeModal('confirm-payment-modal');
            loadData();
        } else {
            const data = await res.json();
            showAlert(data.error || 'Erreur lors de la validation', 'error');
        }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

async function rejectPayment(id) {
    if (!confirmCustom('Rejeter cette preuve de paiement ?')) return;
    
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/reject-payment/${id}`, {
            method: 'POST',
            headers: { 'x-admin-token': token }
        });
        
        if (res.ok) {
            showAlert('Paiement rejeté.');
            loadData();
        }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

// Session & Capacity Controls
async function toggleSession() {
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/toggle-session`, {
            method: 'POST',
            headers: { 'x-admin-token': token }
        });
        
        if (res.ok) {
            const data = await res.json();
            showAlert(data.message);
            loadData();
        }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

async function updatePlaces(action) {
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/update-places`, {
            method: 'POST',
            headers: { 
                'x-admin-token': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action })
        });
        
        if (res.ok) {
            const data = await res.json();
            showAlert(`Capacité mise à jour: ${data.maxPlaces}`);
            loadData();
        }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

async function resetAll() {
    if (!confirmCustom('⚠️ ATTENTION: Cela va vider TOUTES les inscriptions et remettre les places à 5. Continuer ?')) return;
    
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/reset-all`, {
            method: 'POST',
            headers: { 'x-admin-token': token }
        });
        
        if (res.ok) {
            showAlert('Système réinitialisé !');
            loadData();
        } else {
            showAlert('Erreur lors de la réinitialisation', 'error');
        }
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

async function resetPlaces() {
    if (!confirmCustom('Réinitialiser la capacité à 5 places ?')) return;
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/update-places`, {
            method: 'POST',
            headers: { 
                'x-admin-token': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'reset' })
        });
        if (res.ok) loadData();
    } catch (e) { showAlert('Erreur serveur', 'error'); }
}

// Utils
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function logout() { localStorage.removeItem('adminToken'); window.location.href = 'admin-login.html'; }
function confirmCustom(msg) { return confirm(msg); } // Can be replaced later with custom modal confirm