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
      'http://localhost',
      'http://127.0.0.1:3000',
      'http://127.0.0.1',
      'https://boostsuccess.vercel.app',  // URL principale de votre projet Vercel
      'https://boostsuccess-771lo97kq-aberuabes-projects.vercel.app'  // URL spécifique de votre instance Vercel
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

// Fichiers de données
const INSCRIPTIONS_FILE = path.join(__dirname, 'inscriptions.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const ADMIN_FILE = path.join(__dirname, 'admin-password.json');
const PENDING_PAYMENTS_FILE = path.join(__dirname, 'pending-payments.json');
const GROUP_LINKS_FILE = path.join(__dirname, 'group-links.json');

// Variables pour stocker les données en mémoire (en cas de non-disponibilité de Supabase)
let inscriptionsData = [];
let configData = { maxPlaces: 5, sessionOpen: true };
let adminPassword = null;
let pendingPaymentsData = [];
let groupLinksData = { groups: [] };

// Charger les données au démarrage
async function initializeData() {
  try {
    // Créer les tables si elles n'existent pas
    await createTablesIfNotExists();

    // Charger les données depuis Supabase si disponible
    if (supabase) {
      try {
        // Charger la configuration en premier
        const { data: config, error: configError } = await supabase
          .from('config')
          .select('*')
          .single();

        if (!configError && config) {
          configData = config;
          MAX_INSCRIPTIONS = config.max_places || config.maxPlaces;
        } else {
          console.warn('⚠️ Configuration non trouvée dans Supabase, utilisation des valeurs par défaut');
          // Utiliser les valeurs par défaut sans tenter de créer une nouvelle ligne
          configData = { id: 1, max_places: 5, session_open: true };
          MAX_INSCRIPTIONS = 5;
        }

        // Charger les inscriptions (depuis la table inscriptions)
        const { data: inscriptions, error: inscriptionsError } = await supabase
          .from('inscriptions')
          .select('*');

        if (!inscriptionsError) {
          inscriptionsData = inscriptions;
        } else {
          console.error('❌ Erreur chargement inscriptions:', inscriptionsError.message);
        }

        // Charger les paiements en attente
        const { data: pendingPayments, error: pendingError } = await supabase
          .from('pending_payments')
          .select('*');

        if (!pendingError) {
          pendingPaymentsData = pendingPayments;
        } else {
          console.error('❌ Erreur chargement paiements en attente:', pendingError.message);
        }

        // Charger les liens de groupe
        const { data: groupLinks, error: groupLinksError } = await supabase
          .from('group_links')
          .select('*');

        if (!groupLinksError) {
          groupLinksData = { groups: groupLinks };
        } else {
          console.error('❌ Erreur chargement liens de groupe:', groupLinksError.message);
        }

        // Charger le mot de passe admin
        const { data: adminData, error: adminError } = await supabase
          .from('admin')
          .select('password')
          .single();

        if (!adminError && adminData) {
          adminPassword = adminData.password;
        } else {
          console.error('❌ Erreur chargement mot de passe admin:', adminError.message);
        }
      } catch (supabaseError) {
        console.error('❌ Erreur critique avec Supabase lors de l\'initialisation:', supabaseError.message);
        console.log('💡 Chargement des données depuis les fichiers locaux...');

        // Charger les données depuis les fichiers s'ils existent (fallback)
        const inscriptionsPath = path.join(__dirname, 'inscriptions.json');
        if (fs.existsSync(inscriptionsPath)) {
          inscriptionsData = JSON.parse(fs.readFileSync(inscriptionsPath, 'utf8'));
        }

        const configPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(configPath)) {
          configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          MAX_INSCRIPTIONS = configData.maxPlaces;
        }

        const adminPath = path.join(__dirname, 'admin-password.json');
        if (fs.existsSync(adminPath)) {
          const adminFileData = JSON.parse(fs.readFileSync(adminPath, 'utf8'));
          adminPassword = adminFileData.password;
        }

        const pendingPaymentsPath = path.join(__dirname, 'pending-payments.json');
        if (fs.existsSync(pendingPaymentsPath)) {
          pendingPaymentsData = JSON.parse(fs.readFileSync(pendingPaymentsPath, 'utf8'));
        }

        const groupLinksPath = path.join(__dirname, 'group-links.json');
        if (fs.existsSync(groupLinksPath)) {
          groupLinksData = JSON.parse(fs.readFileSync(groupLinksPath, 'utf8'));
        }
      }
    } else {
      // Charger les données depuis les fichiers s'ils existent (fallback)
      const inscriptionsPath = path.join(__dirname, 'inscriptions.json');
      if (fs.existsSync(inscriptionsPath)) {
        inscriptionsData = JSON.parse(fs.readFileSync(inscriptionsPath, 'utf8'));
      }

      const configPath = path.join(__dirname, 'config.json');
      if (fs.existsSync(configPath)) {
        configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        MAX_INSCRIPTIONS = configData.maxPlaces;
      }

      const adminPath = path.join(__dirname, 'admin-password.json');
      if (fs.existsSync(adminPath)) {
        const adminFileData = JSON.parse(fs.readFileSync(adminPath, 'utf8'));
        adminPassword = adminFileData.password;
      }

      const pendingPaymentsPath = path.join(__dirname, 'pending-payments.json');
      if (fs.existsSync(pendingPaymentsPath)) {
        pendingPaymentsData = JSON.parse(fs.readFileSync(pendingPaymentsPath, 'utf8'));
      }

      const groupLinksPath = path.join(__dirname, 'group-links.json');
      if (fs.existsSync(groupLinksPath)) {
        groupLinksData = JSON.parse(fs.readFileSync(groupLinksPath, 'utf8'));
      }
    }
  } catch (error) {
    console.error('Erreur chargement données:', error.message);
  }
}

