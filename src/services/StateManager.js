const EventEmitter = require('events');
const mixin = require('mixin-deep');
const TimerService = require('./TimerService');
const DataFetcherService = require('./DataFetcherService');
const secureStorage = require('../utils/secureStorage');
const sessionStorage = require('../utils/sessionStorage');
const path = require('path');
const fs = require('fs');

class StateManager extends EventEmitter {
  constructor() {
    super();
    this.state = {
      timer: {
        currentTime: 0,
        isRunning: false,
        isPaused: false,
      },
      platformStats: {
        youtube: { total: 0, sessionNew: 0 },
        tiktok: { total: 0, sessionNew: 0 },
        instagram: { total: 0, sessionNew: 0 },
        facebook: { total: 0, sessionNew: 0 },
      },
      totalSessionFollowers: 0,
      totalSessionTimeAdded: 0,
      sessionStartTime: null,
      hypeModeActive: false,
      isPollingPaused: false,
      lastEvent: null,
      lastSoundEvent: null,
      
      config: {
        browser: {
          type: 'windows-default',
          customPath: '',
          useRealProfile: true,
          connectionMode: 'connect',
          remoteDebuggingPort: 9222,
          reopenOnExit: true,
          manualProfilePath: ''
        },
        platforms: {
          youtube: { enabled: false, url: '', selector: '', logo: null, showSessionFollowers: true, useApi: false, apiKey: '' },
          tiktok: { enabled: false, url: 'https://www.tiktok.com/tiktokstudio', selector: '[data-e2e="followers-count"]', logo: null, showSessionFollowers: true, useApi: false, apiKey: '' },
          instagram: { enabled: false, url: '', selector: '', logo: null, showSessionFollowers: true, useApi: false, apiKey: '', accessToken: '', userId: '' },
          facebook: { enabled: false, url: '', selector: '', logo: null, showSessionFollowers: true, useApi: false, apiKey: '', accessToken: '', pageId: '' }
        },
        panic: {
          autoTrigger: 100,
          timeWindow: 10,
          duration: 300
        },
        hype: {
          trigger: 5,
          timeWindow: 10,
          duration: 60,
          multiplier: 2.0
        },
        polling: {
          interval: 10000
        },
        timePerFollower: 30000,
        initialTime: 3600000, // 60 minutes
        goal: 0,
        customization: {
          theme: 'default',
          soundEnabled: true,
          soundVolume: 50,
          sounds: {
            newFollower: 'default',
            goalAchieved: 'default',
            timerEnd: 'default'
          },
          totalFollowers: {
            mode: 'session',
            showSessionDiff: false
          },
          followerGoal: {
            mode: 'session'
          }
        }
      }
    };

    const unencryptedConfigPath = path.join(__dirname, '..', '..', 'config.json');
    if (fs.existsSync(unencryptedConfigPath)) {
        try {
            const unencryptedConfig = JSON.parse(fs.readFileSync(unencryptedConfigPath, 'utf8'));
            this.state.config = mixin(this.state.config, unencryptedConfig);
            this.saveConfigToFile();
            fs.unlinkSync(unencryptedConfigPath);
            console.log('Successfully migrated unencrypted config to encrypted config.');
        } catch (error) {
            console.error('Failed to migrate unencrypted config:', error);
        }
    }

    const savedConfig = secureStorage.loadConfig();
    if (savedConfig) {
        const isCorrupted = !savedConfig.browser || !savedConfig.browser.remoteDebuggingPort;
        if (isCorrupted) {
            console.warn("Detected corrupted config, resetting to defaults...");
            this.resetConfigToDefaults();
        } else {
            this.state.config = mixin(this.state.config, savedConfig);
        }
    } else {
        this.saveConfigToFile();
    }

    const savedSession = sessionStorage.loadSession();
    if (savedSession) {
        this.state = mixin(this.state, savedSession);
    }

    this.on('state-change', (state) => {
        const session = {
            platformStats: state.platformStats,
            totalSessionFollowers: state.totalSessionFollowers,
            totalSessionTimeAdded: state.totalSessionTimeAdded,
            sessionStartTime: state.sessionStartTime,
        };
        sessionStorage.saveSession(session);
    });

    TimerService.on('timer-update', (currentTime) => this.updateTimerState({ currentTime }));
    TimerService.on('timer-start', (currentTime) => {
      if (this.state.sessionStartTime === null) {
        this.state.sessionStartTime = Date.now();
      }
      this.updateTimerState({ currentTime, isRunning: true, isPaused: false });
    });
    TimerService.on('timer-pause', (currentTime) => this.updateTimerState({ currentTime, isPaused: true }));
    TimerService.on('timer-resume', (currentTime) => this.updateTimerState({ currentTime, isPaused: false }));
    TimerService.on('timer-stop', () => {
      this.updateTimerState({ currentTime: 0, isRunning: false, isPaused: false });
      this.state.lastSoundEvent = 'timerEnd';
    });

    TimerService.on('time-added', ({ amount }) => {
      this.state.totalSessionTimeAdded += amount;
      this.emit('state-change', this.state);
    });

    TimerService.on('time-subtracted', ({ amount }) => {
      this.state.totalSessionTimeAdded -= amount;
      this.emit('state-change', this.state);
    });

    this.dataFetcherService = new DataFetcherService(this);
    this.dataFetcherService.on('scrape-success', ({ platform, followerCount, isInitialScrape, source }) => {
      this.state.platformStats[platform].error = null; // Clear error on success
      this.handleNewFollowerCount(platform, followerCount, isInitialScrape, source);
    });
    this.dataFetcherService.on('scrape-error', ({ platform, error }) => {
      console.error(`Scraper error for ${platform}:`, error);
      this.state.platformStats[platform].error = error;
      this.state.platformStats[platform].source = 'scrape'; // Fallback to scrape on API error
      this.emit('state-change', this.state);
    });
  }

