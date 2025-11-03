const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const os = require('os');

const configPath = path.join(__dirname, '..', '..', 'config.json.enc');
const salt = 'follower-fueled-timer-salt';
const key = crypto.scryptSync(os.hostname(), salt, 32);
const iv = Buffer.alloc(16, 0);

function saveConfig(config) {
  try {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(config, null, 2), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    fs.writeFileSync(configPath, encrypted);
  } catch (error) {
    console.error('Failed to save encrypted config:', error);
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const encrypted = fs.readFileSync(configPath, 'utf8');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    }
  } catch (error) {
    console.error('Failed to load encrypted config:', error);
  }
  return null;
}

module.exports = { saveConfig, loadConfig };
