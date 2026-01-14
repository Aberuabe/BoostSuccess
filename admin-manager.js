#!/usr/bin/env node
/**
 * Script de gestion avancée pour Boost & Success
 * Permet de gérer les places, ouvrir/fermer les inscriptions et tester les notifications
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const CONFIG_FILE = path.join(__dirname, 'config.json');

// Charger la configuration
function getConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = { maxPlaces: 5, sessionOpen: true };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

// Sauvegarder la configuration
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Fonction pour envoyer un message Telegram
async function sendTelegramMessage(text) {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('⚠️  TELEGRAM_TOKEN ou TELEGRAM_CHAT_ID manquant dans .env');
    return false;
  }

  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML'
    });
    return true;
  } catch (error) {
    console.error('❌ Erreur Telegram:', error.message);
    return false;
  }
}

// Fonction pour tester la connexion au bot
async function testBotConnection() {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  
  if (!TELEGRAM_TOKEN) {
    console.log('❌ Token manquant dans .env');
    return false;
  }

  try {
    const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getMe`);
    
    if (response.data.ok) {
      console.log('✅ Bot actif:', response.data.result.first_name);
      return true;
    } else {
      console.log('❌ Erreur de connexion au bot');
      return false;
    }
  } catch (error) {
    console.log('❌ Erreur de connexion au bot:', error.message);
    return false;
  }
}

// Fonction pour ajouter des places
function addPlaces(placesToAdd) {
  const config = getConfig();
  const newMax = config.maxPlaces + placesToAdd;
  config.maxPlaces = newMax;
  saveConfig(config);

  console.log(`✅ ${placesToAdd} places ajoutées`);
  console.log(`📊 Nouveau total: ${newMax} places`);

  // Envoyer notification Telegram
  sendTelegramMessage(`
✅ <b>NOUVELLES PLACES AJOUTÉES</b>

🎯 <b>Nouvelles places:</b> +${placesToAdd}
📊 <b>Total places:</b> ${newMax}
  `);
}

// Fonction pour réinitialiser les places
function resetPlaces() {
  const config = getConfig();
  config.maxPlaces = 5;
  saveConfig(config);

  console.log('✅ Places réinitialisées à 5');

  // Envoyer notification Telegram
  sendTelegramMessage('🔄 <b>RÉINITIALISATION</b>\n\nLes places ont été réinitialisées à 5.');
}

// Fonction pour ouvrir/fermer les inscriptions
function toggleSession() {
  const config = getConfig();
  config.sessionOpen = !config.sessionOpen;
  saveConfig(config);

  const status = config.sessionOpen ? '🟢 OUVERTES' : '🔴 FERMÉES';
  console.log(`✅ Inscriptions ${config.sessionOpen ? 'ouvertes' : 'fermées'}`);

  // Envoyer notification Telegram
  sendTelegramMessage(`${status}\n\nLa session d'inscription est maintenant ${config.sessionOpen ? 'ouverte' : 'fermée'}.`);
}

// Fonction pour afficher l'état actuel
function showCurrentState() {
  const config = getConfig();
  const inscriptionsFile = path.join(__dirname, 'inscriptions.json');
  let inscriptions = [];
  
  if (fs.existsSync(inscriptionsFile)) {
    inscriptions = JSON.parse(fs.readFileSync(inscriptionsFile, 'utf8'));
  }

  console.log('\n📋 État actuel du système:');
  console.log(`📊 Places maximales: ${config.maxPlaces}`);
  console.log(`👥 Places occupées: ${inscriptions.length}`);
  console.log(`📈 Places disponibles: ${config.maxPlaces - inscriptions.length}`);
  console.log(`🔓 Inscriptions: ${config.sessionOpen ? 'OUVERTES' : 'FERMÉES'}`);
  console.log(`📧 Email configuré: ${process.env.EMAIL_USER ? 'OUI' : 'NON'}`);
  console.log(`🤖 Telegram configuré: ${process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_CHAT_ID ? 'OUI' : 'NON'}`);
}

// Menu principal
async function showMenu() {
  console.log('\n🚀 GESTION BOOST & SUCCESS');
  console.log('=========================');
  console.log('1. Afficher l\'état actuel');
  console.log('2. Ajouter des places');
  console.log('3. Réinitialiser les places (à 5)');
  console.log('4. Ouvrir/Fermer les inscriptions');
  console.log('5. Tester les notifications Telegram');
  console.log('6. Quitter');
  console.log('=========================');
}

// Fonction principale
async function main() {
  console.log('🔐 Chargement de la configuration...');
  
  // Tester la connexion au bot
  const botConnected = await testBotConnection();
  
  if (!botConnected) {
    console.log('\n⚠️  ATTENTION: Le bot Telegram n\'est pas accessible.');
    console.log('   Assurez-vous que:');
    console.log('   - Le token est correct');
    console.log('   - Le bot existe et est actif');
    console.log('   - Vous avez démarré une conversation avec le bot (si c\'est un utilisateur)');
    console.log('   - Le bot a été ajouté au groupe (si c\'est un groupe)');
  }

  let continueLoop = true;
  
  while (continueLoop) {
    await showMenu();
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const option = await new Promise(resolve => {
      rl.question('Choisissez une option (1-6): ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });

    switch (option) {
      case '1':
        showCurrentState();
        break;
      case '2':
        const placesToAdd = await new Promise(resolve => {
          const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
          rl2.question('Combien de places à ajouter? ', (answer) => {
            rl2.close();
            resolve(parseInt(answer));
          });
        });
        
        if (isNaN(placesToAdd) || placesToAdd <= 0) {
          console.log('❌ Nombre invalide');
        } else {
          addPlaces(placesToAdd);
        }
        break;
      case '3':
        const confirmReset = await new Promise(resolve => {
          const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
          rl2.question('Confirmez-vous la réinitialisation à 5 places? (o/n): ', (answer) => {
            rl2.close();
            resolve(answer.toLowerCase() === 'o' || answer.toLowerCase() === 'y');
          });
        });
        
        if (confirmReset) {
          resetPlaces();
        } else {
          console.log('❌ Annulé');
        }
        break;
      case '4':
        const confirmToggle = await new Promise(resolve => {
          const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
          rl2.question('Confirmez-vous l\'ouverture/fermeture des inscriptions? (o/n): ', (answer) => {
            rl2.close();
            resolve(answer.toLowerCase() === 'o' || answer.toLowerCase() === 'y');
          });
        });
        
        if (confirmToggle) {
          toggleSession();
        } else {
          console.log('❌ Annulé');
        }
        break;
      case '5':
        console.log('📡 Envoi d\'un message de test...');
        const success = await sendTelegramMessage(`🔧 Test de notification - ${new Date().toLocaleString('fr-FR')}\n\n✅ Les notifications Telegram fonctionnent!`);
        if (success) {
          console.log('✅ Message envoyé avec succès!');
        } else {
          console.log('❌ Échec de l\'envoi du message');
        }
        break;
      case '6':
        console.log('👋 Au revoir!');
        continueLoop = false;
        break;
      default:
        console.log('❌ Option invalide');
    }
    
    if (continueLoop) {
      console.log('\n--- Appuyez sur Entrée pour continuer ---');
      await new Promise(resolve => {
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl2.question('', () => {
          rl2.close();
          resolve();
        });
      });
    }
  }
}

// Exécuter le script
main().catch(console.error);