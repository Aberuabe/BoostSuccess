const fs = require('fs');
const bcrypt = require('bcrypt');

// Le nouveau mot de passe administrateur
const newPassword = 'Admin@12346';

// Hacher le mot de passe avec bcrypt (nécessaire pour des raisons de sécurité)
bcrypt.hash(newPassword, 10, (err, hash) => {
  if (err) {
    console.error('Erreur lors du hachage du mot de passe:', err);
    return;
  }

  // Mettre à jour le fichier admin-password.json avec le nouveau hachage
  const passwordFilePath = './admin-password.json';
  const newPasswordData = {
    password: hash
  };

  fs.writeFileSync(passwordFilePath, JSON.stringify(newPasswordData, null, 2));
  
  console.log('Mot de passe administrateur mis à jour avec succès !');
  console.log('Nouveau mot de passe: Admin@12346');
  console.log('Le mot de passe est stocké de manière sécurisée sous forme hachée dans le fichier admin-password.json');
});