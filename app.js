// Configuration API
const API_URL = 'http://localhost:3000';

// Elements
const acceptanceInput = document.getElementById('terms-input');
const acceptanceStatus = document.getElementById('acceptance-status');
const formSection = document.getElementById('form-section');
const inscriptionForm = document.getElementById('inscription-form');
const formMessage = document.getElementById('form-message');
const navbar = document.querySelector('.navbar');
const navbarPlaces = document.getElementById('seat-count');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');

// Form input elements for progress tracking
const nomInput = document.getElementById('nom');
const emailInput = document.getElementById('email');
const whatsappInput = document.getElementById('whatsapp');
const projetInput = document.getElementById('projet');
const confirmCheckbox = document.getElementById('confirm-conditions');

// ===== NAVBAR SCROLL EFFECT =====
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// ===== INTERSECTION OBSERVER FOR ANIMATIONS =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll('.animate-on-scroll').forEach(el => {
    observer.observe(el);
});

// ===== ACCEPTANCE LOGIC =====
acceptanceInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    const isValid = value.toLowerCase() === "j'accepte";

    if (isValid) {
        acceptanceStatus.textContent = '✓ Conditions acceptées';
        acceptanceStatus.classList.add('success');
        acceptanceStatus.classList.remove('error');
        
        // Show form section
        formSection.style.display = 'block';
        
        // Smooth scroll to form
        setTimeout(() => {
            formSection.scrollIntoView({ behavior: 'smooth' });
        }, 300);
    } else {
        if (value.length > 0) {
            acceptanceStatus.textContent = '✗ Phrase incorrecte';
            acceptanceStatus.classList.add('error');
            acceptanceStatus.classList.remove('success');
        } else {
            acceptanceStatus.textContent = '';
            acceptanceStatus.classList.remove('success', 'error');
        }
        
        formSection.style.display = 'none';
    }
});

// ===== FETCH INSCRIPTIONS COUNT =====
async function updateInscriptionsCount() {
    try {
        const response = await fetch(`${API_URL}/api/inscriptions-count`);
        const data = await response.json();
        
        const places = data.count;
        const max = data.max;
        const isFull = places >= max;

        // Update display
        navbarPlaces.textContent = `${places}/${max}`;
        
        if (isFull) {
            // Disable form
            inscriptionForm.style.pointerEvents = 'none';
            inscriptionForm.style.opacity = '0.5';
            inscriptionForm.disabled = true;
        } else {
            // Enable form
            inscriptionForm.style.pointerEvents = 'auto';
            inscriptionForm.style.opacity = '1';
            inscriptionForm.disabled = false;
        }
    } catch (error) {
        console.error('Erreur récupération inscriptions:', error);
    }
}

// Load count on page load (immediate)
updateInscriptionsCount();

// Update count every 30 seconds
setInterval(updateInscriptionsCount, 30000);

// ===== FORM PROGRESS BAR =====
function updateFormProgress() {
    let filledFields = 0;
    const totalFields = 5;

    if (nomInput.value.trim()) filledFields++;
    if (emailInput.value.trim()) filledFields++;
    if (whatsappInput.value.trim()) filledFields++;
    if (projetInput.value.trim()) filledFields++;
    if (confirmCheckbox.checked) filledFields++;

    const percentage = (filledFields / totalFields) * 100;
    progressFill.style.width = percentage + '%';
    progressText.textContent = Math.round(percentage) + '%';
}

// Track form input changes
nomInput.addEventListener('input', updateFormProgress);
emailInput.addEventListener('input', updateFormProgress);
whatsappInput.addEventListener('input', updateFormProgress);
projetInput.addEventListener('input', updateFormProgress);
confirmCheckbox.addEventListener('change', updateFormProgress);

// Store form data for payment confirmation
let pendingFormData = null;

