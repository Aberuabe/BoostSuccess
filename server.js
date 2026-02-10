const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialiser le client Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('✅ Client Supabase initialisé');
} else {
  console.warn('⚠️ Variables SUPABASE_URL ou SUPABASE_ANON_KEY non configurées');
  console.warn('   Configurez SUPABASE_URL et SUPABASE_ANON_KEY dans .env pour activer la base de données Supabase');
}

// Fonction pour créer les tables nécessaires dans Supabase
async function createTablesIfNotExists() {
  if (!supabase) {
    console.warn('⚠️ Supabase non configuré. Impossible de créer les tables.');
    return;
  }

  try {
    console.log('🔍 Vérification des tables dans Supabase...');

    // Vérifier si la table 'inscriptions' existe
    const { data: inscriptionsTable, error: inscriptionsError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'inscriptions');

    if (!inscriptionsError && (!inscriptionsTable || inscriptionsTable.length === 0)) {
      console.log('📦 Création de la table "inscriptions"...');
      // Pour créer la table, l'utilisateur doit le faire manuellement dans le dashboard Supabase
      console.log('💡 Veuillez créer la table "inscriptions" manuellement dans votre dashboard Supabase');
    }

    // Vérifier si la table 'config' existe
    const { data: configTable, error: configError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'config');

    if (!configError && (!configTable || configTable.length === 0)) {
      console.log('📦 Création de la table "config"...');
      console.log('💡 Veuillez créer la table "config" manuellement dans votre dashboard Supabase');
    }

    // Vérifier si la table 'pending_payments' existe
    const { data: pendingTable, error: pendingError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'pending_payments');

    if (!pendingError && (!pendingTable || pendingTable.length === 0)) {
      console.log('📦 Création de la table "pending_payments"...');
      console.log('💡 Veuillez créer la table "pending_payments" manuellement dans votre dashboard Supabase');
    }

    // Vérifier si la table 'group_links' existe
    const { data: groupTable, error: groupError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'group_links');

    if (!groupError && (!groupTable || groupTable.length === 0)) {
      console.log('📦 Création de la table "group_links"...');
      console.log('💡 Veuillez créer la table "group_links" manuellement dans votre dashboard Supabase');
    }

    // Vérifier si la table 'admin' existe
    const { data: adminTable, error: adminError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'admin');

    if (!adminError && (!adminTable || adminTable.length === 0)) {
      console.log('📦 Création de la table "admin"...');
      console.log('💡 Veuillez créer la table "admin" manuellement dans votre dashboard Supabase');
    }

    // Vérifier si la table 'signed_documents' existe
    const { data: docsTable, error: docsError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'signed_documents');

    if (!docsError && (!docsTable || docsTable.length === 0)) {
      console.log('📦 Création de la table "signed_documents"...');
      console.log('💡 Veuillez créer la table "signed_documents" manuellement dans votre dashboard Supabase');
    }

    console.log('✅ Vérification des tables terminée');
  } catch (error) {
    console.error('❌ Erreur vérification/initialisation des tables:', error.message);
  }
}

// Configuration pour les déploiements derrière un proxy
app.set('trust proxy', 1);

// Middleware de sécurité - CORS
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:10000',
      'http://localhost',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:10000',
      'https://boostsuccess.vercel.app',
      'https://boostsuccess-771lo97kq-aberuabes-projects.vercel.app'
    ];

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

// Servir les fichiers statiques (Essentiel pour Vercel)
app.use(express.static(path.join(__dirname, '.')));

// --- ROUTES API ---

// -------------------------

// Servir les fichiers statiques mais exclure les fichiers sensibles
app.use((req, res, next) => {
  if (['.env', 'admin-password.json', 'pending-payments.json', 'inscriptions.json'].some(file => req.path.includes(file))) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  next();
});

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

// Initialiser Nodemailer pour l'envoi d'e-mails
let emailTransporter = null;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';

if (EMAIL_USER && EMAIL_PASSWORD && SMTP_HOST && SMTP_PORT) {
  try {
    emailTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT),
      secure: SMTP_SECURE, // true for 465, false for other ports
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD // Mot de passe d'application
      },
      tls: {
        rejectUnauthorized: false // Permettre les connexions avec des certificats auto-signés
      }
    });

    // Tester la connexion
    emailTransporter.verify((error, success) => {
      if (error) {
        console.error('❌ Erreur de connexion SMTP:', error);
      } else {
        console.log('✅ Serveur SMTP prêt à envoyer des emails');
      }
    });
  } catch (error) {
    console.warn('⚠️ Email non disponible via SMTP:', error.message);
  }
} else {
  console.warn('⚠️ Configuration SMTP incomplète. Configurez EMAIL_USER, EMAIL_PASSWORD, SMTP_HOST et SMTP_PORT dans les variables d\'environnement.');
}

// Variables pour stocker les données (supprimées pour le mode stateless)
// On utilisera Supabase directement dans chaque fonction

// Fonction pour sauvegarder les paiements en attente localement (supprimée pour Vercel)
function savePendingPayments() {
  // Cette fonction ne fait plus rien en mode stateless
}

// Charger les données au démarrage (simplifié pour le mode stateless)
async function initializeData() {
  try {
    // Créer les tables si elles n'existent pas (optionnel)
    await createTablesIfNotExists();
    
    if (supabase) {
      console.log('✅ Mode Stateless: Connexion à Supabase établie');
    } else {
      console.warn('⚠️ Mode Stateless: Supabase non configuré !');
    }
  } catch (error) {
    console.error('Erreur initialisation:', error.message);
  }
}

initializeData();

// Importer JWT pour l'authentification stateless
const jwt = require('jsonwebtoken');

