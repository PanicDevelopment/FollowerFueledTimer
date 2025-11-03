const StateManager = require('./StateManager');
const TimerService = require('./TimerService');
const fs = require('fs');
const path = require('path');

let io;

function initialize(socketIoInstance) {
  io = socketIoInstance;

  io.on('connection', (socket) => {
    console.log('a user connected');
    socket.emit('state-update', StateManager.getState()); // Send initial state
    socket.on('disconnect', () => {
      console.log('user disconnected');
    });

    socket.on('timer-start', async (data) => {
      try {
        console.log("=== TIMER START EVENT RECEIVED ===");
        console.log("Data:", data);
        
        const { initialTime } = data;
        
        // Reset session stats before starting
        StateManager.state.totalSessionFollowers = 0;
        StateManager.state.totalSessionTimeAdded = 0;
        StateManager.state.sessionStartTime = Date.now();
        for (const platform in StateManager.state.platformStats) {
            StateManager.state.platformStats[platform].sessionNew = 0;
            StateManager.state.platformStats[platform].total = 0;
        }
        StateManager.emit('state-change', StateManager.getState());

        // Start timer
        console.log("Starting timer...");
        TimerService.start(initialTime);
        
        // Enable scraping
        console.log("Enabling scraping...");
        // This is a placeholder for the actual method if it exists on the service
        if (StateManager.dataFetcherService.enableScraping) {
            StateManager.dataFetcherService.enableScraping();
        }
        
        // Get enabled platforms
        const platforms = StateManager.getState().config.platforms;
        console.log("Checking platforms:", Object.keys(platforms));
        
        // Start polling for each enabled platform
        Object.keys(platforms).forEach(platform => {
          const config = { ...platforms[platform] };
          if (config.logo && config.logo.startsWith('data:image')) {
            config.logo = `(data:image/...base64..., length=${config.logo.length})`;
          }
          console.log(`Platform ${platform} config:`, JSON.stringify(config, null, 2));
          
          const isApiReady = config.useApi && (
            (platform === 'youtube' && config.apiKey && config.url) ||
            (platform === 'instagram' && config.accessToken && config.userId) ||
            (platform === 'facebook' && config.accessToken && config.pageId)
          );

          const isScraperReady = !config.useApi && config.url && config.selector;

          if (config.enabled && (isApiReady || isScraperReady)) {
            console.log(`>>> Starting polling for ${platform}`);
            StateManager.dataFetcherService.startPolling(platform, config);
          } else {
            console.log(`>>> Skipping ${platform} (not configured or disabled)`);
          }
        });
        
        console.log("=== TIMER START COMPLETE ===");
      } catch (error) {
        console.error('Error in timer-start handler:', error);
      }
    });

    socket.on('timer-pause', () => {
        try {
            TimerService.pause();
            StateManager.dataFetcherService.disableScraping();
            console.log("Timer paused, scraping disabled");
        } catch (error) {
            console.error('Error in timer-pause handler:', error);
        }
    });

    socket.on('timer-resume', () => {
        try {
            TimerService.resume();
            StateManager.dataFetcherService.enableScraping();
            console.log("Timer resumed, scraping enabled");
        } catch (error) {
            console.error('Error in timer-resume handler:', error);
        }
    });

    socket.on('timer-stop', async () => {
        try {
            TimerService.stop();
            StateManager.dataFetcherService.disableScraping();
            Object.keys(StateManager.dataFetcherService.pollingIntervals).forEach(platform => {
              StateManager.dataFetcherService.stopPolling(platform);
            });
            await StateManager.dataFetcherService.closeAllPages();
            console.log("Timer stopped, scraping stopped and pages closed");
        } catch (error) {
            console.error('Error in timer-stop handler:', error);
        }
    });

    socket.on('timer-add-time', (data) => {
        try {
            TimerService.addTime(data.amount);
        } catch (error) {
            console.error('Error in timer-add-time handler:', error);
        }
    });

    socket.on('timer-subtract-time', (data) => {
        try {
            TimerService.subtractTime(data.amount);
        } catch (error) {
            console.error('Error in timer-subtract-time handler:', error);
        }
    });

    socket.on('session-reset', () => {
        try {
            StateManager.resetSession();
        } catch (error) {
            console.error('Error in session-reset handler:', error);
        }
    });

    socket.on('platform-config-update', (data) => {
        try {
            const { platform, enabled, url, selector, showSessionFollowers, useApi, apiKey, accessToken, userId, pageId } = data;
            StateManager.updatePlatformConfig(platform, { enabled, url, selector, showSessionFollowers, useApi, apiKey, accessToken, userId, pageId });
            // DO NOT start polling here!
            // Scraping only starts when timer starts
            console.log(`Config updated for ${platform}, scraping will start when timer starts`);
        } catch (error) {
            console.error('Error in platform-config-update handler:', error);
        }
    });

    socket.on('panic-mode-config', (data) => {
        try {
            StateManager.updateConfig({ panic: data });
        } catch (error) {
            console.error('Error in panic-mode-config handler:', error);
        }
    });

    socket.on('hype-mode-config', (data) => {
        try {
            StateManager.updateConfig({ hype: data });
        } catch (error) {
            console.error('Error in hype-mode-config handler:', error);
        }
    });

    socket.on('sound-config-update', (data) => {
        try {
            StateManager.updateConfig({ customization: { ...StateManager.getState().config.customization, ...data } });
        } catch (error) {
            console.error('Error in sound-config-update handler:', error);
        }
    });

    socket.on('total-followers-config-update', (data) => {
        try {
            const newCustomization = { ...StateManager.getState().config.customization };
            newCustomization.totalFollowers = { ...newCustomization.totalFollowers, ...data };
            StateManager.updateConfig({ customization: newCustomization });
        } catch (error) {
            console.error('Error in total-followers-config-update handler:', error);
        }
    });

    socket.on('follower-goal-config-update', (data) => {
        try {
            const newCustomization = { ...StateManager.getState().config.customization };
            newCustomization.followerGoal = { ...newCustomization.followerGoal, ...data };
            StateManager.updateConfig({ customization: newCustomization });
        } catch (error) {
            console.error('Error in follower-goal-config-update handler:', error);
        }
    });

    socket.on('reset-last-sound-event', () => {
        try {
            StateManager.state.lastSoundEvent = null;
        } catch (error) {
            console.error('Error in reset-last-sound-event handler:', error);
        }
    });

    socket.on('sound-upload', (data) => {
        try {
            const { event, soundData, fileName } = data;
            const base64Data = soundData.replace(/^data:audio\/[a-z]+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const ext = path.extname(fileName);
            const soundPath = path.join(__dirname, '..', '..', 'public', `${event}-sound${ext}`);
            fs.writeFile(soundPath, buffer, (err) => {
                if (err) {
                    console.error(`Error saving sound for ${event}:`, err);
                    return;
                }
                const newSounds = { ...StateManager.getState().config.customization.sounds, [event]: `${event}-sound${ext}` };
                StateManager.updateConfig({ customization: { ...StateManager.getState().config.customization, sounds: newSounds } });
            });
        } catch (error) {
            console.error('Error in sound-upload handler:', error);
        }
    });

    socket.on('sound-reset', (data) => {
        try {
            const { event } = data;
            const currentSound = StateManager.getState().config.customization.sounds[event];
            if (currentSound && currentSound !== 'default') {
                const soundPath = path.join(__dirname, '..', '..', 'public', currentSound);
                if (fs.existsSync(soundPath)) {
                    fs.unlinkSync(soundPath);
                }
            }
            const newSounds = { ...StateManager.getState().config.customization.sounds, [event]: 'default' };
            StateManager.updateConfig({ customization: { ...StateManager.getState().config.customization, sounds: newSounds } });
        } catch (error) {
            console.error('Error in sound-reset handler:', error);
        }
    });

    socket.on('goal-update', (data) => {
        try {
            StateManager.updateConfig({ goal: data.goal });
        } catch (error) {
            console.error('Error in goal-update handler:', error);
        }
    });

    socket.on('timer-config-update', (data) => {
        try {
            const { timePerFollower, pollingInterval, initialTime } = data;
            StateManager.updateConfig({ 
                timePerFollower,
                polling: { interval: pollingInterval },
                initialTime 
            });
        } catch (error) {
            console.error('Error in timer-config-update handler:', error);
        }
    });

    socket.on('platform-logo-upload', (data) => {
        try {
            const { platform, logoData, fileName } = data;
            console.log(`Received logo upload for: ${platform}`);

            let logoDataURL = logoData;
            if (!logoData.startsWith('data:image')) {
                const ext = fileName.split('.').pop().toLowerCase();
                const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
                logoDataURL = `data:${mimeType};base64,${logoData}`;
            }
            console.log(`Data URL starts with: ${logoDataURL.substring(0, 50)}`);

            StateManager.updatePlatformLogo(platform, logoDataURL);
            console.log(`State updated, logo exists: ${StateManager.getState().config.platforms[platform].logo ? 'YES' : 'NO'}`);

            const base64Data = logoDataURL.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const ext = fileName.split('.').pop().toLowerCase();
            const logoPath = path.join(__dirname, '..', '..', 'public', 'platform-logos', `${platform}-logo.${ext}`);
            fs.writeFile(logoPath, buffer, (err) => {
                if (err) {
                    console.error('Error saving logo:', err);
                }
            });
        } catch (error) {
            console.error('Error in platform-logo-upload handler:', error);
        }
    });

    socket.on('platform-logo-reset', (data) => {
        try {
            StateManager.resetPlatformLogo(data.platform);
            const logoPath = path.join(__dirname, '..', '..', 'public', 'platform-logos', `${data.platform}-logo.png`);
            if (fs.existsSync(logoPath)) {
                fs.unlinkSync(logoPath);
            }
        } catch (error) {
            console.error('Error in platform-logo-reset handler:', error);
        }
    });

    socket.on('test-platform-selector', async (data) => {
        try {
            const { platform, url, selector, timeout } = data;
            const result = await StateManager.dataFetcherService.testSelector(platform, url, selector, timeout);
            socket.emit('test-selector-result', result);
        } catch (error) {
            console.error('Error in test-platform-selector handler:', error);
            socket.emit('test-selector-result', { platform: data.platform, success: false, error: error.message });
        }
    });

    socket.on('update-browser-config', async (data) => {
        try {
            StateManager.updateConfig({ browser: data });
            await StateManager.dataFetcherService.cleanup();
            await StateManager.dataFetcherService.initialize();
            socket.emit('browser-config-updated');
        } catch (error) {
            console.error('Error in update-browser-config handler:', error);
        }
    });

    socket.on('cancel-selector-test', (data) => {
        try {
            StateManager.dataFetcherService.cancelTest(data.platform);
        } catch (error) {
            console.error('Error in cancel-selector-test handler:', error);
        }
    });

    socket.on('test-browser-connection', async () => {
        try {
            const result = await StateManager.dataFetcherService.connectToExistingBrowser();
            if(result){
                const version = await result.version();
                const pages = await result.pages();
                result.disconnect();
                socket.emit('browser-launch-verified', { success: true, browserName: 'Existing Browser', version, path: 'localhost:9222', pages: pages.length });
            } else {
                socket.emit('browser-launch-verified', { success: false, error: 'Cannot connect. Make sure Edge is running with remote debugging enabled.' });
            }
        } catch (error) {
            console.error('Error in test-browser-connection handler:', error);
            socket.emit('browser-launch-verified', { success: false, error: error.message });
        }
    });

    socket.on('verify-browser-launch', async () => {
        try {
            const result = await StateManager.dataFetcherService.verifyBrowserLaunch();
            socket.emit('browser-launch-verified', result);
        } catch (error) {
            console.error('Error in verify-browser-launch handler:', error);
            socket.emit('browser-launch-verified', { success: false, error: error.message });
        }
    });

    socket.on('get-detected-browser', () => {
        try {
            const browserInfo = require('../utils/windowsDefaultBrowser').getDefaultBrowserInfo();
            socket.emit('detected-browser-info', browserInfo);
        } catch (error) {
            console.error('Error in get-detected-browser handler:', error);
        }
    });

    socket.on('auto-fill-url', async (data) => {
        try {
          const { platform } = data;
          console.log(`Auto-fill URL requested for ${platform}`);
          
          const url = await StateManager.dataFetcherService.detectPlatformURL(platform);
          socket.emit('auto-fill-url-result', { platform, url, success: true });
          
        } catch (error) {
          console.error(`Auto-fill URL failed for ${data.platform}:`, error.message);
          socket.emit('auto-fill-url-result', { 
            platform: data.platform, 
            error: error.message, 
            success: false 
          });
        }
      });

    socket.on('force-close-edge', async () => {
        try {
            await require('../utils/processCleanup').killEdgeProcesses();
            await StateManager.dataFetcherService.initialize();
        } catch (error) {
            console.error('Error in force-close-edge handler:', error);
        }
    });

    socket.on('auto-detect-selector', async (data) => {
        try {
          const { platform, url } = data;
          
          // Platform-specific selector hints
          const selectorHints = {
            youtube: '.metric-value-big.style-scope.ytcd-channel-facts-item',
            instagram: '[data-testid="follower_count"]',
            facebook: '[data-testid="page_likes_count"]',
            tiktok: '.follower-count'
          };
          
          const selector = selectorHints[platform];
          
          if (selector) {
            socket.emit('auto-detect-selector-result', {
              platform,
              selector,
              success: true
            });
          } else {
            socket.emit('auto-detect-selector-result', {
              platform,
              success: false,
              error: 'No selector hint available'
            });
          }
          
        } catch (error) {
          socket.emit('auto-detect-selector-result', {
            platform: data.platform,
            success: false,
            error: error.message
          });
        }
    });

    socket.on('test-api-key', async (data) => {
        console.log('test-api-key event received on backend:', data);
        try {
            const { platform, apiKey, channelUrl } = data;
            const result = await StateManager.dataFetcherService.testApiKey(platform, apiKey, channelUrl);
            console.log('test-api-key result from DataFetcherService:', result);
            socket.emit('test-api-key-result', result);
        } catch (error) {
            console.error('Error in test-api-key handler:', error);
            socket.emit('test-api-key-result', { platform: data.platform, success: false, error: error.message });
        }
    });
  });

  StateManager.on('state-change', (state) => {
    broadcast('state-update', state);
  });

  return io;
}

function broadcast(eventName, data) {
  if (io) {
    io.emit(eventName, data);
  }
}

module.exports = {
  initialize,
  broadcast,
};
