const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', '..', 'config.json');

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath);
      return JSON.parse(configData);
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return {};
}

module.exports = { saveConfig, loadConfig };
