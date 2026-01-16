const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const emailjs = require('@emailjs/browser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration pour les déploiements derrière un proxy
app.set('trust proxy', 1);

// Middleware de sécurité - CORS
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests without origin (local files, mobile apps, etc)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost',
      'http://127.0.0.1:3000',
      'http://127.0.0.1',
      'https://boostsuccess.onrender.com'
    ];

    // Autoriser l'origine si elle est dans la liste ou si on n'est pas en production
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir les fichiers statiques mais exclure les fichiers sensibles
app.use((req, res, next) => {
  if (['.env', 'admin-password.json', 'pending-payments.json', 'inscriptions.json'].some(file => req.path.includes(file))) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  next();
});

app.use(express.static('.'));

// Logger structuré
const logger = {
  info: (msg, data = '') => console.log(`[INFO] ${new Date().toLocaleTimeString()} ${msg} ${data}`),
  warn: (msg, data = '') => console.warn(`[WARN] ${new Date().toLocaleTimeString()} ${msg} ${data}`),
  error: (msg, data = '') => console.error(`[ERROR] ${new Date().toLocaleTimeString()} ${msg} ${data}`),
};

// Rate Limiting Configuration
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requêtes par IP
  message: 'Trop de requêtes, veuillez réessayer plus tard',
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives de login
  message: 'Trop de tentatives de connexion, réessayez dans 15 minutes',
  skipSuccessfulRequests: true,
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // 10 paiements par IP par heure
  message: 'Trop de paiements envoyés, veuillez réessayer plus tard',
});

// Appliquer le rate limiter global
app.use(generalLimiter);

// Redirection HTTPS en production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect('https://' + req.headers.host + req.url);
  }
  next();
});

// Log toutes les requêtes
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Setup multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Fichiers de données
const INSCRIPTIONS_FILE = path.join(__dirname, 'inscriptions.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const ADMIN_FILE = path.join(__dirname, 'admin-password.json');
const PENDING_PAYMENTS_FILE = path.join(__dirname, 'pending-payments.json');
const GROUP_LINKS_FILE = path.join(__dirname, 'group-links.json');

// Sessions admin (stocké en mémoire, réinitialisation au redémarrage du serveur)
const adminSessions = new Map();

// Charger la configuration
function getConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = { maxPlaces: 5, sessionOpen: true };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

let MAX_INSCRIPTIONS = getConfig().maxPlaces;

// Initialiser les fichiers s'ils n'existent pas
if (!fs.existsSync(INSCRIPTIONS_FILE)) {
  fs.writeFileSync(INSCRIPTIONS_FILE, JSON.stringify([], null, 2));
}

if (!fs.existsSync(PENDING_PAYMENTS_FILE)) {
  fs.writeFileSync(PENDING_PAYMENTS_FILE, JSON.stringify([], null, 2));
}

if (!fs.existsSync(GROUP_LINKS_FILE)) {
  fs.writeFileSync(GROUP_LINKS_FILE, JSON.stringify({ groups: [] }, null, 2));
}

// Fonctions utilitaires
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>\"']/g, '').slice(0, 500);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 100;
}