// Clé secrète pour signer les tokens (à définir dans les variables d'environnement)
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_dev';

// Charger la configuration avec meilleure gestion des erreurs
async function getConfig() {
  const defaultConfig = { id: 1, max_places: 5, session_open: true };
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('config')
        .select('*')
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // Row not found
          console.warn('⚠️ Configuration non trouvée dans Supabase, utilisation des valeurs par défaut');
          return defaultConfig;
        } else {
          console.error('❌ Erreur chargement config Supabase:', error.message);
          return defaultConfig;
        }
      }
      
      // Normaliser le format (Supabase utilise souvent snake_case)
      return {
        id: data.id,
        maxPlaces: parseInt(data.max_places || data.maxPlaces || 5),
        sessionOpen: data.session_open !== undefined ? data.session_open : (data.sessionOpen !== undefined ? data.sessionOpen : true)
      };
    } catch (error) {
      console.error('❌ Erreur critique chargement config:', error.message);
      return defaultConfig;
    }
  }
  return defaultConfig;
}

// Sauvegarder la configuration
async function saveConfig(config) {
  if (supabase) {
    try {
      const configToUpdate = {
        id: 1, // On force l'ID 1 pour la ligne de config unique
        max_places: parseInt(config.maxPlaces) || 5,
        session_open: config.sessionOpen !== undefined ? config.sessionOpen : true
      };

      console.log('💾 Sauvegarde config Supabase:', configToUpdate);

      // Utiliser upsert pour créer ou mettre à jour la ligne ID=1
      const { error } = await supabase
        .from('config')
        .upsert(configToUpdate, { onConflict: 'id' });

      if (error) {
        console.error('❌ Erreur sauvegarde config Supabase:', error.message);
        throw error;
      }
      return true;
    } catch (error) {
      console.error('❌ Erreur critique sauvegarde config:', error.message);
      throw error;
    }
  }
  return false;
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
async function saveSignedPDF(nom, email, whatsapp, pdfBuffer) {
  try {
    const fileName = `acceptance_${nom.replace(/\s+/g, '_')}_${Date.now()}.pdf`;

    if (supabase) {
      const pdfBase64 = pdfBuffer.toString('base64');
      const { error } = await supabase
        .from('signed_documents')
        .insert([{
          filename: fileName,
          content: pdfBase64,
          client_name: nom,
          client_email: email,
          client_whatsapp: whatsapp,
          created_at: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString()
        }]);

      if (error) {
        console.error('❌ Erreur sauvegarde PDF Supabase:', error.message);
      } else {
        logger.info(`PDF signé sauvegardé dans Supabase pour ${nom}`);
        return fileName;
      }
    }
    return fileName;
  } catch (error) {
    logger.error('Erreur sauvegarde PDF:', error.message);
    return null;
  }
}

// Fonction pour générer un PDF de conditions d'acceptation - Strict 1 Page
function generateAcceptancePDF(nom, email, whatsapp) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 30, left: 50, right: 50 },
        compress: true
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const COLOR_PRIMARY = '#111827';
      const COLOR_ACCENT = '#D4AF37';
      const COLOR_MUTED = '#4B5563';

      // Bande latérale discrète
      doc.rect(0, 0, 10, 841.89).fill(COLOR_PRIMARY);

      // En-tête compact
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(18).text('BOOST & SUCCESS', 60, 45);
      doc.fillColor(COLOR_ACCENT).font('Helvetica').fontSize(8).text('PROGRAMME ÉLITE ENTREPRENEURS', 60, 65);
      doc.moveTo(60, 75).lineTo(535, 75).lineWidth(0.5).stroke(COLOR_ACCENT);

      // Titre
      doc.moveDown(1.5);
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(14).text('ACTE D\'ADHÉSION ET CONDITIONS', { align: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED).text(`Réf: BS-${Date.now().toString().slice(-6)}`, { align: 'center' });

      // Parties
      doc.moveDown(1.5);
      const startY = doc.y;
      doc.rect(60, startY, 475, 75).fill('#F3F4F6');
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(9).text('ENTRE :', 75, startY + 12);
      doc.font('Helvetica').text('Direction BOOST & SUCCESS, Facilitateur de Projets.', 140, startY + 12);
      doc.font('Helvetica-Bold').text('ET LE CLIENT :', 75, startY + 32);
      doc.font('Helvetica').text(`${nom} | ${email} | ${whatsapp}`, 140, startY + 32);
      doc.text(`Fait le : ${new Date().toLocaleDateString('fr-FR')}`, 140, startY + 47);

      // Conditions compactes
      doc.y = startY + 90;
      const conditions = [
        { t: "1. OBJET", c: "Adhésion au parcours d'ingénierie technique et de structuration de projet." },
        { t: "2. FRAIS", c: "Versement de 10.000 FCFA pour analyse technique. Frais définitifs et non-remboursables." },
        { t: "3. ENGAGEMENT", c: "Optimisation de dossier. L'octroi final du financement dépend exclusivement des bailleurs de fonds." },
        { t: "4. CONFIDENTIALITÉ", c: "Protection stricte des données transmises par le secret professionnel." }
      ];

      conditions.forEach(item => {
          doc.fillColor(COLOR_ACCENT).font('Helvetica-Bold').fontSize(9).text(item.t);
          doc.fillColor(COLOR_PRIMARY).font('Helvetica').fontSize(9).text(item.c, { width: 460, lineGap: 2 });
          doc.moveDown(0.5);
      });

      // Signature
      doc.moveDown(1);
      const signY = doc.y;
      doc.rect(60, signY, 475, 70).strokeColor('#D1D5DB').lineWidth(0.5).stroke();
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(9).text('SIGNATURE ÉLECTRONIQUE (VALIDE)', 75, signY + 12);
      doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(7).text('Certifié par authentification de session utilisateur au moment de la validation.', 75, signY + 25);
      doc.fillColor(COLOR_ACCENT).font('Helvetica-Oblique').fontSize(11).text(`Signé numériquement par ${nom}`, 60, signY + 45, { align: 'center', width: 475 });

      // Pied de page
      doc.fontSize(7).font('Helvetica').fillColor(COLOR_MUTED).text('Document officiel Boost & Success - Généré automatiquement', 60, 790, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Fonction pour lire les inscriptions
async function getInscriptions() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('inscriptions')
        .select('*');

      if (error) {
        console.error('❌ Erreur chargement inscriptions Supabase:', error.message);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('❌ Erreur critique inscriptions:', error.message);
      return [];
    }
  }
  return [];
}

