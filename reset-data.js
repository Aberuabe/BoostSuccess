const fs = require('fs');
const path = require('path');

console.log('Resetting all data for the site...');

// Reset inscriptions
const inscriptionsPath = path.join(__dirname, 'inscriptions.json');
fs.writeFileSync(inscriptionsPath, '[]');
console.log('✓ Inscriptions data reset');

// Reset pending payments
const pendingPaymentsPath = path.join(__dirname, 'pending-payments.json');
fs.writeFileSync(pendingPaymentsPath, '[]');
console.log('✓ Pending payments data reset');

// Reset group links
const groupLinksPath = path.join(__dirname, 'group-links.json');
fs.writeFileSync(groupLinksPath, '{"groups": []}');
console.log('✓ Group links data reset');

// Reset admin password to default (keeping the same hashed password for security)
const adminPasswordPath = path.join(__dirname, 'admin-password.json');
const defaultPasswordHash = "$2a$10$KRkDR24YXQ6XxjNmcKmcVOaq4DkDdZ8ocEds7qqrMvh.EkWZ7BQUy";
fs.writeFileSync(adminPasswordPath, JSON.stringify({password: defaultPasswordHash}));
console.log('✓ Admin password reset to default');

// Reset configuration to default values
const configPath = path.join(__dirname, 'config.json');
const defaultConfig = {
  maxPlaces: 5,
  sessionOpen: true
};
fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
console.log('✓ Configuration reset to default');

// Clear signed PDFs directory if it exists
const signedPdfsDir = path.join(__dirname, 'signed-pdfs');
if (fs.existsSync(signedPdfsDir)) {
  const pdfFiles = fs.readdirSync(signedPdfsDir);
  pdfFiles.forEach(file => {
    if (path.extname(file).toLowerCase() === '.pdf') {
      fs.unlinkSync(path.join(signedPdfsDir, file));
      console.log(`✓ Deleted PDF: ${file}`);
    }
  });
  console.log('✓ Signed PDFs directory cleared');
}

console.log('\nAll data has been reset successfully!');
console.log('The site is now ready with fresh data.');