// Fonction pour sauvegarder le PDF signé
function saveSignedPDF(nom, email, whatsapp, pdfBuffer) {
  try {
    // Créer le dossier s'il n'existe pas
    const pdfDir = path.join(__dirname, 'signed-pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    // Générer un nom de fichier unique
    const fileName = `acceptance_${nom.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
    const filePath = path.join(pdfDir, fileName);

    // Sauvegarder le PDF
    fs.writeFileSync(filePath, pdfBuffer);

    logger.info(`PDF signé sauvegardé pour ${nom}: ${fileName}`);
    return filePath;
  } catch (error) {
    logger.error('Erreur sauvegarde PDF signé:', error.message);
    return null;
  }
}

// Fonction pour générer un PDF de conditions d'acceptation
function generateAcceptancePDF(nom, email, whatsapp) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      // En-tête
      doc.fontSize(20).font('Helvetica-Bold').text('Boost & Success', { align: 'center' });
      doc.fontSize(12).font('Helvetica').text('Formulaire d\'Acceptation des Conditions', { align: 'center' });
      doc.moveDown();

      // Informations
      doc.fontSize(11).text('Date et heure:', { underline: true });
      doc.text(new Date().toLocaleString('fr-FR'));
      doc.moveDown();

      doc.text('Informations du Client:', { underline: true });
      doc.text(`Nom: ${nom}`);
      doc.text(`Email: ${email}`);
      doc.text(`WhatsApp: ${whatsapp}`);
      doc.moveDown();

      // Conditions
      doc.fontSize(12).font('Helvetica-Bold').text('Conditions d\'Acceptation', { underline: true });
      doc.fontSize(11).font('Helvetica');

      const conditions = `
1. INSCRIPTION
Le client accepte de s'inscrire au programme Boost & Success en versant le montant requis.

2. VÉRIFICATION DU PAIEMENT
Le client comprend que son paiement doit être vérifié avant son approbation. Ce processus peut prendre jusqu'à 24 heures.

3. ACCÈS AU GROUPE PRIVÉ
Une fois approuvé, le client aura accès au groupe privé Boost & Success avec tous les bénéfices associés.

4. CONDITIONS DE SERVICE
- Le client s'engage à respecter les règles du groupe
- Le client ne doit pas partager les contenus privés en dehors du groupe
- Le client accepte les conditions de la plateforme

5. CONFIRMATION
Le client confirme qu'il accepte volontairement ces conditions SANS CONTRAINTE et qu'aucune pression n'a été exercée.

6. RESPONSABILITÉ
Boost & Success décline toute responsabilité en cas de dispute ou désaccord ultérieur concernant les conditions.

7. ARCHIVAGE
Ce document serve de preuve d'acceptation des conditions par le client.
      `.trim();

      doc.text(conditions, {
        align: 'left',
        lineGap: 5
      });

      doc.moveDown();

      // Signatures
      doc.fontSize(11).font('Helvetica-Bold').text('Acceptation Volontaire', { underline: true });
      doc.fontSize(10).font('Helvetica');
      doc.text('Je déclare avoir lu, compris et accepté les conditions ci-dessus de manière volontaire et sans contrainte.');
      doc.moveDown(2);

      doc.text(`Signature du client (digitale): ${nom}`);
      doc.text(`Date et heure de signature: ${new Date().toLocaleString('fr-FR')}`);
      doc.moveDown();

      doc.fontSize(9).text('---', { align: 'center' });
      doc.fontSize(8).text('Document généré automatiquement par Boost & Success', { align: 'center' });
      doc.text(`ID de transaction: ${Date.now()}`, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Fonction pour lire les inscriptions
function getInscriptions() {
   const data = fs.readFileSync(INSCRIPTIONS_FILE, 'utf8');
   return JSON.parse(data);
}

// Fonction pour sauvegarder une inscription
function saveInscription(userData) {
  const inscriptions = getInscriptions();
  inscriptions.push({
    id: Date.now(),
    ...userData,
    date: new Date().toLocaleString('fr-FR')
  });
  fs.writeFileSync(INSCRIPTIONS_FILE, JSON.stringify(inscriptions, null, 2));
  return inscriptions.length;
}

// Fonction pour générer un token de session
function generateSessionToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Middleware d'authentification admin
function requireAdminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.body.token;

  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: 'Non authentifié. Veuillez vous connecter.' });
  }

  // Vérifier l'expiration (24 heures)
  const session = adminSessions.get(token);
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    adminSessions.delete(token);
    return res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
  }

  next();
}

// Fonctions d'envoi d'e-mails via EmailJS
async function sendEmail(toEmail, subject, htmlContent, templateId = process.env.EMAILJS_TEMPLATE_APPROVAL_ID) {
  const emailjsServiceId = process.env.EMAILJS_SERVICE_ID;
  const emailjsUserId = process.env.EMAILJS_USER_ID;

  if (!emailjsServiceId || !templateId || !emailjsUserId) {
    console.warn('⚠️ Identifiants EmailJS non configurés. Vérifiez EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_APPROVAL_ID et EMAILJS_USER_ID dans les variables d\'environnement.');
    return false;
  }

  try {
    console.log(`📧 Envoi email via EmailJS à ${toEmail}...`);

    // Configuration de EmailJS
    emailjs.init(emailjsUserId);

    // Paramètres de l'e-mail
    const templateParams = {
      to_email: toEmail,
      subject: subject,
      html_content: htmlContent
    };

    // Envoi de l'e-mail
    const response = await emailjs.send(
      emailjsServiceId,
      templateId,
      templateParams
    );

    if (response.status === 200) {
      console.log(`✅ Email envoyé via EmailJS à ${toEmail}`);
      return true;
    } else {
      console.error(`❌ Erreur EmailJS: ${response.status} - ${response.text}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Erreur envoi email via EmailJS:', error.message);
    return false;
  }
}

async function sendEmailWithAttachment(toEmail, subject, htmlContent, attachmentName, attachmentPath) {
  const emailjsServiceId = process.env.EMAILJS_SERVICE_ID;
  const emailjsTemplateId = process.env.EMAILJS_TEMPLATE_APPROVAL_ID;
  const emailjsUserId = process.env.EMAILJS_USER_ID;

  if (!emailjsServiceId || !emailjsTemplateId || !emailjsUserId) {
    console.warn('⚠️ Identifiants EmailJS non configurés. Vérifiez EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_APPROVAL_ID et EMAILJS_USER_ID dans les variables d\'environnement.');
    return false;
  }

  try {
    console.log(`📧 Envoi email avec pièce jointe via EmailJS à ${toEmail}...`);

    // Lire le fichier PDF
    const pdfBuffer = fs.readFileSync(attachmentPath);
    const pdfBase64 = pdfBuffer.toString('base64');

    // Configuration de EmailJS
    emailjs.init(emailjsUserId);

    // Paramètres de l'e-mail avec pièce jointe
    const templateParams = {
      to_email: toEmail,
      subject: subject,
      html_content: htmlContent,
      attachment_name: attachmentName,
      attachment_content: pdfBase64
    };

    // Envoi de l'e-mail
    const response = await emailjs.send(
      emailjsServiceId,
      emailjsTemplateId,
      templateParams
    );

    if (response.status === 200) {
      console.log(`✅ Email avec pièce jointe envoyé via EmailJS à ${toEmail}`);
      return true;
    } else {
      console.error(`❌ Erreur EmailJS avec pièce jointe: ${response.status} - ${response.text}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Erreur envoi email avec pièce jointe via EmailJS:', error.message);
    return false;
  }
}

// Route pour initialiser/mettre à jour le mot de passe admin (une seule fois au démarrage)
async function initAdminPassword() {
  try {
    // Si le fichier admin-password.json n'existe pas, créer avec le mot de passe par défaut
    if (!fs.existsSync(ADMIN_FILE)) {
      const plainPassword = process.env.ADMIN_PASSWORD || 'Admin@12346'; // Mot de passe par défaut mis à jour
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      const adminConfig = { password: hashedPassword };
      fs.writeFileSync(ADMIN_FILE, JSON.stringify(adminConfig, null, 2));
      logger.info('Mot de passe admin haché et sauvegardé');
    } else {
      // Si le fichier existe, on ne fait rien pour préserver le mot de passe existant
      logger.info('Fichier admin-password.json existe déjà, mot de passe inchangé');
    }
  } catch (error) {
    logger.error('Erreur initialisation password:', error.message);
  }
}

// Initialiser au démarrage
initAdminPassword();

// Route de login admin
app.post('/admin/login', loginLimiter, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Mot de passe requis' });
    }

    const adminConfig = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));

    // Comparer le mot de passe haché
    const passwordMatch = await bcrypt.compare(password, adminConfig.password);

    if (!passwordMatch) {
      logger.warn('Tentative de connexion échouée');
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // Créer une session
    const token = generateSessionToken();
    adminSessions.set(token, { createdAt: Date.now() });

    logger.info('Admin connecté avec token:', token.substring(0, 10) + '...');
    res.json({
      success: true,
      token: token,
      message: 'Connecté avec succès'
    });
  } catch (error) {
    logger.error('Erreur login:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour logout
app.post('/admin/logout', (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.body.token;
    if (token) {
      adminSessions.delete(token);
    }
    res.json({ success: true, message: 'Déconnecté' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour télécharger le PDF d'acceptation des conditions
app.post('/api/download-acceptance-pdf', async (req, res) => {
  try {
    const { nom, email, whatsapp } = req.body;

    // Valider les infos
    if (!nom || !email || !whatsapp) {
      return res.status(400).json({ error: 'Informations incomplètes' });
    }

    // Générer le PDF
    const pdfBuffer = await generateAcceptancePDF(nom, email, whatsapp);

    // Sauvegarder une copie du PDF signé pour archivage
    saveSignedPDF(nom, email, whatsapp, pdfBuffer);

    // Envoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="acceptance-${nom.replace(/\s+/g, '_')}-${Date.now()}.pdf"`);
    res.send(pdfBuffer);

    logger.info(`PDF d'acceptation téléchargé et sauvegardé pour ${nom}`);
  } catch (error) {
    logger.error('Erreur génération PDF:', error.message);
    res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
  }
});

// Route pour obtenir le nombre d'inscriptions
app.get('/api/inscriptions-count', (req, res) => {
  const inscriptions = getInscriptions();
  const config = getConfig();

  logger.info(`Inscriptions: ${inscriptions.length}/${config.maxPlaces}, Session: ${config.sessionOpen}`);

  res.json({
    count: inscriptions.length,
    max: config.maxPlaces,
    available: inscriptions.length < config.maxPlaces,
    sessionOpen: config.sessionOpen
  });
});

// Route pour créer une demande d'inscription (avant paiement)
app.post('/api/submit', async (req, res) => {
  try {
    const { nom, email, whatsapp, projet } = req.body;

    // Validation
    if (!nom || !email || !whatsapp || !projet) {
      return res.status(400).json({ error: 'Tous les champs sont obligatoires' });
    }

    // Vérifier si places disponibles
    const inscriptions = getInscriptions();
    if (inscriptions.length >= MAX_INSCRIPTIONS) {
      return res.status(409).json({ error: 'Places épuisées' });
    }

    res.json({
      success: true,
      message: 'Veuillez effectuer le paiement',
      step: 'payment_pending'
    });

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour confirmer l'inscription après paiement avec preuve
app.post('/api/confirm-payment', paymentLimiter, upload.single('proof'), async (req, res) => {
  try {
    console.log('📨 Requête reçue:', {
      body: req.body,
      file: req.file ? 'Fichier reçu' : 'Pas de fichier'
    });

    let { nom, email, whatsapp, projet, method, transactionId } = req.body;

    // Sanitizer et valider
    nom = sanitizeInput(nom);
    email = sanitizeInput(email);
    whatsapp = sanitizeInput(whatsapp);
    projet = sanitizeInput(projet);

    // Validation
    if (!nom || nom.length < 3) {
      console.error('❌ Nom invalide');
      return res.status(400).json({ error: 'Nom invalide (minimum 3 caractères)' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }

    // Validation WhatsApp (exactement 10 chiffres)
    if (!/^[0-9]{10}$/.test(whatsapp)) {
      return res.status(400).json({ error: 'Numéro WhatsApp invalide (10 chiffres requis)' });
    }

    if (!projet || projet.length < 20 || projet.length > 500) {
      return res.status(400).json({ error: 'Description projet invalide (20-500 caractères)' });
    }

    if (!method || (method !== 'screenshot' && method !== 'transaction-id')) {
      console.error('❌ Méthode invalide:', method);
      return res.status(400).json({ error: 'Méthode de preuve invalide' });
    }

    // Vérifier la preuve selon la méthode
    if (method === 'screenshot' && !req.file) {
      return res.status(400).json({ error: 'Screenshot requise' });
    }

    if (method === 'transaction-id' && !transactionId) {
      return res.status(400).json({ error: 'ID de transaction requise' });
    }

    // Validation ID transaction (chiffres uniquement)
    if (method === 'transaction-id' && !/^[0-9]+$/.test(transactionId)) {
      return res.status(400).json({ error: 'ID de transaction invalide (chiffres uniquement)' });
    }

    // Vérifier si places disponibles
    const inscriptions = getInscriptions();
    if (inscriptions.length >= MAX_INSCRIPTIONS) {
      return res.status(409).json({ error: 'Places épuisées' });
    }

    // Sauvegarder l'inscription avec la preuve
    let pendingPayments = [];
    if (fs.existsSync(PENDING_PAYMENTS_FILE)) {
      pendingPayments = JSON.parse(fs.readFileSync(PENDING_PAYMENTS_FILE, 'utf8'));
    }

    const paymentId = Date.now().toString();
    const paymentData = {
      id: paymentId,
      nom,
      email,
      whatsapp,
      projet,
      method,
      status: 'pending',
      date: new Date().toLocaleString('fr-FR')
    };

    // Ajouter la preuve selon la méthode
    if (method === 'screenshot' && req.file) {
      // Limiter la taille de l'image à 5MB pour Telegram
      let imageBuffer = req.file.buffer;
      if (imageBuffer.length > 5 * 1024 * 1024) {
        // Si trop gros, réduire la taille en base64
        imageBuffer = imageBuffer.slice(0, 5 * 1024 * 1024);
      }
      const proofBase64 = imageBuffer.toString('base64');
      paymentData.proof = proofBase64;
      paymentData.proofMime = req.file.mimetype;
    } else if (method === 'transaction-id') {
      paymentData.transactionId = transactionId;
    }

    pendingPayments.push(paymentData);
    fs.writeFileSync(PENDING_PAYMENTS_FILE, JSON.stringify(pendingPayments, null, 2));

    // Notification via Telegram à l'administrateur (envoyée de manière asynchrone pour ne pas bloquer la réponse)
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN; // Token du bot Telegram
    const adminChatId = process.env.TELEGRAM_CHAT_ID; // ID du chat de l'administrateur

    if (telegramBotToken && adminChatId) {
      // On lance l'envoi de la notification dans une promesse séparée pour ne pas bloquer la réponse
      const telegramPromise = (async () => {
        try {
          // Format du message Telegram simplifié
          const telegramMessage = `🔔 <b>NOUVEAU PAIEMENT EN ATTENTE DE VÉRIFICATION</b>\n\n` +
            `📝 Un nouveau paiement a été soumis et nécessite votre vérification.\n\n` +
            `👉 <b>Connectez-vous à votre dashboard admin pour approuver ou rejeter ce paiement.</b>`;

          // Envoyer la notification via l'API Telegram
          const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              chat_id: adminChatId,
              text: telegramMessage,
              parse_mode: 'HTML'
            })
          });

          if (response.ok) {
            console.log('✅ Notification Telegram envoyée à l\'administrateur');
          } else {
            console.error('❌ Erreur envoi notification Telegram:', await response.text());
          }
        } catch (telegramError) {
          console.error('❌ Erreur envoi notification Telegram:', telegramError.message);
        }
      })();
    }

    res.json({
      success: true,
      message: 'Paiement en attente de vérification',
      paymentId: paymentId
    });

  } catch (error) {
    console.error('❌ Erreur complète:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Route pour admin - voir les paiements en attente
app.get('/admin/pending-payments', requireAdminAuth, (req, res) => {
  let pendingPayments = [];
  if (fs.existsSync(PENDING_PAYMENTS_FILE)) {
    pendingPayments = JSON.parse(fs.readFileSync(PENDING_PAYMENTS_FILE, 'utf8'));
  }
  res.json(pendingPayments);
});

// Route pour admin - voir les inscriptions
app.get('/admin/inscriptions', requireAdminAuth, (req, res) => {
  const inscriptions = getInscriptions();
  const config = getConfig();
  res.json({
    inscriptions,
    total: inscriptions.length,
    max: config.maxPlaces,
    sessionOpen: config.sessionOpen
  });
});

// Route pour admin - approuver un paiement avec lien du groupe
app.post('/admin/approve-payment/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { groupLink } = req.body;
    const pendingFile = PENDING_PAYMENTS_FILE;
    const groupLinksFile = GROUP_LINKS_FILE;

    let pendingPayments = [];
    if (fs.existsSync(pendingFile)) {
      pendingPayments = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
    }

    // Trouver le paiement
    const paymentIndex = pendingPayments.findIndex(p => p.id === id);
    if (paymentIndex === -1) {
      return res.status(404).json({ error: 'Paiement non trouvé' });
    }

    const payment = pendingPayments[paymentIndex];

    // Vérifier les places
    const inscriptions = getInscriptions();
    if (inscriptions.length >= MAX_INSCRIPTIONS) {
      return res.status(409).json({ error: 'Places épuisées' });
    }

    // Sauvegarder l'inscription confirmée
    const totalCount = saveInscription({
      nom: payment.nom,
      email: payment.email,
      whatsapp: payment.whatsapp,
      projet: payment.projet
    });

    // Mettre à jour le statut du paiement
    payment.status = 'approved';
    pendingPayments[paymentIndex] = payment;
    fs.writeFileSync(pendingFile, JSON.stringify(pendingPayments, null, 2));

    // Sauvegarder le lien du groupe si fourni
    let groupLinksData = { groups: [] };
    if (fs.existsSync(groupLinksFile)) {
      const rawData = fs.readFileSync(groupLinksFile, 'utf8');
      try {
        const parsedData = JSON.parse(rawData);
        // S'assurer que groupLinksData est un objet avec une propriété groups
        groupLinksData = typeof parsedData === 'object' && parsedData !== null ? parsedData : { groups: [] };
        if (!Array.isArray(groupLinksData.groups)) {
          groupLinksData.groups = [];
        }
      } catch (parseError) {
        console.error('Erreur parsing group-links.json:', parseError.message);
        // Si le fichier est corrompu, initialiser avec un objet vide
        groupLinksData = { groups: [] };
      }
    }

    if (groupLink) {
      groupLinksData.groups.push({
        id: payment.id,
        nom: payment.nom,
        email: payment.email,
        link: groupLink,
        date: new Date().toLocaleString('fr-FR')
      });
      fs.writeFileSync(groupLinksFile, JSON.stringify(groupLinksData, null, 2));
      console.log(`✅ Lien du groupe sauvegardé pour ${payment.nom}`);
    }

    // Générer et sauvegarder le PDF d'acceptation pour archivage
    const acceptancePdfBuffer = await generateAcceptancePDF(payment.nom, payment.email, payment.whatsapp);
    const pdfPath = saveSignedPDF(payment.nom, payment.email, payment.whatsapp, acceptancePdfBuffer);

    // Envoyer email de confirmation au client
    const groupLinkSection = groupLink ? `
              <p style="margin-top: 20px; padding: 20px; background: #f0f9ff; border-left: 4px solid #00d4ff; border-radius: 5px;">
                  <strong>🔗 Accès au groupe privé:</strong><br>
                  <a href="${groupLink}" style="color: #00d4ff; font-weight: bold; text-decoration: none;">Rejoindre le groupe Boost & Success</a><br>
                  <small style="color: #6b7280;">Cliquez sur le lien ci-dessus pour accéder immédiatement</small>
              </p>
    ` : `
              <p style="margin-top: 20px; padding: 15px; background: #f0f9ff; border-left: 4px solid #00d4ff; border-radius: 5px;">
                  <strong>Prochaines étapes:</strong><br>
                  Consultez votre email pour les instructions d'accès au groupe privé Boost & Success.
              </p>
    `;

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
          <meta charset="UTF-8">
          <style>
              body { font-family: Arial, sans-serif; background: #f3f4f6; }
              .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              h1 { color: #00d4ff; }
              .success { color: #10b981; font-weight: bold; }
              a { color: #00d4ff; text-decoration: none; }
              .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 0.9em; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>🎉 Félicitations!</h1>
              
              <p>Votre inscription au programme <strong>Boost & Success</strong> a été <span class="success">approuvée</span>!</p>
              
              <p>Nous avons validé votre paiement et vous êtes maintenant officiellement membre de notre communauté exclusive d'entrepreneurs.</p>
              
              ${groupLinkSection}
              
              <p style="margin-top: 30px; padding: 20px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 5px;">
                  <strong>Document joint:</strong> Un PDF de vos conditions d'acceptation signées a été joint à cet email pour vos archives.
              </p>

              <p style="margin-top: 30px;">Merci de rejoindre notre communauté d'entrepreneurs!</p>

              <div class="footer">
                  <p>© 2026 Boost & Success - Tous droits réservés</p>
                  <p>Questions? Contactez-nous à <a href="mailto:adinaroles@gmail.com">adinaroles@gmail.com</a></p>
              </div>
          </div>
      </body>
      </html>
    `;

    // Envoyer l'email avec le PDF joint
    const emailSent = await sendEmailWithAttachment(
      payment.email,
      '✅ Votre inscription Boost & Success est approuvée!',
      emailHtml,
      pdfPath ? path.basename(pdfPath) : null,
      pdfPath
    );

    if (!emailSent) {
      console.warn('⚠️ Email non envoyé à', payment.email);
    }

    res.json({
      success: true,
      message: 'Paiement approuvé et client notifié',
      count: totalCount,
      max: MAX_INSCRIPTIONS
    });

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour admin - rejeter un paiement
app.post('/admin/reject-payment/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const pendingFile = PENDING_PAYMENTS_FILE;

    let pendingPayments = [];
    if (fs.existsSync(pendingFile)) {
      pendingPayments = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
    }

    // Trouver le paiement
    const paymentIndex = pendingPayments.findIndex(p => p.id === id);
    if (paymentIndex === -1) {
      return res.status(404).json({ error: 'Paiement non trouvé' });
    }

    const payment = pendingPayments[paymentIndex];

    // Mettre à jour le statut du paiement
    payment.status = 'rejected';
    pendingPayments[paymentIndex] = payment;
    fs.writeFileSync(pendingFile, JSON.stringify(pendingPayments, null, 2));

    // Envoyer email de rejet au client
    const rejectionEmailHtml = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
          <meta charset="UTF-8">
          <style>
              body { font-family: Arial, sans-serif; background: #f3f4f6; }
              .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              h1 { color: #ef4444; }
              .error { color: #ef4444; font-weight: bold; }
              .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 0.9em; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>❌ Paiement Rejeté</h1>
              
              <p>Votre paiement pour le programme <strong>Boost & Success</strong> a été <span class="error">rejeté</span>.</p>
              
              <p>Nous avons examiné votre preuve de paiement mais n'avons pas pu la valider. Veuillez nous contacter pour plus d'informations.</p>
              
              <p>Si vous pensez qu'il s'agit d'une erreur, n'hésitez pas à nous contacter pour clarifier la situation.</p>

              <div class="footer">
                  <p>© 2026 Boost & Success - Tous droits réservés</p>
                  <p>Questions? Contactez-nous à <a href="mailto:adinaroles@gmail.com">adinaroles@gmail.com</a></p>
              </div>
          </div>
      </body>
      </html>
    `;

    const emailSent = await sendEmail(
      payment.email,
      '❌ Votre preuve de paiement a été rejetée',
      rejectionEmailHtml,
      process.env.EMAILJS_TEMPLATE_REJECTION_ID
    );

    if (!emailSent) {
      console.warn('⚠️ Email de rejet non envoyé à', payment.email);
    }

    res.json({
      success: true,
      message: 'Paiement rejeté et client notifié'
    });

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour admin - ouvrir/fermer les inscriptions
app.post('/admin/toggle-session', requireAdminAuth, (req, res) => {
  try {
    const config = getConfig();
    config.sessionOpen = !config.sessionOpen;
    saveConfig(config);

    res.json({
      success: true,
      message: config.sessionOpen ? 'Inscriptions ouvertes' : 'Inscriptions fermées',
      sessionOpen: config.sessionOpen
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour admin - mettre à jour le nombre de places
app.post('/admin/update-places', requireAdminAuth, (req, res) => {
  try {
    const { maxPlaces, action } = req.body;
    const config = getConfig();

    if (action === 'reset') {
      config.maxPlaces = 5;
    } else if (action === 'increment' && maxPlaces) {
      config.maxPlaces += parseInt(maxPlaces);
    } else {
      return res.status(400).json({ error: 'Action ou valeur invalide' });
    }

    saveConfig(config);
    MAX_INSCRIPTIONS = config.maxPlaces;

    res.json({
      success: true,
      message: `Nombre de places mis à jour: ${config.maxPlaces}`,
      maxPlaces: config.maxPlaces
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour admin - exporter les inscriptions en CSV
app.get('/admin/export-csv', requireAdminAuth, (req, res) => {
  try {
    const inscriptions = getInscriptions();
    
    if (inscriptions.length === 0) {
      return res.status(404).json({ error: 'Aucune inscription à exporter' });
    }

    // Créer le contenu CSV
    const headers = ['ID', 'Nom', 'Email', 'WhatsApp', 'Projet', 'Date'];
    const csvContent = [
      headers.join(','),
      ...inscriptions.map(inscription => [
        `"${inscription.id}"`,
        `"${inscription.nom}"`,
        `"${inscription.email}"`,
        `"${inscription.whatsapp}"`,
        `"${inscription.projet}"`,
        `"${inscription.date}"`
      ].join(','))
    ].join('\n');

    // Envoyer le fichier CSV
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="inscriptions_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Démarrer le serveur
app.listen(PORT, () => {
  logger.info(`Serveur lancé sur http://localhost:${PORT}`);
  
  // Log l'état initial
  const inscriptions = getInscriptions();
  const config = getConfig();
  logger.info(`Inscriptions: ${inscriptions.length}/${config.maxPlaces}`);
  logger.info(`Session: ${config.sessionOpen ? 'OUVERTE' : 'FERMÉE'}`);
});