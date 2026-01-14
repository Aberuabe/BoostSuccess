const API_URL = 'http://localhost:3000';

// Load payments on page load
document.addEventListener('DOMContentLoaded', loadPayments);

// Refresh every 5 seconds
setInterval(loadPayments, 5000);

async function loadPayments() {
    try {
        const token = localStorage.getItem('adminToken');
        const headers = { 'x-admin-token': token };

        // Get pending payments
        const paymentRes = await fetch(`${API_URL}/admin/pending-payments`, { headers });
        const payments = await paymentRes.json();

        // Get inscriptions
        const inscriptionsRes = await fetch(`${API_URL}/admin/inscriptions`, { headers });
        const inscriptions = await inscriptionsRes.json();

        // Update stats
        const pending = payments.filter(p => p.status === 'pending').length;
        const approved = payments.filter(p => p.status === 'approved').length;
        const rejected = payments.filter(p => p.status === 'rejected').length;

        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('stat-approved').textContent = approved;
        document.getElementById('stat-rejected').textContent = rejected;
        document.getElementById('stat-total').textContent = `${inscriptions.total}/5`;

        // Display pending payments
        const pendingList = document.getElementById('pending-list');
        const pendingPayments = payments.filter(p => p.status === 'pending');

        if (pendingPayments.length === 0) {
            pendingList.innerHTML = `
                <div class="no-payments">
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>Aucun paiement en attente</p>
                    </div>
                </div>
            `;
        } else {
            pendingList.innerHTML = pendingPayments.map(payment => `
                <div class="payment-item">
                    <div class="payment-info">
                        <div>
                            <strong>Nom:</strong> ${payment.nom}
                        </div>
                        <div>
                            <strong>Email:</strong> ${payment.email}
                        </div>
                        <div>
                            <strong>WhatsApp:</strong> ${payment.whatsapp}
                        </div>
                        <div>
                            <strong>Projet:</strong> ${payment.projet.substring(0, 50)}...
                        </div>
                        <div>
                            <strong>Date:</strong> ${payment.date}
                        </div>
                        <div>
                            <span class="payment-status status-pending">En attente</span>
                        </div>
                    </div>
                    <div class="payment-actions">
                        <button class="btn-small btn-view-proof" onclick="viewProof('${payment.id}')">
                            <i class="fas fa-image"></i> Voir preuve
                        </button>
                        <button class="btn-small btn-approve" onclick="approvePayment('${payment.id}')">
                            <i class="fas fa-check"></i> Approuver
                        </button>
                        <button class="btn-small btn-reject" onclick="rejectPayment('${payment.id}')">
                            <i class="fas fa-times"></i> Rejeter
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // Display approved payments
        const approvedList = document.getElementById('approved-list');
        const approvedPayments = payments.filter(p => p.status === 'approved');

        if (approvedPayments.length === 0) {
            approvedList.innerHTML = `
                <div class="no-payments">
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>Aucune inscription approuvée</p>
                    </div>
                </div>
            `;
        } else {
            approvedList.innerHTML = approvedPayments.map(payment => `
                <div class="payment-item approved">
                    <div class="payment-info">
                        <div>
                            <strong>Nom:</strong> ${payment.nom}
                        </div>
                        <div>
                            <strong>Email:</strong> ${payment.email}
                        </div>
                        <div>
                            <strong>WhatsApp:</strong> ${payment.whatsapp}
                        </div>
                        <div>
                            <strong>Projet:</strong> ${payment.projet.substring(0, 50)}...
                        </div>
                        <div>
                            <strong>Date:</strong> ${payment.date}
                        </div>
                        <div>
                            <span class="payment-status status-approved">Approuvé</span>
                        </div>
                    </div>
                    <div class="payment-actions">
                        <button class="btn-small btn-view-proof" onclick="viewProof('${payment.id}')">
                            <i class="fas fa-image"></i> Voir preuve
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // Store payments for proof viewing
        window.paymentsData = payments;

    } catch (error) {
        console.error('Erreur:', error);
    }
}

async function approvePayment(id) {
    if (!confirm('Êtes-vous sûr de vouloir approuver ce paiement?')) {
        return;
    }

    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/approve-payment/${id}`, {
            method: 'POST',
            headers: { 'x-admin-token': token }
        });

        const data = await res.json();

        if (res.ok) {
            alert('Paiement approuvé! Inscription enregistrée.');
            loadPayments();
        } else {
            alert('Erreur: ' + data.error);
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur serveur');
    }
}

async function rejectPayment(id) {
    if (!confirm('Êtes-vous sûr de vouloir rejeter ce paiement?')) {
        return;
    }

    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/reject-payment/${id}`, {
            method: 'POST',
            headers: { 'x-admin-token': token }
        });

        const data = await res.json();

        if (res.ok) {
            alert('Paiement rejeté.');
            loadPayments();
        } else {
            alert('Erreur: ' + data.error);
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur serveur');
    }
}

function viewProof(id) {
    const payment = window.paymentsData.find(p => p.id === id);
    if (payment) {
        const modal = document.getElementById('proof-modal');

        if (payment.method === 'screenshot' && payment.proof) {
            // Afficher l'image pour les screenshots
            const img = document.getElementById('proof-img');
            img.src = `data:${payment.proofMime};base64,${payment.proof}`;
            img.style.display = 'block';
            document.getElementById('proof-text').style.display = 'none';
        } else if (payment.method === 'transaction-id' && payment.transactionId) {
            // Afficher l'ID de transaction pour les paiements par ID
            const img = document.getElementById('proof-img');
            img.style.display = 'none';

            const proofText = document.getElementById('proof-text');
            proofText.style.display = 'block';
            proofText.innerHTML = `
                <div style="padding: 20px; text-align: center; background: #2d3748; border-radius: 10px; color: white;">
                    <h3 style="color: #00d4ff; margin-bottom: 15px;">ID de Transaction</h3>
                    <p style="font-size: 1.2em; font-weight: bold; word-break: break-all; background: #4a5568; padding: 10px; border-radius: 5px;">
                        ${payment.transactionId}
                    </p>
                    <p style="margin-top: 15px; color: #a0aec0;">Méthode: ${payment.method === 'transaction-id' ? 'ID de Transaction' : 'Autre'}</p>
                </div>
            `;
        }

        modal.classList.add('show');
    }
}

function closeProofModal() {
    document.getElementById('proof-modal').classList.remove('show');
}

// Close modal on outside click
document.getElementById('proof-modal').addEventListener('click', (e) => {
    if (e.target.id === 'proof-modal') {
        closeProofModal();
    }
});

// Check authentication on page load
document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = 'admin-login.html';
    }
});

// Logout function
function logout() {
    localStorage.removeItem('adminToken');
    window.location.href = 'admin-login.html';
}