initializeData();

// Importer JWT pour l'authentification stateless
const jwt = require('jsonwebtoken');

// Clé secrète pour signer les tokens (à définir dans les variables d'environnement)
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_dev';

// Charger la configuration avec meilleure gestion des erreurs
async function getConfig() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('config')
        .select('*')
        .single();

      console.log('🔍 Chargement config - Data:', data, 'Error:', error);

      if (error) {
        if (error.code === 'PGRST116') { // Row not found
          console.warn('⚠️ Configuration non trouvée dans Supabase, utilisation des valeurs par défaut');
          // Utiliser les valeurs par défaut sans tenter de créer une nouvelle ligne
          configData = { id: 1, max_places: 5, session_open: true };
          MAX_INSCRIPTIONS = 5;
          return configData;
        } else {
          console.error('❌ Erreur chargement config:', error.message);
          // En cas d'erreur de connexion ou autre, utiliser les données en mémoire
          return configData || { id: 1, max_places: 5, session_open: true };
        }
      }

      if (data) {
        configData = data;
        MAX_INSCRIPTIONS = data.max_places || data.maxPlaces || 5;
        console.log('🔍 Config chargée depuis Supabase:', configData);
      }

      return configData;
    } catch (error) {
      console.error('❌ Erreur critique chargement config:', error.message);
      // En cas d'erreur critique (comme fetch failed), retourner les données en mémoire
      return configData || { id: 1, max_places: 5, session_open: true };
    }
  } else {
    // Si Supabase n'est pas disponible, utiliser les données locales
    console.log('🔍 Supabase non disponible, utilisation des données en mémoire:', configData);
    return configData;
  }
}

