const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getDefaultBrowserProfilePath(browserName) {
    console.log("Detecting profile path for browser:", browserName);
    const username = process.env.USERNAME;
    console.log("User profile base:", process.env.USERPROFILE);
    if (!username) return null;

    const profilePaths = {
        'Microsoft Edge': path.join('C:', 'Users', username, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data'),
        'Google Chrome': path.join('C:', 'Users', username, 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
        'Brave Browser': path.join('C:', 'Users', username, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data'),
    };

    const profilePath = profilePaths[browserName];
    console.log("Constructed profile path:", profilePath);
    const exists = profilePath && fs.existsSync(profilePath);
    console.log("Profile path exists:", exists);
    if (exists) {
        console.log("Returning profile path:", profilePath);
        return profilePath;
    }
    console.log("Returning profile path: null");
    return null;
}

function getDefaultBrowserInfo() {
  console.log("getDefaultBrowserInfo called");
  if (process.platform !== 'win32') {
    console.log('Non-Windows platform detected, skipping default browser detection.');
    return null;
  }

  try {
    const command = 'reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice" /v ProgId';
    console.log("Executing registry query command:", command);
    const output = execSync(command, { encoding: 'utf8' });
    const progIdMatch = output.match(/ProgId\s+REG_SZ\s+(\S+)/);

    if (progIdMatch && progIdMatch[1]) {
      const progId = progIdMatch[1];
      console.log(`Registry query successful, ProgId: ${progId}`);

      const browserMappings = {
        MSEdgeHTM: {
          name: 'Microsoft Edge',
          type: 'edge',
          paths: [
            "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
            "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
          ]
        },
        ChromeHTML: {
          name: 'Google Chrome',
          type: 'chrome',
          paths: [
            "C:/Program Files/Google/Chrome/Application/chrome.exe",
            "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
          ]
        },
        BraveHTML: {
            name: 'Brave Browser',
            type: 'brave',
            paths: [
                "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
            ]
        },
        FirefoxURL: {
            name: 'Mozilla Firefox',
            type: 'firefox',
            paths: [
                "C:/Program Files/Mozilla Firefox/firefox.exe"
            ]
        }
      };

      const browser = Object.values(browserMappings).find(b => progId.includes(b.name.split(' ')[0]));

      if (browser) {
        console.log("Mapped to browser:", browser.name);
        for (const execPath of browser.paths) {
          if (fs.existsSync(execPath)) {
            console.log("Executable path:", execPath);
            const profilePath = getDefaultBrowserProfilePath(browser.name);
            console.log("Profile path:", profilePath);
            const browserInfo = { name: browser.name, executablePath: execPath, type: browser.type, profilePath };
            console.log("Returning browser info object", JSON.stringify(browserInfo));
            return browserInfo;
          }
        }
      }
    }
  } catch (error) {
    console.error('Registry query failed:', error.message);
    console.log("Attempting fallback browser detection...");
  }

  // Fallback: Check for Edge directly
  const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  if (fs.existsSync(edgePath)) {
      const profilePath = getDefaultBrowserProfilePath('Microsoft Edge');
      const browserInfo = { name: 'Microsoft Edge', executablePath: edgePath, type: 'edge', profilePath };
      console.log("Returning fallback browser info object", JSON.stringify(browserInfo));
      return browserInfo;
  }

  console.log("WARNING: Returning null, no browser found");
  return null;
}

module.exports = { getDefaultBrowserInfo, getDefaultBrowserProfilePath };
