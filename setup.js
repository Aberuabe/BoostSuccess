#!/usr/bin/env node
/**
 * Setup Script - Initialiser les données sensibles
 * Usage: node setup.js
 */

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ADMIN_FILE = path.join(__dirname, 'admin-password.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function setupAdmin() {
  console.log('\n🔐 Setup Administrateur Boost & Success\n');

  return new Promise((resolve) => {
    rl.question('Entrez le mot de passe admin (ou appuyez sur Entrée pour "admin12346"): ', async (password) => {
      const adminPassword = password || 'admin12346';

      try {
        // Hasher le mot de passe
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        
        // Sauvegarder
        const adminConfig = { password: hashedPassword };
        fs.writeFileSync(ADMIN_FILE, JSON.stringify(adminConfig, null, 2));

        console.log('\n✅ Mot de passe admin haché et sauvegardé');
        console.log(`📝 Fichier: ${ADMIN_FILE}`);
        console.log(`🔒 Mot de passe: ${adminPassword}`);
        console.log('\n⚠️  Conservez ce mot de passe en sécurité!\n');

        resolve();
      } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
      }
    });
  });
}

async function resetPlaces() {
  console.log('\n📊 Reset des Places\n');

  return new Promise((resolve) => {
    rl.question('Nombre de places maximum (défaut: 5): ', (places) => {
      const maxPlaces = parseInt(places) || 5;

      try {
        const config = {
          maxPlaces: maxPlaces,
          sessionOpen: true
        };

        const configFile = path.join(__dirname, 'config.json');
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

        console.log(`\n✅ Configuration mise à jour`);
        console.log(`📊 Places maximum: ${maxPlaces}`);
        console.log(`📝 Fichier: ${configFile}\n`);

        resolve();
      } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
      }
    });
  });
}

async function main() {
  try {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  🚀 SETUP BOOST & SUCCESS             ║');
    console.log('╚════════════════════════════════════════╝');

    await setupAdmin();
    await resetPlaces();

    console.log('╔════════════════════════════════════════╗');
    console.log('║  ✅ SETUP TERMINÉ                      ║');
    console.log('╚════════════════════════════════════════╝\n');

    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    rl.close();
    process.exit(1);
  }
}

main();
