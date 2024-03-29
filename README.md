# qis-grade-notification

## Run project
1. Install dependencies with `yarn install`. 
2. Compile ts to js with `yarn tsc`.
3. Create the `.env` file as below.
    ```
    TELEGRAM_BOT_SECRET=<bot-secret>
    QIS_USERNAME=<username>
    QIS_PASSWORD=<password>
    PRIVATE_USER_ID=<user-id of user who gets the actuall grade and additional information like logging>
    ````
1. Run the node application with `node --env-file=.env built/index.js`

### On Raspberry PI
Puppitter installs a non ARM compatible version of Chrome that can't be used on a raspberry pi.
Instead chrome must be installed manually (raspi os has chrome already installed) and the path has to be set where the puppitter browser instance is created.   

`sudo apt-get install chromium-browser`
```   

const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium-browser',
});
```

### serviced
#### setup
1. Create `/lib/systemd/system/htwk-qis-grade-notification-bot.service`
   ```
   [Unit]
    Description=htwk-qis-grade-notification-bot
    Documentation=https://github.com/kmathmann/htwk-qis-grade-notification-bot
    After=network.target

    [Service]
    Type=simple
    User=<username>
    ExecStart=<path-to-node-executable> --env-file=.env <path-to-repository>/built/index.js
    WorkingDirectory=<path-to-repository>
    Restart=on-failure

    [Install]
    WantedBy=multi-user.target
   ```
2. Activate the service with `sudo systemctl enable htwk-qis-grade-notification-bot`
3. Start the service with `sudo systemctl start htwk-qis-grade-notification-bot`

#### Access logs
To access the logs execute `journalctl -u htwk-qis-grade-notification-bot.service`

## Development
`yarn tsc && node --env-file=.env built/index.js`