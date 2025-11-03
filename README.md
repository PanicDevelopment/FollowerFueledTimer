# Follower-Fueled Timer

<p align="center">
  <img src="https://raw.githubusercontent.com/PanicDevelopment/FollowerFueledTimer/master/public/icon.png" width="128" alt="Follower-Fueled Timer Logo">
</p>

<p align="center">
  A unique, open-source tool that increases a countdown timer based on new social media followers, designed for live streaming.
</p>

---

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Disclaimer](#disclaimer)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Live Stream Integration](#live-stream-integration)
- [Support & Contribution](#support--contribution)
- [License](#license)

## Features

- **Follower-Driven Timer**: Engage your community by letting your follower growth directly extend your stream's countdown.
- **Multi-Platform Support**: Track follower counts from YouTube, TikTok, Instagram, and Facebook.
- **API & Scraping**: Use the official YouTube API for reliability or the built-in web scraper for other platforms.
- **Real-time Updates**: Uses Socket.io to instantly update the timer and follower counts on your stream.
- **Customizable Widgets**: A full suite of browser-source widgets for your streaming software (OBS, Streamlabs, etc.).
- **Web Control Panel**: An easy-to-use local web interface to control the timer, manage platforms, and view live stats.
- **Secure**: Your sensitive information, like API keys, is encrypted locally on your machine.

## How It Works

The application runs a local Node.js server on your computer. It uses [Puppeteer](https://pptr.dev/) to automate a web browser (currently Microsoft Edge) to log in to your social media accounts and monitor your follower counts. For YouTube, it can also use the official YouTube Data API for a more stable connection.

## Disclaimer

This tool is provided as-is. The author is not responsible for any potential damage to your social media accounts or any other consequences of using this tool.

- **Use at Your Own Risk**: Web scraping can be against the Terms of Service of some platforms.
- **Request Limits**: Setting the 'Polling Interval' to a very low value may result in a high number of requests, which could lead to temporary blocks or account restrictions.

It is highly recommended to use the official API method for supported platforms (like YouTube).

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS version recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- **Microsoft Edge** browser installed on your computer.

## Installation

1.  **Download the code:**
    -   Go to the [GitHub Releases page](https://github.com/PanicDevelopment/FollowerFueledTimer/releases) and download the latest source code zip file.
    -   OR, clone the repository using Git:
        ```bash
        git clone https://github.com/PanicDevelopment/FollowerFueledTimer.git
        ```

2.  **Navigate to the directory:**
    ```bash
    cd FollowerFueledTimer
    ```

3.  **Install dependencies:**
    ```bash
    npm install
    ```

## Configuration

1.  **Start the application:**
    ```bash
    npm start
    ```
    This will launch the server and should automatically open the control panel in Microsoft Edge.

2.  **Open the Control Panel:** If it doesn't open automatically, navigate to [http://localhost:2137](http://localhost:2137) in your browser.

3.  **Configure Platforms:** Use the web interface to enable the platforms you want to track, enter your profile URLs, and provide API keys or login credentials where necessary. The first time you use a platform that requires a login, the automated browser will be paused, allowing you to enter your credentials securely. Your session will be saved for future use.

**IMPORTANT:** The configuration is encrypted and stored locally in the `config.json.enc` file. This encryption is tied to your computer, meaning the file is **not portable**. If you move the project to a new machine, you will need to re-configure the application.

## Live Stream Integration

The application provides several widgets that can be added as "Browser" sources in your live streaming software. For optimal performance, it is recommended to enable `Shutdown source when not visible` for each browser source.

- **Main Timer**: `http://localhost:2137/widget/timer`
- **YouTube Stats**: `http://localhost:2137/widget/youtube`
- **TikTok Stats**: `http://localhost:2137/widget/tiktok`
- **Instagram Stats**: `http://localhost:2137/widget/instagram`
- **Facebook Stats**: `http://localhost:2137/widget/facebook`
- **Total Followers**: `http://localhost:2137/widget/total-followers`
- **Total Time Added**: `http://localhost:2137/widget/total-time`
- **Follower Goal**: `http://localhost:2137/widget/goal`
- **Sound Alert**: `http://localhost:2137/widget/audio`

## Support & Contribution

This is a passion project, and any support is greatly appreciated! If you find this tool useful, please consider supporting its development.

- **YouTube (Food & Travel)**: [youtube.com/@TravelInPanic](https://www.youtube.com/@TravelInPanic)
- **GitHub**: [PanicDevelopment](https://github.com/PanicDevelopment)
- **Ko-Fi**: [ko-fi.com/TravelInPanic](https://ko-fi.com/TravelInPanic)
- **PayPal**: [paypal.me/PrzemekZK](https://www.paypal.me/PrzemekZK)
- **Revolut**: [revolut.me/przemyr1r](https://www.revolut.me/przemyr1r)
- **Crypto**: [commerce.coinbase.com/checkout/9f70e8c5-3894-4983-a8da-6663352129b8](https://commerce.coinbase.com/checkout/9f70e8c5-3894-4983-a8da-6663352129b8)

Found a bug or have a feature request? Please [open an issue](https://github.com/PanicDevelopment/FollowerFueledTimer/issues) on GitHub.

## License

This project is licensed under the **GNU AGPLv3 License**. See the `LICENSE` file for details. This means you are free to use, study, share, and modify the software. However, if you distribute a modified version, you must also share your source code.