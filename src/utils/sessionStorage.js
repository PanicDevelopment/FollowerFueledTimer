const fs = require('fs');
const path = require('path');

const sessionFilePath = path.join(__dirname, '..', '..', 'session.json');

function saveSession(session) {
  try {
    fs.writeFileSync(sessionFilePath, JSON.stringify(session, null, 2));
  } catch (error) {
    console.error('Failed to save session:', error);
  }
}

function loadSession() {
  try {
    if (fs.existsSync(sessionFilePath)) {
      const data = fs.readFileSync(sessionFilePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load session:', error);
  }
  return null;
}

module.exports = { saveSession, loadSession };