  getState() {
    return this.state;
  }

  updateTimerState(timerUpdate) {
    this.state.timer = { ...this.state.timer, ...timerUpdate };
    this.emit('state-change', this.state);
  }

  updatePlatformStats(platform, newCount) {
    const oldTotal = this.state.platformStats[platform].total;
    if (newCount > oldTotal) {
      const diff = newCount - oldTotal;
      this.state.platformStats[platform].sessionNew += diff;
      this.state.totalSessionFollowers += diff;
      // Assuming time added is handled elsewhere, just updating stats here
    }
    this.state.platformStats[platform].total = newCount;
    this.emit('state-change', this.state);
  }

  async resetSession() {
    TimerService.stop();
    this.dataFetcherService.disableScraping();
    Object.keys(this.dataFetcherService.pollingIntervals).forEach(platform => {
        this.dataFetcherService.stopPolling(platform);
    });
    await this.dataFetcherService.closeAllPages();

    this.state.totalSessionFollowers = 0;
    this.state.totalSessionTimeAdded = 0;
    this.state.sessionStartTime = null;
    for (const platform in this.state.platformStats) {
      this.state.platformStats[platform].sessionNew = 0;
      this.state.platformStats[platform].total = 0;
    }
    this.emit('state-change', this.state);
    console.log("Session reset, timer stopped, scraping stopped, and pages closed.");
  }

  updateConfig(newConfig) {
    this.state.config = mixin(this.state.config, newConfig);
    this.saveConfigToFile();
    this.emit('state-change', this.state);
  }

  updatePlatformConfig(platform, newConfig) {
    const logConfig = { ...newConfig };
    if (logConfig.logo && logConfig.logo.startsWith('data:image')) {
      logConfig.logo = `(data:image/...base64..., length=${logConfig.logo.length})`;
    }
    console.log(`Updating platform config for ${platform}:`, JSON.stringify(logConfig, null, 2));
    this.state.config.platforms[platform] = mixin(this.state.config.platforms[platform], newConfig);
    this.saveConfigToFile();
    this.emit('state-change', this.state);
  }

  updatePlatformLogo(platform, logoData) {
    const logData = (logoData && logoData.startsWith('data:image')) ? `(data:image/...base64..., length=${logoData.length})` : logoData;
    console.log(`Updating platform logo for ${platform}:`, logData);
    this.state.config.platforms[platform].logo = logoData;
    this.saveConfigToFile();
    this.emit('state-change', this.state);
  }

  resetPlatformLogo(platform) {
    this.state.config.platforms[platform].logo = null;
    this.saveConfigToFile();
    this.emit('state-change', this.state);
  }

  saveConfigToFile() {
    secureStorage.saveConfig(this.state.config);
  }

  resetConfigToDefaults() {
    console.log("Resetting config to defaults...");
    const fs = require('fs');
    const configPath = './config.json';
    try {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
        console.log("Deleted corrupted config.json");
      }
    } catch (error) {
      console.log("Could not delete config.json:", error.message);
    }
    this.saveConfigToFile();
    console.log("Created new config.json with defaults");
  }

  handleNewFollowerCount(platform, newCount, isInitialScrape = false, source = 'scrape') {
    console.log(`handleNewFollowerCount: platform=${platform}, newCount=${newCount}, isInitialScrape=${isInitialScrape}, source=${source}`);
    
    const platformData = this.state.platformStats[platform];
    platformData.source = source;
    const oldCount = platformData.total;
    
    // If this is the initial scrape, just set baseline
    if (isInitialScrape) {
      console.log(`Initial scrape for ${platform}: ${newCount} followers (baseline set, no time added)`);
      platformData.total = newCount;
      this.emit('state-change', this.state);
      return; // EXIT HERE - don't add time or increment session
    }
    
    // For subsequent scrapes, check if count increased
    if (newCount > oldCount) {
      const newFollowers = newCount - oldCount;
      const timePerFollower = this.state.config.timePerFollower || 30000;
      const timeToAdd = newFollowers * timePerFollower;
      
      console.log(`+${newFollowers} followers on ${platform}, added ${timeToAdd/1000}s`);
      
      // Update stats
      platformData.total = newCount;
      platformData.sessionNew += newFollowers;
      this.state.totalSessionFollowers += newFollowers;

      if (this.state.config.goal > 0 && this.state.totalSessionFollowers >= this.state.config.goal) {
        this.state.lastSoundEvent = 'goalAchieved';
      }
      
      // Add time to timer
      TimerService.addTime(timeToAdd);
      
      // Set last event for animations
      this.state.lastEvent = {
        platform,
        timeAdded: timeToAdd / 1000,
        timestamp: Date.now()
      };
      this.state.lastSoundEvent = 'newFollower';
      
      this.emit('state-change', this.state);
      
    } else if (newCount < oldCount) {
      console.log(`Count decreased for ${platform}: ${oldCount} → ${newCount}`);
      platformData.total = newCount;
      this.emit('state-change', this.state);
    } else {
      console.log(`No change in follower count for ${platform}`);
    }
  }
}

module.exports = new StateManager();
