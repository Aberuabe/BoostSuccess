#!/usr/bin/env node
/**
 * Reset Password Script - Réinitialise le mot de passe admin
 * Usage: node reset-password.js
 */

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const ADMIN_FILE = path.join(__dirname, 'admin-password.json');

async function resetPassword() {
  const password = 'admin12346';

  try {
    console.log('\n🔐 Réinitialisation du mot de passe admin...\n');
    
    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Sauvegarder
    const adminConfig = { password: hashedPassword };
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(adminConfig, null, 2));

    console.log('✅ Mot de passe réinitialisé avec succès');
    console.log(`📝 Fichier: ${ADMIN_FILE}`);
    console.log(`🔒 Mot de passe: ${password}`);
    console.log('\n✅ IMPORTANT: Utilisez ce mot de passe pour vous connecter\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

resetPassword();