// Fonction pour sauvegarder une inscription
async function saveInscription(userData) {
  const newInscription = {
    id: Date.now(),
    nom: userData.nom,
    email: userData.email,
    whatsapp: userData.whatsapp,
    projet: userData.projet,
    date: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
    owner_id: null
  };

  if (supabase) {
    try {
      const { error } = await supabase
        .from('inscriptions')
        .insert([newInscription]);

      if (error) {
        console.error('❌ Erreur sauvegarde inscription Supabase:', error.message);
      } else {
        console.log('✅ Inscription sauvegardée dans Supabase:', newInscription.nom);
      }
    } catch (error) {
      console.error('❌ Erreur critique sauvegarde:', error.message);
    }
  }

  const all = await getInscriptions();
  return all.length;
}

// Fonction pour générer un token de session
function generateSessionToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Middleware d'authentification admin
function requireAdminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.body.token;

  if (!token) {
    return res.status(401).json({ error: 'Token manquant. Veuillez vous connecter.' });
  }

  try {
    // Vérifier le token JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    // Le token est valide, continuer
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide ou expiré. Veuillez vous reconnecter.' });
  }
}

// Fonctions d'envoi d'e-mails via Nodemailer
async function sendEmail(toEmail, subject, htmlContent) {
  if (!emailTransporter) {
    console.warn('⚠️ SMTP non configuré. Configurez EMAIL_USER et EMAIL_PASSWORD dans .env pour activer les emails SMTP');
    return false;
  }

  try {
    console.log(`📧 Envoi email SMTP à ${toEmail}...`);

    await emailTransporter.sendMail({
      from: EMAIL_USER,
      to: toEmail,
      subject: subject,
      html: htmlContent
    });

    console.log(`✅ Email SMTP envoyé à ${toEmail}`);
    return true;
  } catch (error) {
    console.error('❌ Erreur Email SMTP:', error.message);
    return false;
  }
}

async function sendEmailWithAttachment(toEmail, subject, htmlContent, attachmentName, attachmentPath) {
  if (!emailTransporter) {
    console.warn('⚠️ SMTP non configuré. Configurez EMAIL_USER et EMAIL_PASSWORD dans .env pour activer les emails SMTP');
    return false;
  }

  try {
    console.log(`📧 Envoi email avec pièce jointe SMTP à ${toEmail}...`);

    const mailOptions = {
      from: EMAIL_USER,
      to: toEmail,
      subject: subject,
      html: htmlContent
    };

    // Ajouter la pièce jointe si elle existe
    if (attachmentPath && fs.existsSync(attachmentPath)) {
      mailOptions.attachments = [{
        filename: attachmentName,
        path: attachmentPath
      }];
    }

    await emailTransporter.sendMail(mailOptions);

    console.log(`✅ Email avec pièce jointe SMTP envoyé à ${toEmail}`);
    return true;
  } catch (error) {
    console.error('❌ Erreur Email avec pièce jointe SMTP:', error.message);
    return false;
  }
}

// Fonction pour envoyer un email avec une pièce jointe à partir d'un buffer (pour environnement serverless)
async function sendEmailWithAttachmentFromBuffer(toEmail, subject, htmlContent, attachmentName, attachmentBuffer) {
  if (!emailTransporter) {
    console.warn('⚠️ SMTP non configuré. Configurez EMAIL_USER et EMAIL_PASSWORD dans .env pour activer les emails SMTP');
    return false;
  }

  try {
    console.log(`📧 Envoi email avec pièce jointe depuis buffer SMTP à ${toEmail}...`);

    const mailOptions = {
      from: EMAIL_USER,
      to: toEmail,
      subject: subject,
      html: htmlContent,
      attachments: [{
        filename: attachmentName,
        content: attachmentBuffer  // Utilisation directe du buffer
      }]
    };

    await emailTransporter.sendMail(mailOptions);

    console.log(`✅ Email avec pièce jointe depuis buffer SMTP envoyé à ${toEmail}`);
    return true;
  } catch (error) {
    console.error('❌ Erreur Email avec pièce jointe depuis buffer SMTP:', error.message);
    return false;
  }
}

