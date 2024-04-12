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
4. Run the node application with `node --env-file=.env built/index.js`

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
    ExecStart=<path-to-node-executable> --env-file=.env built/index.js
    WorkingDirectory=<path-to-repository>
    Restart=on-failure

    [Install]
    WantedBy=multi-user.target
   ```
2. Activate the service with `sudo systemctl enable htwk-qis-grade-notification-bot`
3. Start the service with `sudo systemctl start htwk-qis-grade-notification-bot`

#### Access logs
To access the logs execute `journalctl -u htwk-qis-grade-notification-bot.service`

#### FNM (FastNodeManager)
In combination with [fnm](https://github.com/Schniz/fnm) we need a script that initializes fnm before we can use `node`.

Create the following `run-htwk-qis-grade-notification-bot.sh` file and make it executeable with `chmod +x run-htwk-qis-grade-notification-bot.sh`
```bash
#!/bin/bash
export PATH="/home/<user>/.local/share/fnm:$PATH";
eval "`fnm env --shell bash`";

node --env-file=.env built/index.js;
```

In `/lib/systemd/system/htwk-qis-grade-notification-bot.service` we change the `ExecStart` line to:
```
ExecStart: <path-to-file>/run-htwk-qis-grade-notification-bot.sh
```

## Development
`yarn tsc && node --env-file=.env built/index.js`