// Sauvegarder la configuration
async function saveConfig(config) {
  configData = { ...config }; // Sauvegarder en mémoire aussi

  // Sauvegarder dans Supabase si disponible
  if (supabase) {
    try {
      // Adapter le format des données pour correspondre à la structure de la base de données
      const configToUpdate = {
        max_places: config.maxPlaces || config.max_places || 5,
        session_open: config.sessionOpen || config.session_open || true
      };

      console.log('💾 Tentative de mise à jour de la configuration dans Supabase:', configToUpdate);

      // Utiliser update pour ne modifier que la ligne existante (pas de création possible)
      const { error, data } = await supabase
        .from('config')
        .update(configToUpdate)
        .eq('id', config.id || 1);

      if (error) {
        console.error('❌ Erreur sauvegarde config:', error.message);
        // Ne pas retourner d'erreur pour ne pas bloquer le processus
      } else {
        console.log('✅ Configuration mise à jour avec succès dans Supabase');
        console.log('✅ Données retournées:', data);

        // Mettre à jour la variable locale pour s'assurer que les changements sont immédiats
        configData = { ...configData, ...configToUpdate };
        console.log('🔄 Variable locale configData mise à jour:', configData);
      }
    } catch (error) {
      console.error('❌ Erreur critique sauvegarde config:', error.message);
      // Ne pas retourner d'erreur pour ne pas bloquer le processus
    }
  }
}

let MAX_INSCRIPTIONS = 5; // Valeur par défaut, sera mise à jour dans initializeData()

// Initialiser les données en mémoire si elles sont vides
if (inscriptionsData.length === 0) {
  inscriptionsData = [];
}

if (pendingPaymentsData.length === 0) {
  pendingPaymentsData = [];
}

if (groupLinksData.groups.length === 0) {
  groupLinksData = { groups: [] };
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
    // Générer un nom de fichier unique
    const fileName = `acceptance_${nom.replace(/\s+/g, '_')}_${Date.now()}.pdf`;

    // Si Supabase est disponible, sauvegarder dans une table de documents
    if (supabase) {
      try {
        // Convertir le buffer en base64 pour le stockage dans Supabase
        const pdfBase64 = pdfBuffer.toString('base64');

        const { error } = await supabase
          .from('signed_documents')
          .insert([{
            filename: fileName,
            content: pdfBase64,
            client_name: nom,
            client_email: email,
            client_whatsapp: whatsapp,
            created_at: new Date().toISOString()
          }]);

        if (error) {
          console.error('❌ Erreur sauvegarde PDF dans Supabase:', error.message);
          // Ne pas sauvegarder localement dans un environnement serverless
        } else {
          logger.info(`PDF signé sauvegardé dans Supabase pour ${nom}: ${fileName}`);
          return fileName; // Retourner le nom du fichier dans Supabase
        }
      } catch (supabaseError) {
        console.error('❌ Erreur sauvegarde PDF dans Supabase:', supabaseError.message);
        // Ne pas sauvegarder localement dans un environnement serverless
      }
    }

    // Dans un environnement serverless, ne pas sauvegarder localement
    logger.info(`PDF signé généré pour ${nom} mais non sauvegardé localement (environnement serverless)`);
    return fileName;
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
async function getInscriptions() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('inscriptions')
        .select('*');

      if (error) {
        console.error('❌ Erreur chargement inscriptions depuis Supabase (table inscriptions):', error.message);
        // Si Supabase échoue, retourner les données en mémoire
        return inscriptionsData || [];
      }

      // Toujours retourner les données de Supabase sans les sauvegarder en mémoire
      // pour garantir la fraîcheur des données dans un environnement serverless
      console.log('✅ Inscriptions chargées depuis Supabase (table inscriptions):', data?.length || 0);
      return data || [];
    } catch (error) {
      console.error('❌ Erreur critique chargement inscriptions depuis Supabase (table inscriptions):', error.message);
      // En cas d'erreur critique, retourner les données en mémoire
      return inscriptionsData || [];
    }
  } else {
    // Si Supabase n'est pas disponible, utiliser les données locales
    return inscriptionsData || [];
  }
}

