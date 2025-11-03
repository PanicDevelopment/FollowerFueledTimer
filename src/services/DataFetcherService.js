const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const EventEmitter = require('events');
const path = require('path');

// Apply stealth plugin
puppeteer.use(StealthPlugin());

const axios = require('axios');

class DataFetcherService extends EventEmitter {
  constructor(stateManager) {
    super();
    this.stateManager = stateManager;
    this.browser = null;
    this.pages = {}; // Store pages for each platform
    this.pollingIntervals = {};
    this.isPollingPaused = false;
    this.scrapingEnabled = false;
    this.initialScrapeDone = {};
    this.userDataDir = path.join(__dirname, '..', '..', 'user-data');
    this.activeTests = new Map();
    this.controlPanelPage = null;

    this.on('error', (error) => {
      console.error('DataFetcherService error:', error);
    });
  }

  async bringControlPanelToFront() {
    if (this.controlPanelPage && !this.controlPanelPage.isClosed()) {
        await this.controlPanelPage.bringToFront();
    } else {
        await this.ensureControlPanelOpen();
    }
  }

  async ensureControlPanelOpen() {
    if (!this.browser) return;
    try {
        const pages = await this.browser.pages();
        this.controlPanelPage = pages.find(p => p.url() === 'http://localhost:2137/' || p.url() === 'http://localhost:2137/index.html');

        if (this.controlPanelPage) {
            console.log('Control panel tab found, bringing to front and refreshing.');
            await this.controlPanelPage.bringToFront();
            await this.controlPanelPage.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] });
        } else {
            console.log('Control panel tab not found, opening new tab.');
            this.controlPanelPage = await this.browser.newPage();
            await this.controlPanelPage.goto('http://localhost:2137', { waitUntil: 'networkidle2' });
        }
    } catch (error) {
        console.error('Failed to ensure control panel is open:', error);
    }
  }

  async fetchYoutubeFollowers(apiKey, channelUrl) {
    if (!apiKey) {
      throw new Error('YouTube API Key is missing.');
    }
    if (!channelUrl) {
      throw new Error('YouTube Channel URL is missing.');
    }
    try {
      const url = new URL(channelUrl);
      const channelId = url.pathname.split('/').pop();
      if (!channelId) {
        throw new Error('Invalid YouTube channel URL.');
      }
      const apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`;
      const response = await axios.get(apiUrl);
      if (response.data.items.length === 0) {
        throw new Error('YouTube channel not found.');
      }
      const subscriberCount = response.data.items[0].statistics.subscriberCount;
      return parseInt(subscriberCount);
    } catch (error) {
      if (error.response && error.response.data && error.response.data.error) {
        const youtubeError = error.response.data.error;
        throw new Error(`YouTube API Error: ${youtubeError.message}`);
      }
      throw error;
    }
  }

  enableScraping() {
    this.scrapingEnabled = true;
  }

  disableScraping() {
    this.scrapingEnabled = false;
  }

  async initialize() {
    const browserConfig = this.stateManager.state.config.browser;
    console.log("Browser config from state:", browserConfig);

    if (browserConfig.connectionMode === 'connect') {
        this.browser = await this.connectToExistingBrowser();
        if (this.browser) {
            await this.ensureControlPanelOpen();
            this.browser.on('disconnected', () => {
                console.error('Browser connection lost. Reconnecting...');
                setTimeout(() => this.initialize(), 5000);
            });
            this.emit('initialized');
            return;
        } else {
            if(this.isEdgeRunning()){
                console.log("Edge is running but cannot connect. Closing Edge to launch with debugging...");
                await require('../utils/processCleanup').killEdgeProcesses();
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            console.log("No browser with remote debugging found. Launching Edge with remote debugging enabled...");
            const browserInfo = require('../utils/windowsDefaultBrowser').getDefaultBrowserInfo();
            if(browserInfo && browserInfo.executablePath){
                const { spawn } = require('child_process');
                const args = [
                    `--remote-debugging-port=${browserConfig.remoteDebuggingPort}`,
                    `--user-data-dir=${browserInfo.profilePath}`,
                    '--no-first-run',
                    '--no-default-browser-check'
                ];
                this.launchedEdgeProcess = spawn(browserInfo.executablePath, args);
                this.isOwnLaunch = true;
                await new Promise(resolve => setTimeout(resolve, 3000));
                this.browser = await this.connectToExistingBrowser();
                if(this.browser){
                    await this.ensureControlPanelOpen();
                    this.emit('initialized');
                    return;
                }
            }
        }
    }

    try {
        const browserInfo = require('../utils/windowsDefaultBrowser').getDefaultBrowserInfo();
        console.log("Browser info received:", JSON.stringify(browserInfo));

        let executablePath = this.getBrowserExecutablePath(browserConfig.type, browserConfig.customPath);
        let userDataDir = this.userDataDir;
        let useRealProfile = browserConfig.useRealProfile;

        if(browserConfig.manualProfilePath && require('fs').existsSync(browserConfig.manualProfilePath)){
            console.log("Using manually specified profile path");
            userDataDir = browserConfig.manualProfilePath;
        } else if (useRealProfile && browserInfo && browserInfo.profilePath && require('fs').existsSync(browserInfo.profilePath)) {
            console.log("Will use real profile: true");
            userDataDir = browserInfo.profilePath;
            console.log("Final userDataDir value:", userDataDir);
            console.log("Using real browser profile at:", userDataDir);
        } else {
            console.log("Will use real profile: false");
            userDataDir = path.join(__dirname, '..', '..', 'user-data');
            console.log("Final userDataDir value:", userDataDir);
            console.log("Using isolated profile at:", userDataDir);
            if (useRealProfile) {
                console.log("Warning: Real profile requested but path not found");
            }
        }

        const launchOptions = {
            executablePath,
            headless: false,
            userDataDir,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-infobars',
              '--disable-blink-features=AutomationControlled',
              '--disable-dev-shm-usage',
              '--disable-features=IsolateOrigins,site-per-process',
              '--disable-site-isolation-trials',
              '--excludeSwitches=enable-automation'
            ],
            ignoreHTTPSErrors: true,
            defaultViewport: null
        };
        console.log("Launch options:", JSON.stringify(launchOptions));

      this.browser = await puppeteer.launch(launchOptions);
      console.log("Browser launched successfully");
      if(this.browser.process()) {
        console.log("Browser executable:", this.browser.process().spawnfile);
      }

      this.browser.on('disconnected', () => {
        console.error('Browser disconnected. Attempting to reconnect...');
        setTimeout(() => this.initialize(), 5000);
      });
      console.log('Scraper browser initialized');
      this.emit('initialized');
    } catch (error) {
        console.error('Failed to initialize scraper:', error);
        if(error.message.includes('profile') || error.message.includes('locked') || error.message.includes('already running')){
            console.log('Browser already running with this profile, using isolated profile');
            this.stateManager.updateConfig({ browser: { ...this.stateManager.state.config.browser, useRealProfile: false } });
            return this.initialize();
        }
      this.emit('error', { type: 'initialization', error });
    }
  }

  startPolling(platform, config) {
    console.log(`startPolling called for ${platform}`);
    console.log(`Config:`, config);
    console.log(`Scraping enabled:`, this.scrapingEnabled);

    if (!config.enabled) {
      console.log(`Skipping ${platform}: not enabled`);
      return;
    }

    if (config.useApi) {
      if (platform === 'youtube' && (!config.apiKey || !config.url)) {
        console.log(`Skipping ${platform}: incomplete API config (missing API key or channel URL)`);
        this.emit('scrape-error', { platform, error: 'Incomplete API config (missing API key or channel URL)' });
        return;
      }
      if (platform === 'instagram' && (!config.accessToken || !config.userId)) {
        console.log(`Skipping ${platform}: incomplete API config (missing access token or user ID)`);
        this.emit('scrape-error', { platform, error: 'Incomplete API config (missing access token or user ID)' });
        return;
      }
      if (platform === 'facebook' && (!config.accessToken || !config.pageId)) {
        console.log(`Skipping ${platform}: incomplete API config (missing access token or page ID)`);
        this.emit('scrape-error', { platform, error: 'Incomplete API config (missing access token or page ID)' });
        return;
      }
    } else {
      if (!config.url || !config.selector) {
        console.log(`Skipping ${platform}: incomplete scraping config (missing URL or selector)`);
        this.emit('scrape-error', { platform, error: 'Incomplete scraping config (missing URL or selector)' });
        return;
      }
    }

    this.stopPolling(platform);

    const interval = this.stateManager.state.config.polling.interval || 10000;
    console.log(`Setting up polling interval: ${interval}ms`);

    this.initialScrapeDone[platform] = false;

    this.pollingIntervals[platform] = setInterval(async () => {
      if (this.scrapingEnabled) {
        await this.scrapePlatform(platform, config);
      }
    }, interval);

    console.log(`Doing initial scrape for ${platform}...`);
    this.scrapePlatform(platform, config);

    console.log(`Polling started for ${platform}`);
  }

  stopPolling(platform) {
    if (this.pollingIntervals[platform]) {
      clearInterval(this.pollingIntervals[platform]);
      delete this.pollingIntervals[platform];
    }
  }

  async fetchInstagramFollowers(accessToken, userId) {
    if (!accessToken || !userId) {
      throw new Error('Instagram Access Token or User ID is missing.');
    }
    try {
      const apiUrl = `https://graph.facebook.com/v12.0/${userId}?fields=followers_count&access_token=${accessToken}`;
      const response = await axios.get(apiUrl);
      const followerCount = response.data.followers_count;
      return parseInt(followerCount);
    } catch (error) {
      if (error.response && error.response.data && error.response.data.error) {
        const igError = error.response.data.error;
        throw new Error(`Instagram API Error: ${igError.message}`);
      }
      throw error;
    }
  }

  async fetchFacebookFollowers(accessToken, pageId) {
    if (!accessToken || !pageId) {
      throw new Error('Facebook Access Token or Page ID is missing.');
    }
    try {
      const apiUrl = `https://graph.facebook.com/v12.0/${pageId}?fields=fan_count&access_token=${accessToken}`;
      const response = await axios.get(apiUrl);
      const followerCount = response.data.fan_count;
      return parseInt(followerCount);
    } catch (error) {
      if (error.response && error.response.data && error.response.data.error) {
        const fbError = error.response.data.error;
        throw new Error(`Facebook API Error: ${fbError.message}`);
      }
      throw error;
    }
  }

  async scrapePlatform(platform, config) {
    if (config.useApi) {
      try {
        let followerCount;
        switch (platform) {
          case 'youtube':
            followerCount = await this.fetchYoutubeFollowers(config.apiKey, config.url);
            break;
          case 'tiktok':
            this.emit('scrape-error', { platform, error: 'TikTok API not yet supported.' });
            return;
          case 'instagram':
            followerCount = await this.fetchInstagramFollowers(config.accessToken, config.userId);
            break;
          case 'facebook':
            followerCount = await this.fetchFacebookFollowers(config.accessToken, config.pageId);
            break;
          default:
            throw new Error('Unsupported platform for API fetching.');
        }
        const isInitialScrape = !this.initialScrapeDone[platform];
        this.initialScrapeDone[platform] = true;
        this.emit('scrape-success', { 
          platform, 
          followerCount,
          isInitialScrape,
          source: 'api'
        });
      } catch (error) {
        this.emit('scrape-error', { platform, error: error.message });
      }
      return;
    }

    if (!config.url || !config.selector) {
      console.log(`Skipping ${platform}: incomplete scraping config`);
      return;
    }

    try {
      console.log(`Scraping ${platform}...`);

      if (!this.browser) {
        console.error('Browser is not initialized. Cannot scrape.');
        return;
      }

      if (!this.pages[platform] || this.pages[platform].isClosed()) {
        this.pages[platform] = await this.browser.newPage();
        await this.bringControlPanelToFront();
        const page = this.pages[platform];

        page.on('error', (error) => {
          console.error(`Page error for ${platform}:`, error.message);
        });
        page.on('pageerror', (error) => {
          console.error(`Page crash for ${platform}:`, error.message);
        });
        page.on('close', () => {
          console.log(`Page closed for ${platform}, will recreate on next scrape`);
          delete this.pages[platform];
        });


        await page.goto(config.url, { 
          waitUntil: 'networkidle2', 
          timeout: 30000 
        });
      }

      const page = this.pages[platform];

      if (page.isClosed()) {
        console.log(`Page was closed for ${platform}, recreating...`);
        delete this.pages[platform];
        return;
      }

      await page.reload({ waitUntil: 'networkidle2' });

      let elementHandle;
      if (config.selector.startsWith('/')) { // Simple XPath check
        elementHandle = await page.evaluateHandle((selector) => {
          const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          return result.singleNodeValue;
        }, config.selector);
      } else {
        await page.waitForSelector(config.selector, { timeout: 10000 });
        elementHandle = await page.$(config.selector);
      }

      if (!elementHandle || !elementHandle.asElement()) {
        throw new Error('Element not found');
      }

      const textContent = await page.evaluate(el => el.textContent, elementHandle);
      const followerCount = parseInt(textContent.replace(/[^0-9]/g, '')) || 0;

      await elementHandle.dispose();

      console.log(`${platform} follower count: ${followerCount}`);
      
      const isInitialScrape = !this.initialScrapeDone[platform];
      this.initialScrapeDone[platform] = true;

      this.emit('scrape-success', { 
        platform, 
        followerCount,
        isInitialScrape
      });

    } catch (error) {
      console.error(`Failed to scrape ${platform}:`, error.message);
      if (error.message.includes('closed') || error.message.includes('Target closed')) {
        console.log(`Page closed for ${platform}, will recreate next time`);
        delete this.pages[platform];
      }
      this.emit('scrape-error', { platform, error: error.message });
    }
  }

  pausePolling() {
    this.isPollingPaused = true;
    this.emit('polling-paused');
  }

  resumePolling() {
    this.isPollingPaused = false;
    this.emit('polling-resumed');
  }

  async closeAllPages() {
    console.log("Closing all scraper pages...");
    for (const platform in this.pages) {
      if (this.pages[platform] && !this.pages[platform].isClosed()) {
        await this.pages[platform].close();
        delete this.pages[platform];
        console.log(`Closed page for ${platform}`);
      }
    }
  }

  async cleanup() {
    console.log("Cleaning up scraper...");
    Object.keys(this.pollingIntervals).forEach(platform => {
      this.stopPolling(platform);
    });

    await this.closeAllPages();

    if (this.isOwnLaunch && this.launchedEdgeProcess) {
        this.launchedEdgeProcess.kill();
    }

    if (this.browser) {
        if (this.browser.isConnected()) {
            this.browser.disconnect();
        } else {
            await this.browser.close();
        }
        this.browser = null;
    }

    if (this.isOwnLaunch) {
        this.reopenEdgeNormally();
    }
    console.log("Cleanup complete");
  }

  isEdgeRunning() {
    try {
        const output = require('child_process').execSync('tasklist /FI "IMAGENAME eq msedge.exe"').toString();
        return output.includes('msedge.exe');
    } catch (error) {
        return false;
    }
  }

  async connectToExistingBrowser() {
    try {
        const browserURL = `http://localhost:${this.stateManager.state.config.browser.remoteDebuggingPort}`;
        console.log(`Attempting to connect to running browser on port ${this.stateManager.state.config.browser.remoteDebuggingPort}...`);
        const browser = await puppeteer.connect({ browserURL, defaultViewport: null });
        console.log("Connected to existing browser successfully");
        return browser;
    } catch (error) {
        console.log("Connection failed, browser not running with remote debugging");
        return null;
    }
  }

  getBrowserExecutablePath(browserType, customPath) {
    if (browserType === 'custom' && customPath) {
        console.log(`Using custom browser path: ${customPath}`);
        return customPath;
    }

    if (browserType === 'windows-default') {
        const defaultBrowser = require('../utils/windowsDefaultBrowser').getDefaultBrowserInfo();
        if (defaultBrowser) {
            console.log(`Detected Windows default browser: ${defaultBrowser.name} at ${defaultBrowser.executablePath}`);
            return defaultBrowser.executablePath;
        }
        console.log('Could not detect default browser, trying fallback...');
    }

    const pathsToCheck = {
        edge: [
            "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
            "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
            "C:/Program Files (x86)/Microsoft/Edge Beta/Application/msedge.exe"
        ],
        chrome: [
            "C:/Program Files/Google/Chrome/Application/chrome.exe",
            "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
        ]
    };

    const browsersToTry = ['edge', 'chrome'];
    for (const browser of browsersToTry) {
        const paths = pathsToCheck[browser];
        if (paths) {
            for (const p of paths) {
                console.log(`Checking for ${browser} at path: ${p}`);
                if (require('fs').existsSync(p)) {
                    console.log("Path exists:", true);
                    console.log(`Using executable path: ${p}`);
                    return p;
                }
                console.log("Path exists:", false);
            }
        }
    }

    console.log("Not found, using default Chromium");
    return undefined;
  }

  async testSelector(platform, url, selector, timeout = 15000) { // Increased timeout
    console.log(`Testing selector for ${platform}: ${selector}`);
    let testPage = null;
    try {
      testPage = await this.browser.newPage();
      await testPage.goto(url, {
        waitUntil: 'networkidle2', // More robust waiting
        timeout: 30000
      });

      let elementHandle;
      if (selector.startsWith('/')) { // Simple XPath check
        console.log('Treating selector as XPath');
        elementHandle = await testPage.evaluateHandle((selector) => {
          const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          return result.singleNodeValue;
        }, selector);
      } else {
        console.log('Treating selector as CSS selector');
        await testPage.waitForSelector(selector, { timeout });
        elementHandle = await testPage.$(selector);
      }

      if (!elementHandle || !elementHandle.asElement()) {
        throw new Error('Element not found');
      }

      // Wait for the element to have some text content
      await testPage.waitForFunction(
        (el) => el && el.textContent.trim().length > 0,
        { timeout: 5000 },
        elementHandle
      );

      const textContent = await testPage.evaluate(el => el.textContent, elementHandle);
      const followerCount = parseInt(textContent.replace(/[^0-9]/g, '')) || 0;

      await elementHandle.dispose();
      await testPage.close();
      await this.bringControlPanelToFront();

      console.log(`Test successful: Found ${followerCount} followers`);
      return {
        platform,
        success: true,
        followerCount,
        message: `Selector works! Current count: ${followerCount}`
      };
    } catch (error) {
      console.error(`Test failed:`, error.message);
      if (testPage && !testPage.isClosed()) {
        await testPage.screenshot({ path: 'tiktok-test-error-screenshot.png' });
        await testPage.close();
      }
      await this.bringControlPanelToFront();
      return {
        platform,
        success: false,
        error: error.message,
        message: `Test failed: ${error.message}`
      };
    }
  }

  cancelTest(platform) {
    const test = this.activeTests.get(platform);
    if (test) {
        test.canceled = true;
        if(test.page) {
            test.page.close();
        }
    }
  }

  async verifyBrowserLaunch() {
    let browser = null;
    try {
        const browserConfig = this.stateManager.state.config.browser;
        const executablePath = this.getBrowserExecutablePath(browserConfig.type, browserConfig.customPath);
        const launchOptions = {
            executablePath,
            headless: false,
        };
        browser = await puppeteer.launch(launchOptions);
        const version = await browser.version();
        await browser.close();
        return { success: true, browserName: browserConfig.type, version, path: executablePath };
    } catch (error) {
        if (browser) {
            await browser.close();
        }
        return { success: false, error: error.message };
    }
  }

  async testApiKey(platform, apiKey, channelUrl) {
    console.log(`testApiKey called in DataFetcherService for ${platform}`);
    try {
      let followerCount;
      switch (platform) {
        case 'youtube':
          followerCount = await this.fetchYoutubeFollowers(apiKey, channelUrl);
          break;
        // other platforms can be added here
        default:
          throw new Error('Unsupported platform for API key testing.');
      }
      console.log(`testApiKey for ${platform} successful`);
      return { platform, success: true };
    } catch (error) {
      console.error(`testApiKey for ${platform} failed:`, error);
      return { platform, success: false, error: error.message };
    }
  }

  reopenEdgeNormally() {
    if (!this.isOwnLaunch) {
      console.log("Did not launch Edge ourselves, not reopening");
      return;
    }
    if (!this.stateManager.state.config.browser.reopenOnExit) {
        console.log("Reopen on exit is disabled");
        return;
    }

    console.log("Reopening Edge in normal mode...");

    const { spawn } = require('child_process');
    const browserInfo = require('../utils/windowsDefaultBrowser').getDefaultBrowserInfo();

    if (browserInfo && browserInfo.executablePath) {
        spawn(browserInfo.executablePath, [], {
            detached: true,
            stdio: 'ignore'
        }).unref();
        console.log("Edge reopened in normal mode");
    }
  }

  async closeAllPages() {
    console.log("Closing all scraper pages...");
    for (const platform in this.pages) {
      if (this.pages[platform] && !this.pages[platform].isClosed()) {
        await this.pages[platform].close();
        delete this.pages[platform];
        console.log(`Closed page for ${platform}`);
      }
    }
  }

  async detectPlatformURL(platform) {
    try {
      console.log(`Detecting URL for ${platform}...`);
      if (platform === 'tiktok') {
          return 'https://www.tiktok.com/tiktokstudio';
      }
      let page = null;
      try {
          page = await this.browser.newPage();
          page.on('error', (error) => {
            console.error(`Temp page error:`, error.message);
          });
          const urls = {
              youtube: 'https://studio.youtube.com',
              instagram: 'https://business.facebook.com/latest/insights/people',
              facebook: 'https://business.facebook.com/latest/insights/people'
          };
          await page.goto(urls[platform], { waitUntil: 'networkidle2', timeout: 30000 });
          await new Promise(resolve => setTimeout(resolve, 2000));
          let finalUrl = page.url();
          if (finalUrl.includes('business.facebook.com')) {
            const url = new URL(finalUrl);
            url.searchParams.set('platform', platform.charAt(0).toUpperCase() + platform.slice(1));
            finalUrl = url.toString();
          }
          if (!page.isClosed()) {
            await page.close();
          }
          await this.bringControlPanelToFront();
          console.log(`Detected URL for ${platform}: ${finalUrl}`);
          return finalUrl;
      } catch (error) {
          if (page && !page.isClosed()) {
              await page.close();
          }
          await this.bringControlPanelToFront();
          throw error;
      }
    } catch (error) {
        console.error(`Failed to detect URL for ${platform}:`, error.message);
        throw error;
    }
  }
}

module.exports = DataFetcherService;