// ===== FORM SUBMISSION =====
inscriptionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nom = document.getElementById('nom').value.trim();
    const email = document.getElementById('email').value.trim();
    const whatsapp = document.getElementById('whatsapp').value.trim();
    const projet = document.getElementById('projet').value.trim();
    const confirmConditions = document.getElementById('confirm-conditions').checked;

    // Validation
    if (!nom || !email || !whatsapp || !projet || !confirmConditions) {
        showError('Veuillez remplir tous les champs');
        return;
    }

    // Validation email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showError('Veuillez entrer une adresse email valide');
        return;
    }

    // Validation WhatsApp (chiffres uniquement)
    const whatsappRegex = /^[0-9]{10,15}$/;
    if (!whatsappRegex.test(whatsapp)) {
        showError('Le numéro WhatsApp doit contenir uniquement des chiffres (10-15 chiffres)');
        return;
    }

    // Disable button during submission
    const submitBtn = inscriptionForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Vérification...';

    try {
        const response = await fetch(`${API_URL}/api/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ nom, email, whatsapp, projet })
        });

        const data = await response.json();

        if (response.ok) {
            // Store form data for later confirmation
            pendingFormData = { nom, email, whatsapp, projet };
            
            // Show payment instructions modal
            showPaymentInstructions(nom);
            
            // Reset form
            inscriptionForm.reset();
        } else {
            if (response.status === 409) {
                showError('Les places sont épuisées');
                updateInscriptionsCount();
            } else {
                showError(data.error || 'Une erreur s\'est produite');
            }
        }
    } catch (error) {
        console.error('Erreur:', error);
        showError('Erreur de connexion au serveur');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
});

// ===== PAYMENT FORM HANDLING =====
const paymentForm = document.getElementById('payment-form');
const paymentProofInput = document.getElementById('payment-proof');
const proofPreview = document.getElementById('proof-preview');
const proofImage = document.getElementById('proof-image');
const paymentMethod = document.getElementById('payment-method');
const screenshotGroup = document.getElementById('screenshot-group');
const transactionGroup = document.getElementById('transaction-group');

// Update proof input visibility
function updateProofInput() {
    const method = paymentMethod.value;
    if (method === 'screenshot') {
        screenshotGroup.style.display = 'block';
        transactionGroup.style.display = 'none';
        paymentProofInput.required = true;
        document.getElementById('transaction-id').required = false;
    } else if (method === 'transaction-id') {
        screenshotGroup.style.display = 'none';
        transactionGroup.style.display = 'block';
        paymentProofInput.required = false;
        document.getElementById('transaction-id').required = true;
    } else {
        screenshotGroup.style.display = 'none';
        transactionGroup.style.display = 'none';
    }
}

if (paymentProofInput) {
    paymentProofInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                proofImage.src = event.target.result;
                proofPreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });
}

// ===== CONFIRM PAYMENT WITH PROOF =====
if (paymentForm) {
    console.log('✅ Formulaire paiement trouvé et initialisé');
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('📤 Formulaire paiement soumis');

        if (!pendingFormData) {
            console.error('❌ Données manquantes');
            showError('Données manquantes');
            return;
        }
        console.log('✅ Données formulaire présentes:', pendingFormData);

        const method = paymentMethod.value;
        if (!method) {
            showError('Sélectionnez le type de preuve');
            return;
        }

        let proofFile = null;
        let transactionId = null;

        if (method === 'screenshot') {
            proofFile = paymentProofInput.files[0];
            if (!proofFile) {
                showError('Veuillez télécharger la capture d\'écran');
                return;
            }
        } else if (method === 'transaction-id') {
            transactionId = document.getElementById('transaction-id').value.trim();
            if (!transactionId) {
                showError('Veuillez entrer l\'ID de transaction');
                return;
            }
            // Validation : 11 chiffres
            if (!/^[0-9]{11}$/.test(transactionId)) {
                showError('L\'ID de transaction doit contenir exactement 11 chiffres');
                return;
            }
        }

        const confirmBtn = document.getElementById('confirm-payment-btn');
        const originalText = confirmBtn.innerHTML;
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...';

        try {
            const formData = new FormData();
            formData.append('nom', pendingFormData.nom);
            formData.append('email', pendingFormData.email);
            formData.append('whatsapp', pendingFormData.whatsapp);
            formData.append('projet', pendingFormData.projet);
            formData.append('method', method);
            
            if (proofFile) {
                formData.append('proof', proofFile);
            }
            if (transactionId) {
                formData.append('transactionId', transactionId);
            }

            console.log('🚀 Envoi requête à', `${API_URL}/api/confirm-payment`);
            console.log('📦 FormData:', {
                nom: pendingFormData.nom,
                method: method,
                hasFile: !!proofFile,
                hasTransactionId: !!transactionId
            });

            const response = await fetch(`${API_URL}/api/confirm-payment`, {
                method: 'POST',
                body: formData
            });

            console.log('📨 Réponse reçue, status:', response.status);

            const data = await response.json();

            if (response.ok) {
                // Close payment modal
                closePaymentModal();
                
                // Show success modal
                showSuccess(`Paiement reçu! Nous allons vérifier et vous envoyer le lien d'accès au groupe dans les 30 minutes.`);
                
                // Reset everything
                acceptanceInput.value = '';
                acceptanceStatus.textContent = '';
                acceptanceStatus.classList.remove('success', 'error');
                formSection.style.display = 'none';
                pendingFormData = null;
                paymentForm.reset();
                proofPreview.style.display = 'none';
                paymentMethod.value = '';
                screenshotGroup.style.display = 'none';
                transactionGroup.style.display = 'none';
            } else {
                showError(data.error || 'Erreur lors de la confirmation');
            }
        } catch (error) {
            console.error('Erreur:', error);
            showError('Erreur de connexion au serveur');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = originalText;
        }
    });
}