// Route de login admin
app.post('/admin/login', loginLimiter, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Mot de passe requis' });
    }

    let hashedDbPassword = null;

    // Tenter de récupérer le mot de passe depuis Supabase
    if (supabase) {
      const { data, error } = await supabase
        .from('admin')
        .select('password')
        .single();
      
      if (!error && data) {
        hashedDbPassword = data.password;
      }
    }

    // Fallback sur le mot de passe ENV haché si non trouvé en DB
    if (!hashedDbPassword) {
      const plainPassword = process.env.ADMIN_PASSWORD || 'Admin@12346';
      hashedDbPassword = await bcrypt.hash(plainPassword, 10);
    }

    // Comparer
    const passwordMatch = await bcrypt.compare(password, hashedDbPassword);

    if (!passwordMatch) {
      logger.warn('Tentative de connexion échouée');
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // Générer un token JWT
    const token = jwt.sign(
      { userId: 'admin', timestamp: Date.now() },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    logger.info('Admin connecté avec token JWT');
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
  // Dans un système JWT, le logout consiste simplement à dire au client de supprimer le token
  // Le token expirera automatiquement après 24h
  res.json({ success: true, message: 'Déconnecté' });
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
app.get('/api/inscriptions-count', async (req, res) => {
  const inscriptions = await getInscriptions();
  const config = await getConfig();
  
  const maxPlaces = config.maxPlaces || 5;
  const sessionOpen = config.sessionOpen;

  logger.info(`Inscriptions: ${inscriptions.length}/${maxPlaces}, Session: ${sessionOpen}`);

  res.json({
    count: inscriptions.length,
    max: maxPlaces,
    available: inscriptions.length < maxPlaces,
    sessionOpen: sessionOpen
  });
});

// Route pour créer une demande d'analyse de projet (avant paiement)
app.post('/api/submit', async (req, res) => {
  try {
    let { nom, email, whatsapp, projet } = req.body;

    // Validation et assainissement
    nom = sanitizeInput(nom);
    email = sanitizeInput(email);
    whatsapp = sanitizeInput(whatsapp);
    projet = sanitizeInput(projet);

    if (!nom || !email || !whatsapp || !projet) {
      return res.status(400).json({ error: 'Tous les champs sont obligatoires' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }

    if (!/^[0-9]{10}$/.test(whatsapp)) {
      return res.status(400).json({ error: 'WhatsApp invalide (10 chiffres)' });
    }

    if (projet.length < 20 || projet.length > 1000) {
      return res.status(400).json({ error: 'Le projet doit faire entre 20 et 1000 caractères' });
    }

    // Vérifier si places disponibles
    const config = await getConfig();
    const maxPlaces = config.maxPlaces || 5;
    const inscriptions = await getInscriptions();
    
    if (inscriptions.length >= maxPlaces) {
      return res.status(409).json({ error: 'Désolé, les places sont épuisées pour cette session.' });
    }

    const submissionId = Date.now();
    const submissionData = {
      id: submissionId,
      nom,
      email,
      whatsapp,
      projet,
      status: 'pending_review',
      method: 'pending', // Fournir une valeur par défaut pour éviter la contrainte NOT NULL
      date: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString()
    };

    // Sauvegarder uniquement dans Supabase
    if (supabase) {
      try {
        console.log('📡 Tentative d\'insertion dans Supabase table pending_payments:', submissionData);
        const { data, error } = await supabase
          .from('pending_payments')
          .insert([submissionData]);
          
        if (error) {
          console.error('❌ Erreur Supabase INSERT:', error);
          throw error;
        }
        console.log('✅ Insertion réussie');
      } catch (err) {
        console.error('❌ Erreur critique lors de la soumission Supabase:', err.message, err);
        return res.status(500).json({ 
          error: 'Erreur lors de la sauvegarde du projet', 
          details: err.message 
        });
      }
    } else {
      return res.status(503).json({ error: 'Base de données non disponible' });
    }

    // Notification Telegram admin
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_CHAT_ID;
    if (telegramBotToken && adminChatId) {
      const msg = `🆕 <b>NOUVEAU PROJET À ANALYSER</b>\n\n👤 <b>Client:</b> ${nom}\n📧 <b>Email:</b> ${email}\n📱 <b>WhatsApp:</b> ${whatsapp}\n📝 <b>Projet:</b> ${projet.substring(0, 100)}...\n\n👉 Connectez-vous pour valider.`;
      fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: adminChatId, text: msg, parse_mode: 'HTML' })
      }).catch(err => console.error('Error telegram notification:', err));
    }

    res.json({
      success: true,
      message: 'Projet soumis avec succès. Notre équipe va analyser votre demande.',
      step: 'pending_review'
    });

  } catch (error) {
    console.error('Erreur /api/submit:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route admin pour approuver un projet (autorise le paiement)
app.post('/admin/approve-project/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!supabase) return res.status(503).json({ error: 'DB non disponible' });

    // Récupérer la soumission
    const { data: submission, error: fetchError } = await supabase
      .from('pending_payments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !submission) return res.status(404).json({ error: 'Soumission non trouvée' });

    // Mettre à jour le statut
    const { error: updateError } = await supabase
      .from('pending_payments')
      .update({ status: 'awaiting_payment' })
      .eq('id', id);

    if (updateError) throw updateError;

    // Envoyer email au client avec lien de paiement
    const host = req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
    const paymentLink = `${baseUrl}/payment.html?id=${id}`;
    
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h2 style="color: #00d4ff;">Validation Technique de votre Projet</h2>
        <p>Bonjour ${submission.nom},</p>
        <p>Notre équipe d'ingénierie a analysé votre proposition. Nous avons le plaisir de vous informer que votre projet présente le potentiel technique requis pour être <strong>accompagné et orienté vers nos fondations partenaires</strong>.</p>
        
        <p style="background: #f0f9ff; padding: 15px; border-radius: 8px; border-left: 4px solid #00d4ff;">
            <strong>Rappel important :</strong> Boost & Success n'est pas l'organisme de financement. Notre rôle est de structurer votre proposition, valider l'architecture technique et préparer votre dossier pour maximiser vos chances d'acceptation par les financeurs finaux.
        </p>

        <p>Vous pouvez maintenant procéder au paiement des frais de dossier et d'ingénierie pour démarrer la conception détaillée de vos livrables (Plan de conception, Architecture validée, Documentation complète).</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${paymentLink}" style="background: linear-gradient(135deg, #00d4ff 0%, #7000ff 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Finaliser mon Adhésion (10.000 FCFA)</a>
        </div>
        
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p>L'équipe d'ingénierie Boost & Success</p>
      </div>
    `;

    await sendEmail(submission.email, '✅ Votre projet Boost & Success a été validé !', emailHtml);

    res.json({ success: true, message: 'Projet approuvé et client notifié pour le paiement.' });
  } catch (error) {
    console.error('Error approve-project:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route admin pour rejeter un projet
app.post('/admin/reject-project/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!supabase) return res.status(503).json({ error: 'DB non disponible' });

    // Récupérer la soumission
    const { data: submission, error: fetchError } = await supabase
      .from('pending_payments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !submission) return res.status(404).json({ error: 'Soumission non trouvée' });

    // Mettre à jour le statut
    await supabase.from('pending_payments').update({ status: 'project_rejected' }).eq('id', id);

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h2 style="color: #ef4444;">Mise à jour concernant votre demande</h2>
        <p>Bonjour ${submission.nom},</p>
        <p>Nous avons analysé votre projet avec attention. Malheureusement, nous ne pouvons pas y donner suite pour le moment.</p>
        ${reason ? `<p><strong>Motif :</strong> ${reason}</p>` : ''}
        <p>Nous vous encourageons à retravailler votre proposition et à retenter votre chance lors d'une prochaine session.</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p>L'équipe Boost & Success</p>
      </div>
    `;

    await sendEmail(submission.email, 'Mise à jour de votre demande Boost & Success', emailHtml);

    res.json({ success: true, message: 'Projet rejeté.' });
  } catch (error) {
    console.error('Error reject-project:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour confirmer l'inscription après paiement avec preuve
app.post('/api/confirm-payment', paymentLimiter, upload.single('proof'), async (req, res) => {
  try {
    let { id, method, transactionId } = req.body;

    if (!id) return res.status(400).json({ error: 'ID de soumission manquant' });
    if (!supabase) return res.status(503).json({ error: 'DB non disponible' });

    // Récupérer la soumission
    const { data: submission, error: fetchError } = await supabase
      .from('pending_payments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !submission) return res.status(404).json({ error: 'Soumission non trouvée' });

    // Vérifier si le projet a été approuvé
    if (submission.status !== 'awaiting_payment' && submission.status !== 'rejected') {
       return res.status(403).json({ error: 'Votre projet doit être validé par l\'admin avant le paiement.' });
    }

    if (!method || (method !== 'screenshot' && method !== 'transaction-id')) {
      return res.status(400).json({ error: 'Méthode de preuve invalide' });
    }

    // Préparer les données de mise à jour
    const updateData = {
      status: 'pending',
      method: method
    };

    if (method === 'screenshot' && req.file) {
      updateData.proof = req.file.buffer.toString('base64');
      updateData.proofmime = req.file.mimetype;
    } else if (method === 'transaction-id') {
      updateData.transactionid = transactionId;
    }

    // Mettre à jour Supabase
    const { error: updateError } = await supabase
      .from('pending_payments')
      .update(updateData)
      .eq('id', id);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: 'Preuve de paiement envoyée. Nous vérifions votre paiement.',
      paymentId: id
    });

  } catch (error) {
    console.error('❌ Erreur confirmation paiement:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour admin - voir les paiements en attente
app.get('/admin/pending-payments', requireAdminAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'DB non disponible' });
  
  try {
    const { data, error } = await supabase
      .from('pending_payments')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('❌ Erreur chargement paiements Supabase:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour admin - voir les inscriptions
app.get('/admin/inscriptions', requireAdminAuth, async (req, res) => {
  const inscriptions = await getInscriptions();
  const config = await getConfig();

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

    if (!supabase) return res.status(503).json({ error: 'DB non disponible' });

    // Récupérer le paiement
    const { data: payment, error: fetchError } = await supabase
      .from('pending_payments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !payment) return res.status(404).json({ error: 'Paiement non trouvé' });

    // Vérifier les places
    const config = await getConfig();
    const maxPlaces = config.maxPlaces || 5;
    const inscriptions = await getInscriptions();
    
    if (inscriptions.length >= maxPlaces) {
      return res.status(409).json({ error: 'Places épuisées' });
    }

    // Sauvegarder l'inscription confirmée
    const totalCount = await saveInscription({
      nom: payment.nom,
      email: payment.email,
      whatsapp: payment.whatsapp,
      projet: payment.projet
    });

    // Mettre à jour le statut du paiement
    await supabase.from('pending_payments').update({ status: 'approved' }).eq('id', id);

    // Sauvegarder le lien du groupe si fourni
    if (groupLink) {
      await supabase.from('group_links').insert([{
        id: payment.id,
        nom: payment.nom,
        email: payment.email,
        link: groupLink,
        date: new Date(Date.now() + 1 * 60 * 60 * 1000).toLocaleString('fr-FR')
      }]);
    }

    // Générer le PDF
    const acceptancePdfBuffer = await generateAcceptancePDF(payment.nom, payment.email, payment.whatsapp);
    await saveSignedPDF(payment.nom, payment.email, payment.whatsapp, acceptancePdfBuffer);

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
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Votre inscription Boost & Success est approuvée</title>
          <style>
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  background-color: #f9fafb;
                  margin: 0;
                  padding: 0;
                  -webkit-font-smoothing: antialiased;
              }
              .container {
                  max-width: 600px;
                  margin: 0 auto;
                  background-color: #ffffff;
                  border-radius: 12px;
                  overflow: hidden;
                  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
              }
              .header {
                  background: linear-gradient(135deg, #00d4ff 0%, #7000ff 100%);
                  padding: 40px 30px;
                  text-align: center;
                  color: white;
              }
              .header h1 {
                  margin: 0;
                  font-size: 28px;
                  font-weight: 700;
              }
              .header p {
                  margin: 10px 0 0 0;
                  font-size: 16px;
                  opacity: 0.9;
              }
              .content {
                  padding: 40px 30px;
              }
              .greeting {
                  font-size: 20px;
                  color: #1f2937;
                  margin-bottom: 20px;
              }
              .message {
                  background-color: #f8fafc;
                  border-left: 4px solid #00d4ff;
                  padding: 20px;
                  border-radius: 0 8px 8px 0;
                  margin: 20px 0;
                  font-size: 16px;
                  line-height: 1.6;
                  color: #374151;
              }
              .highlight {
                  background: linear-gradient(120deg, #e0f2fe 0%, #f0f9ff 100%);
                  border: 1px solid #bae6fd;
                  border-radius: 8px;
                  padding: 25px;
                  margin: 25px 0;
                  text-align: center;
              }
              .highlight h3 {
                  margin: 0 0 10px 0;
                  color: #0369a1;
                  font-size: 18px;
              }
              .highlight p {
                  margin: 5px 0;
                  color: #0c4a6e;
                  font-size: 15px;
              }
              .cta-button {
                  display: inline-block;
                  background: linear-gradient(135deg, #00d4ff 0%, #7000ff 100%);
                  color: white !important;
                  text-decoration: none;
                  padding: 14px 28px;
                  border-radius: 8px;
                  font-weight: 600;
                  font-size: 16px;
                  margin: 20px 0;
                  transition: transform 0.2s, box-shadow 0.2s;
              }
              .cta-button:hover {
                  transform: translateY(-2px);
                  box-shadow: 0 8px 25px rgba(0, 212, 255, 0.3);
              }
              .document-section {
                  background: linear-gradient(120deg, #fefce8 0%, #fef9c3 100%);
                  border: 1px solid #fbbf24;
                  border-radius: 8px;
                  padding: 20px;
                  margin: 25px 0;
                  text-align: center;
              }
              .document-section h3 {
                  margin: 0 0 10px 0;
                  color: #92400e;
                  font-size: 18px;
              }
              .document-section p {
                  margin: 5px 0;
                  color: #78350f;
                  font-size: 15px;
              }
              .footer {
                  background-color: #f3f4f6;
                  padding: 30px;
                  text-align: center;
                  color: #6b7280;
                  font-size: 14px;
                  border-top: 1px solid #e5e7eb;
              }
              .footer-logo {
                  font-size: 18px;
                  font-weight: 700;
                  color: #00d4ff;
                  margin-bottom: 15px;
              }
              .footer-links {
                  margin: 15px 0;
              }
              .footer-links a {
                  color: #00d4ff;
                  text-decoration: none;
                  margin: 0 10px;
                  font-size: 14px;
              }
              .footer-links a:hover {
                  text-decoration: underline;
              }
              @media (max-width: 600px) {
                  .container {
                      margin: 10px;
                  }
                  .header, .content {
                      padding: 25px 20px;
                  }
                  .header h1 {
                      font-size: 24px;
                  }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🎉 Félicitations!</h1>
                  <p>Votre inscription au programme Boost & Success a été approuvée</p>
              </div>

              <div class="content">
                  <p class="greeting">Bonjour ${payment.nom},</p>

                  <div class="message">
                      <p>Nous avons le plaisir de vous informer que votre inscription au programme <strong>Boost & Success</strong> a été <span style="color: #059669; font-weight: bold;">approuvée</span> avec succès!</p>
                      <p>Votre paiement a été validé et vous êtes maintenant officiellement membre de notre communauté exclusive d'entrepreneurs ambitieux.</p>
                  </div>

                  ${groupLinkSection}

                  <div class="document-section">
                      <h3>📋 Document d'Archivage</h3>
                      <p>Un PDF de vos conditions d'acceptation signées a été joint à cet email pour vos archives personnelles.</p>
                      <p>Ce document atteste de votre adhésion volontaire aux termes du programme.</p>
                  </div>

                  <p style="text-align: center; margin: 30px 0; font-size: 16px; color: #374151;">
                      Merci de rejoindre notre communauté d'entrepreneurs passionnés!<br>
                      <strong>L'équipe Boost & Success</strong>
                  </p>
              </div>

              <div class="footer">
                  <div class="footer-logo">BOOST & SUCCESS</div>
                  <p>Programme d'Accélération Entrepreneuriale</p>
                  <div class="footer-links">
                      <a href="mailto:adinaroles@gmail.com">Contact</a>
                  </div>
                  <p>&copy; 2026 Boost & Success. Tous droits réservés.</p>
              </div>
          </div>
      </body>
      </html>
    `;

    // Envoyer l'email avec le PDF joint en tant que buffer (pour environnement serverless)
    const emailSent = await sendEmailWithAttachmentFromBuffer(
      payment.email,
      '✅ Votre inscription Boost & Success est approuvée!',
      emailHtml,
      `acceptance_${payment.nom.replace(/\s+/g, '_')}_${Date.now()}.pdf`,  // attachmentName
      acceptancePdfBuffer  // attachmentBuffer
    );

    if (!emailSent) {
      console.warn('⚠️ Email non envoyé à', payment.email);
    }

    res.json({
      success: true,
      message: 'Paiement approuvé et client notifié',
      count: totalCount,
      max: config.maxPlaces
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

    if (!supabase) return res.status(503).json({ error: 'DB non disponible' });

    // Récupérer le paiement
    const { data: payment, error: fetchError } = await supabase
      .from('pending_payments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !payment) return res.status(404).json({ error: 'Paiement non trouvé' });

    // Mettre à jour le statut
    await supabase.from('pending_payments').update({ status: 'rejected' }).eq('id', id);

    // Envoyer email de rejet au client
    const rejectionEmailHtml = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Votre paiement a été rejeté</title>
          <style>
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  background-color: #f9fafb;
                  margin: 0;
                  padding: 0;
                  -webkit-font-smoothing: antialiased;
              }
              .container {
                  max-width: 600px;
                  margin: 0 auto;
                  background-color: #ffffff;
                  border-radius: 12px;
                  overflow: hidden;
                  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
              }
              .header {
                  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                  padding: 40px 30px;
                  text-align: center;
                  color: white;
              }
              .header h1 {
                  margin: 0;
                  font-size: 28px;
                  font-weight: 700;
              }
              .header p {
                  margin: 10px 0 0 0;
                  font-size: 16px;
                  opacity: 0.9;
              }
              .content {
                  padding: 40px 30px;
              }
              .greeting {
                  font-size: 20px;
                  color: #1f2937;
                  margin-bottom: 20px;
              }
              .message {
                  background-color: #fef2f2;
                  border-left: 4px solid #ef4444;
                  padding: 20px;
                  border-radius: 0 8px 8px 0;
                  margin: 20px 0;
                  font-size: 16px;
                  line-height: 1.6;
                  color: #374151;
              }
              .info-section {
                  background: linear-gradient(120deg, #fffbeb 0%, #fef3c7 100%);
                  border: 1px solid #fbbf24;
                  border-radius: 8px;
                  padding: 20px;
                  margin: 25px 0;
                  text-align: center;
              }
              .info-section h3 {
                  margin: 0 0 10px 0;
                  color: #92400e;
                  font-size: 18px;
              }
              .info-section p {
                  margin: 5px 0;
                  color: #78350f;
                  font-size: 15px;
              }
              .footer {
                  background-color: #f3f4f6;
                  padding: 30px;
                  text-align: center;
                  color: #6b7280;
                  font-size: 14px;
                  border-top: 1px solid #e5e7eb;
              }
              .footer-logo {
                  font-size: 18px;
                  font-weight: 700;
                  color: #ef4444;
                  margin-bottom: 15px;
              }
              .footer-links {
                  margin: 15px 0;
              }
              .footer-links a {
                  color: #ef4444;
                  text-decoration: none;
                  margin: 0 10px;
                  font-size: 14px;
              }
              .footer-links a:hover {
                  text-decoration: underline;
              }
              @media (max-width: 600px) {
                  .container {
                      margin: 10px;
                  }
                  .header, .content {
                      padding: 25px 20px;
                  }
                  .header h1 {
                      font-size: 24px;
                  }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>❌ Paiement Rejeté</h1>
                  <p>Votre inscription au programme Boost & Success n'a pas été approuvée</p>
              </div>

              <div class="content">
                  <p class="greeting">Bonjour ${payment.nom},</p>

                  <div class="message">
                      <p>Nous regrettons de vous informer que votre paiement pour le programme <strong>Boost & Success</strong> a été <span style="color: #dc2626; font-weight: bold;">rejeté</span>.</p>
                      <p>Nous avons examiné votre preuve de paiement mais n'avons pas pu la valider correctement.</p>
                  </div>

                  <div class="info-section">
                      <h3>🔍 Prochaines Étapes</h3>
                      <p>Veuillez nous contacter pour plus d'informations ou pour soumettre à nouveau votre preuve de paiement.</p>
                      <p>Si vous pensez qu'il s'agit d'une erreur, n'hésitez pas à nous contacter pour clarifier la situation.</p>
                  </div>

                  <p style="text-align: center; margin: 30px 0; font-size: 16px; color: #374151;">
                      Nous espérons pouvoir vous accompagner bientôt dans votre parcours entrepreneurial.<br>
                      <strong>L'équipe Boost & Success</strong>
                  </p>
              </div>

              <div class="footer">
                  <div class="footer-logo">BOOST & SUCCESS</div>
                  <p>Programme d'Accélération Entrepreneuriale</p>
                  <div class="footer-links">
                      <a href="mailto:adinaroles@gmail.com">Contact</a>
                  </div>
                  <p>&copy; 2026 Boost & Success. Tous droits réservés.</p>
              </div>
          </div>
      </body>
      </html>
    `;

    const emailSent = await sendEmail(
      payment.email,
      '❌ Votre preuve de paiement a été rejetée',
      rejectionEmailHtml
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
app.post('/admin/toggle-session', requireAdminAuth, async (req, res) => {
  try {
    const config = await getConfig();
    const newStatus = !config.sessionOpen;
    
    await saveConfig({ ...config, sessionOpen: newStatus });

    res.json({
      success: true,
      message: newStatus ? 'Inscriptions ouvertes' : 'Inscriptions fermées',
      sessionOpen: newStatus
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour admin - réinitialisation globale des compteurs
app.post('/admin/reset-all', requireAdminAuth, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'DB non disponible' });

    console.log('🧹 Début de la réinitialisation globale...');

    // 1. Réinitialiser la config (id=1 est la ligne de config)
    await saveConfig({ maxPlaces: 5, sessionOpen: true });
    console.log('⚙️ Configuration réinitialisée');

    // 2. Vider les tables
    // On utilise gte('id', 0) pour attraper tous les IDs numériques
    const { error: err1 } = await supabase.from('inscriptions').delete().gte('id', 0);
    if (err1) console.error('❌ Erreur purge inscriptions:', err1.message);

    const { error: err2 } = await supabase.from('pending_payments').delete().gte('id', 0);
    if (err2) console.error('❌ Erreur purge pending_payments:', err2.message);

    const { error: err3 } = await supabase.from('group_links').delete().gte('id', 0);
    if (err3) console.error('❌ Erreur purge group_links:', err3.message);

    console.log('✨ Réinitialisation globale terminée avec succès');
    res.json({ success: true, message: 'Système réinitialisé avec succès' });
  } catch (error) {
    logger.error('Erreur reset-all:', error.message);
    res.status(500).json({ error: 'Erreur serveur lors de la réinitialisation' });
  }
});

// Route pour admin - mettre à jour le nombre de places
app.post('/admin/update-places', requireAdminAuth, async (req, res) => {
  try {
    const { maxPlaces, action } = req.body;
    let config = await getConfig();

    console.log('🔄 Action places:', action, 'Valeur reçue:', maxPlaces, 'Ancien max:', config.maxPlaces);

    if (action === 'reset') {
      config.maxPlaces = 5;
    } else if (action === 'increment') {
      config.maxPlaces = parseInt(config.maxPlaces) + 1;
    } else if (action === 'decrement') {
      config.maxPlaces = Math.max(1, parseInt(config.maxPlaces) - 1);
    } else if (maxPlaces !== undefined) {
      // Direct set
      const newVal = parseInt(maxPlaces);
      if (!isNaN(newVal) && newVal > 0) {
        config.maxPlaces = newVal;
      }
    } else {
      return res.status(400).json({ error: 'Action ou valeur invalide' });
    }

    await saveConfig(config);
    const updatedConfig = await getConfig(); // Re-fetch to be sure

    res.json({
      success: true,
      message: `Nombre de places mis à jour: ${updatedConfig.maxPlaces}`,
      maxPlaces: updatedConfig.maxPlaces
    });
  } catch (error) {
    console.error('Erreur update-places:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour admin - exporter les inscriptions en CSV
app.get('/admin/export-csv', requireAdminAuth, async (req, res) => {
  try {
    const inscriptions = await getInscriptions();

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
    res.setHeader('Content-Disposition', `attachment; filename="inscriptions_${new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString().slice(0,10)}.csv"`);  // Ajouter 1 heure pour GMT+1 (Bénin)
    res.send(csvContent);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour admin - exporter les inscriptions en PDF
app.get('/admin/export-pdf', requireAdminAuth, async (req, res) => {
  try {
    const inscriptions = await getInscriptions();

    if (inscriptions.length === 0) {
      return res.status(404).json({ error: 'Aucune inscription à exporter' });
    }

    const doc = new PDFDocument();
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);

      // Envoyer le PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="inscriptions_${new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString().slice(0,10)}.pdf"`);  // Ajouter 1 heure pour GMT+1 (Bénin)
      res.send(pdfBuffer);
    });
    doc.on('error', (err) => {
      console.error('Erreur génération PDF:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    });

    // En-tête du document
    doc.fillColor('#00d4ff').fontSize(20).font('Helvetica-Bold');
    doc.text('Boost & Success', { align: 'center' });
    doc.fillColor('black'); // Réinitialiser la couleur
    doc.moveDown(0.5);

    // Titre principal
    doc.fontSize(20).font('Helvetica-Bold');
    doc.text('Export des Inscriptions', { align: 'center' });
    doc.moveDown(0.5);

    // Date de l'export
    doc.fontSize(12).font('Helvetica');
    doc.text(`Date d'export: ${new Date(Date.now() + 1 * 60 * 60 * 1000).toLocaleString('fr-FR')}`, { align: 'center' });  // Ajouter 1 heure pour GMT+1 (Bénin)
    doc.moveDown(1);

    // Ligne décorative
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#00d4ff');
    doc.moveDown(1);

    // Informations sur les inscriptions
    doc.fontSize(14).font('Helvetica-Bold').text(`Total des inscriptions: ${inscriptions.length}`);
    doc.moveDown(1);

    // Liste des inscriptions
    inscriptions.forEach((inscription, index) => {
      // Saut de page si nécessaire
      if (doc.y > 700) {
        doc.addPage();
      }

      doc.fontSize(12).font('Helvetica-Bold').text(`Inscription #${index + 1}`, { underline: true });
      doc.moveDown(0.2);

      doc.fontSize(11).font('Helvetica');
      doc.text(`ID: ${inscription.id}`, { indent: 20 });
      doc.text(`Nom: ${inscription.nom}`, { indent: 20 });
      doc.text(`Email: ${inscription.email}`, { indent: 20 });
      doc.text(`WhatsApp: ${inscription.whatsapp}`, { indent: 20 });
      doc.text(`Projet: ${inscription.projet}`, { indent: 20, lineBreak: true, width: 500 });
      doc.text(`Date: ${inscription.date}`, { indent: 20 });
      doc.moveDown(0.8);
    });

    // Pied de page
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#d1d5db');
    doc.moveDown(0.5);

    doc.fontSize(8).font('Helvetica-Oblique');
    doc.text('Document généré automatiquement par Boost & Success', { align: 'center' });
    doc.text(`Exporté par un administrateur le ${new Date(Date.now() + 1 * 60 * 60 * 1000).toLocaleString('fr-FR')}`, { align: 'center' });  // Ajouter 1 heure pour GMT+1 (Bénin)
    doc.text('© 2026 Boost & Success - Tous droits réservés', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Démarrer le serveur
const port = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    logger.info(`Serveur lancé sur le port ${port}`);
  });
}

// Pour Vercel, on exporte l'app
module.exports = app;