// Fonction pour sauvegarder une inscription
async function saveInscription(userData) {
  const newInscription = {
    id: Date.now(),
    nom: userData.nom,
    email: userData.email,
    whatsapp: userData.whatsapp,
    projet: userData.projet,
    date: new Date().toISOString(),
    owner_id: null  // Ajout de la colonne owner_id requise dans la table
  };

  console.log('💾 Tentative de sauvegarde d\'inscription:', newInscription.nom);

  inscriptionsData.push(newInscription);

  // Sauvegarder dans Supabase si disponible - utiliser la table inscriptions
  if (supabase) {
    try {
      const { error, data } = await supabase
        .from('inscriptions')
        .insert([newInscription]);

      if (error) {
        console.error('❌ Erreur sauvegarde inscription dans Supabase (table inscriptions):', error.message);
        // Ne pas retourner d'erreur pour ne pas bloquer le processus
      } else {
        console.log('✅ Inscription sauvegardée dans Supabase (table inscriptions):', newInscription.nom);
        console.log('✅ Données retournées:', data);
      }
    } catch (error) {
      console.error('❌ Erreur critique sauvegarde inscription dans Supabase (table inscriptions):', error.message);
      // Ne pas retourner d'erreur pour ne pas bloquer le processus
    }
  }

  // Retourner la longueur de la liste mise à jour
  const updatedLength = inscriptionsData.length;
  console.log('📊 Longueur mise à jour des inscriptions:', updatedLength);
  return updatedLength;
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

// Route pour initialiser/mettre à jour le mot de passe admin (une seule fois au démarrage)
async function initAdminPassword() {
  try {
    // Si le mot de passe admin n'est pas défini, utiliser le mot de passe par défaut
    if (!adminPassword) {
      const plainPassword = process.env.ADMIN_PASSWORD || 'Admin@12346'; // Mot de passe par défaut mis à jour
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      adminPassword = hashedPassword;
      logger.info('Mot de passe admin haché et sauvegardé en mémoire');
    } else {
      // Si le mot de passe existe déjà en mémoire, on ne fait rien pour préserver le mot de passe existant
      logger.info('Mot de passe admin existe déjà, inchangé');
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

    // Comparer le mot de passe haché
    const passwordMatch = await bcrypt.compare(password, adminPassword);

    if (!passwordMatch) {
      logger.warn('Tentative de connexion échouée');
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // Générer un token JWT
    const token = jwt.sign(
      { userId: 'admin', timestamp: Date.now() },
      JWT_SECRET,
      { expiresIn: '24h' } // Le token expire après 24 heures
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

  // Charger la configuration générale depuis le fichier local
  const generalConfigPath = path.join(__dirname, 'config.json');
  let generalConfig = { maxPlaces: 5 }; // Valeur par défaut

  if (fs.existsSync(generalConfigPath)) {
    const generalConfigFile = fs.readFileSync(generalConfigPath, 'utf8');
    generalConfig = JSON.parse(generalConfigFile);
  }

  logger.info(`Inscriptions: ${inscriptions.length}/${generalConfig.maxPlaces}, Session: ${sessionOpenStatus}`);

  res.json({
    count: inscriptions.length,
    max: generalConfig.maxPlaces,
    available: inscriptions.length < generalConfig.maxPlaces,
    sessionOpen: sessionOpenStatus
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
    const paymentId = Date.now().toString();
    const paymentData = {
      id: paymentId,
      nom,
      email,
      whatsapp,
      projet,
      method,
      status: 'pending',
      date: new Date().toISOString()  // Format ISO compatible avec Supabase
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

    pendingPaymentsData.push(paymentData);

    // Sauvegarder dans Supabase si disponible
    if (supabase) {
      try {
        // Préparer les données pour correspondre à la structure de la table Supabase
        const supabasePaymentData = {
          id: paymentData.id,
          nom: paymentData.nom,
          email: paymentData.email,
          whatsapp: paymentData.whatsapp,
          projet: paymentData.projet,
          method: paymentData.method,
          status: paymentData.status,
          date: paymentData.date,
          proof: paymentData.proof || null,
          proofmime: paymentData.proofMime || null,
          transactionid: paymentData.transactionId || null
        };

        const { error } = await supabase
          .from('pending_payments')
          .insert([supabasePaymentData]);

        if (error) {
          console.error('❌ Erreur sauvegarde paiement dans Supabase:', error.message);
          // Ne pas retourner d'erreur pour ne pas bloquer le processus
        } else {
          console.log('✅ Paiement sauvegardé dans Supabase:', paymentData.nom);
        }
      } catch (error) {
        console.error('❌ Erreur critique sauvegarde paiement dans Supabase:', error.message);
        // Ne pas retourner d'erreur pour ne pas bloquer le processus
      }
    }

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
          const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              chat_id: process.env.TELEGRAM_CHAT_ID,
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
app.get('/admin/pending-payments', requireAdminAuth, async (req, res) => {
  // Charger les paiements en attente depuis Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('pending_payments')
        .select('*');

      if (error) {
        console.error('❌ Erreur chargement paiements en attente depuis Supabase:', error.message);
        // En cas d'erreur, retourner les données en mémoire
        res.json(pendingPaymentsData);
      } else {
        // Mettre à jour la variable en mémoire et retourner les données
        pendingPaymentsData = data;
        res.json(data);
      }
    } catch (error) {
      console.error('❌ Erreur critique chargement paiements en attente depuis Supabase:', error.message);
      // En cas d'erreur critique, retourner les données en mémoire
      res.json(pendingPaymentsData);
    }
  } else {
    // Si Supabase n'est pas disponible, utiliser les données en mémoire
    res.json(pendingPaymentsData);
  }
});

// Route pour admin - voir les inscriptions
app.get('/admin/inscriptions', requireAdminAuth, async (req, res) => {
  // Charger les inscriptions depuis la fonction existante
  const inscriptions = await getInscriptions();

  // Charger la configuration générale depuis le fichier local
  const generalConfigPath = path.join(__dirname, 'config.json');
  let generalConfig = { maxPlaces: 5 }; // Valeur par défaut

  if (fs.existsSync(generalConfigPath)) {
    const generalConfigFile = fs.readFileSync(generalConfigPath, 'utf8');
    generalConfig = JSON.parse(generalConfigFile);
  }

  // Calculer le total en incluant les inscriptions validées
  const total = inscriptions.length;

  res.json({
    inscriptions,
    total: total,
    max: generalConfig.maxPlaces,
    sessionOpen: sessionOpenStatus
  });
});

// Route pour admin - approuver un paiement avec lien du groupe
app.post('/admin/approve-payment/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { groupLink } = req.body;

    // Trouver le paiement
    const paymentIndex = pendingPaymentsData.findIndex(p => p.id === id);
    if (paymentIndex === -1) {
      return res.status(404).json({ error: 'Paiement non trouvé' });
    }

    const payment = pendingPaymentsData[paymentIndex];

    // Vérifier les places en chargeant la configuration à jour
    const config = await getConfig();
    const maxPlaces = config.maxPlaces || config.max_places || 5;

    const inscriptions = await getInscriptions();
    if (inscriptions.length >= maxPlaces) {
      return res.status(409).json({ error: 'Places épuisées' });
    }

    // Sauvegarder l'inscription confirmée dans la table payments
    const totalCount = await saveInscription({
      nom: payment.nom,
      email: payment.email,
      whatsapp: payment.whatsapp,
      projet: payment.projet
    });

    // Mettre à jour le statut du paiement dans la table pending_payments
    if (supabase) {
      try {
        const { error } = await supabase
          .from('pending_payments')
          .update({ status: 'approved' })
          .eq('id', payment.id);

        if (error) {
          console.error('❌ Erreur mise à jour statut paiement dans Supabase:', error.message);
          // Ne pas arrêter le processus en cas d'erreur
        } else {
          console.log('✅ Statut du paiement mis à jour dans Supabase:', payment.id);
        }
      } catch (supabaseError) {
        console.error('❌ Erreur critique mise à jour statut paiement dans Supabase:', supabaseError.message);
        // Ne pas arrêter le processus en cas d'erreur
      }
    }

    // Mettre à jour le statut du paiement en mémoire
    payment.status = 'approved';
    pendingPaymentsData[paymentIndex] = payment;

    // Sauvegarder le lien du groupe dans Supabase si fourni
    if (groupLink) {
      if (supabase) {
        try {
          const { error } = await supabase
            .from('group_links')
            .insert([{
              id: payment.id,
              nom: payment.nom,
              email: payment.email,
              link: groupLink,
              date: new Date().toLocaleString('fr-FR')
            }]);

          if (error) {
            console.error('❌ Erreur sauvegarde lien du groupe dans Supabase:', error.message);
          } else {
            console.log(`✅ Lien du groupe sauvegardé dans Supabase pour ${payment.nom}`);
          }
        } catch (supabaseError) {
          console.error('❌ Erreur critique sauvegarde lien du groupe dans Supabase:', supabaseError.message);
        }
      }

      // Ajouter aussi en mémoire pour la cohérence
      groupLinksData.groups.push({
        id: payment.id,
        nom: payment.nom,
        email: payment.email,
        link: groupLink,
        date: new Date().toLocaleString('fr-FR')
      });
    }

    // Générer le PDF d'acceptation
    const acceptancePdfBuffer = await generateAcceptancePDF(payment.nom, payment.email, payment.whatsapp);

    // Sauvegarder le PDF d'acceptation pour archivage
    const pdfPath = await saveSignedPDF(payment.nom, payment.email, payment.whatsapp, acceptancePdfBuffer);

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

    // Envoyer l'email avec le PDF joint (soit depuis Supabase, soit depuis le buffer local)
    const emailSent = await sendEmailWithAttachment(
      payment.email,
      '✅ Votre inscription Boost & Success est approuvée!',
      emailHtml,
      `acceptance_${payment.nom.replace(/\s+/g, '_')}_${Date.now()}.pdf`,  // attachmentName
      pdfPath  // attachmentPath (soit le nom dans Supabase, soit le chemin local)
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

    // Trouver le paiement dans les données en mémoire
    const paymentIndex = pendingPaymentsData.findIndex(p => p.id === id);
    if (paymentIndex === -1) {
      return res.status(404).json({ error: 'Paiement non trouvé' });
    }

    const payment = pendingPaymentsData[paymentIndex];

    // Mettre à jour le statut du paiement
    payment.status = 'rejected';
    pendingPaymentsData[paymentIndex] = payment;

    // Mettre à jour dans Supabase si disponible
    if (supabase) {
      try {
        const { error } = await supabase
          .from('pending_payments')
          .update({ status: 'rejected' })
          .eq('id', payment.id);

        if (error) {
          console.error('❌ Erreur mise à jour statut paiement dans Supabase:', error.message);
          // Ne pas arrêter le processus en cas d'erreur Supabase
        }
      } catch (supabaseError) {
        console.error('❌ Erreur mise à jour statut paiement dans Supabase:', supabaseError.message);
        // Ne pas arrêter le processus en cas d'erreur Supabase
      }
    }

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

// Variable en mémoire pour le statut des inscriptions
let sessionOpenStatus = true; // Valeur par défaut

// Route pour admin - ouvrir/fermer les inscriptions
app.post('/admin/toggle-session', requireAdminAuth, (req, res) => {
  try {
    console.log('🔍 Avant basculement - Statut actuel:', sessionOpenStatus);

    // Basculer le statut
    sessionOpenStatus = !sessionOpenStatus;

    console.log('🔍 Nouveau statut des inscriptions:', sessionOpenStatus);

    // Mettre à jour la variable en mémoire
    configData = { ...configData, sessionOpen: sessionOpenStatus };

    res.json({
      success: true,
      message: sessionOpenStatus ? 'Inscriptions ouvertes' : 'Inscriptions fermées',
      sessionOpen: sessionOpenStatus
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

// Routes pour servir les pages HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin-login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/admin-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

// Démarrer le serveur
const port = process.env.PORT || 3000;

async function startServer() {
  try {
    // Initialiser les données
    await initializeData();

    app.listen(port, async () => {
      logger.info(`Serveur lancé sur le port ${port}`);

      // Log l'état initial
      const inscriptions = await getInscriptions();
      const config = await getConfig();
      logger.info(`Inscriptions: ${inscriptions.length}/${config.maxPlaces}`);
      logger.info(`Session: ${config.sessionOpen ? 'OUVERTE' : 'FERMÉE'}`);
    });
  } catch (error) {
    logger.error('Erreur démarrage serveur:', error.message);
    process.exit(1);
  }
}

startServer();