// ===== MODALS =====
function showSuccess(message) {
    const modal = document.getElementById('success-modal');
    document.getElementById('modal-message').textContent = message;
    modal.classList.add('active');
}

function showError(message) {
    const modal = document.getElementById('error-modal');
    document.getElementById('error-message').textContent = message;
    modal.classList.add('active');
}

function showPaymentInstructions(nom) {
    const modal = document.getElementById('payment-modal');
    console.log('🔓 Ouverture modal paiement pour:', nom);
    if (modal) {
        document.getElementById('payment-name').textContent = nom;
        modal.classList.add('active');
    } else {
        console.error('❌ Modal paiement non trouvée');
    }
}

function closeModal() {
    document.getElementById('success-modal').classList.remove('active');
}

function closeErrorModal() {
    document.getElementById('error-modal').classList.remove('active');
}

function closePaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Close modals on outside click
document.addEventListener('click', (e) => {
    const successModal = document.getElementById('success-modal');
    const errorModal = document.getElementById('error-modal');
    const paymentModal = document.getElementById('payment-modal');
    
    if (e.target === successModal) {
        successModal.classList.remove('active');
    }
    if (e.target === errorModal) {
        errorModal.classList.remove('active');
    }
    if (e.target === paymentModal) {
        paymentModal.classList.remove('active');
    }
});

// ===== SMOOTH SCROLL OFFSET FOR FIXED NAVBAR =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ===== FORM INPUT ANIMATIONS =====
const inputs = document.querySelectorAll('.form-group input, .form-group textarea');
inputs.forEach(input => {
    input.addEventListener('focus', function() {
        this.parentElement.classList.add('focused');
    });
    
    input.addEventListener('blur', function() {
        if (!this.value) {
            this.parentElement.classList.remove('focused');
        }
    });
});

// ===== PREVENT FORM SPAM =====
let lastSubmitTime = 0;
const submitBtn = inscriptionForm.querySelector('button[type="submit"]');

inscriptionForm.addEventListener('submit', (e) => {
    const now = Date.now();
    if (now - lastSubmitTime < 2000) {
        e.preventDefault();
        return;
    }
    lastSubmitTime = now;
});

console.log('✅ Application chargée');
